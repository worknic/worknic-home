import {
  randomBytes,
  randomUUID,
  createHash,
  createHmac,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { TradeError, passwordHash } from "./store.mjs";
import { installAftercare } from "./aftercare.mjs";
const fail = (m, s = 400) => {
    throw new TradeError(m, s);
  },
  str = (v, n = 200) => (typeof v === "string" ? v.trim().slice(0, n) : ""),
  hash = (v) => createHash("sha256").update(v).digest("hex"),
  keyOf = (p, o) => p + ":" + o;
export function installBeta(
  api,
  db,
  { clock, transaction, audit, adminOnly, customerOnly, settings, release },
  { pickupKey = "", approvalRequired = true } = {},
) {
  db.exec(`CREATE TABLE IF NOT EXISTS beta_sku_stock (key TEXT PRIMARY KEY,stock INTEGER NOT NULL DEFAULT 0,enabled INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE IF NOT EXISTS beta_prices (key TEXT PRIMARY KEY,product_id TEXT NOT NULL,option_id TEXT NOT NULL,value TEXT NOT NULL,revision INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS beta_imports (id TEXT PRIMARY KEY,actor TEXT NOT NULL,rows TEXT NOT NULL,created_at INTEGER NOT NULL,expires INTEGER NOT NULL,status TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS beta_bindings (member_id TEXT PRIMARY KEY,request_id TEXT NOT NULL,activated INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE IF NOT EXISTS beta_activations (hash TEXT PRIMARY KEY,member_id TEXT NOT NULL,expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS beta_quotes (id TEXT PRIMARY KEY,member_id TEXT NOT NULL,request_key TEXT NOT NULL,status TEXT NOT NULL,value TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,UNIQUE(member_id,request_key));
  CREATE TABLE IF NOT EXISTS beta_locations (id TEXT PRIMARY KEY,value TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE IF NOT EXISTS beta_slots (id TEXT PRIMARY KEY,location_id TEXT NOT NULL,label TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS beta_pickups (order_id TEXT PRIMARY KEY,slot_id TEXT UNIQUE NOT NULL,value TEXT NOT NULL,secret TEXT,status TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE IF NOT EXISTS beta_handoffs (order_id TEXT PRIMARY KEY,value TEXT NOT NULL,status TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE IF NOT EXISTS beta_config (id INTEGER PRIMARY KEY CHECK(id=1),value TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1);`);
  db.prepare("INSERT OR IGNORE INTO beta_config VALUES(1,?,1)").run(
    JSON.stringify({
      betaEnabled: false,
      registrationEnabled: false,
      documentsConfirmed: false,
    }),
  );
  const defaults = [
    [
      "jinjeop",
      {
        name: "진접 픽업",
        address: "진접중학교 앞",
        hours: "월~금 오후 7시~11시 · 토·일 휴무",
        noticeUrl: "https://smartstore.naver.com/worknic_korea",
        enabled: false,
        fee: 0,
        sourceVerified: false,
      },
    ],
    [
      "pocheon_after_hours",
      {
        name: "포천 매장 영업시간 외 수령",
        address: "경기도 포천시 화현면 화동로348번길 5-1",
        hours: "주문별 준비 완료 안내에서 확인",
        noticeUrl: "https://worknic.co.kr/space/",
        enabled: false,
        fee: 0,
        sourceVerified: false,
      },
    ],
  ];
  for (const [id, v] of defaults)
    db.prepare("INSERT OR IGNORE INTO beta_locations VALUES(?,?,1)").run(
      id,
      JSON.stringify(v),
    );
  const config = () => {
      const r = db.prepare("SELECT * FROM beta_config WHERE id=1").get();
      return { ...JSON.parse(r.value), revision: r.revision };
    },
    source = (id) => {
      const r = db.prepare("SELECT * FROM products WHERE id=?").get(id);
      if (!r) fail("등록 상품을 확인해 주세요.");
      return { row: r, ...JSON.parse(r.source) };
    };
  const sku = (id, option) => {
    const p = source(id),
      opts = p.variants || [];
    if (p.published === false) fail("현재 공개된 상품인지 확인해 주세요.", 409);
    if (opts.length) {
      if (!opts.some((x) => String(x.sourceId || x.id || "") === option))
        fail("등록된 옵션번호를 확인해 주세요.");
    } else if (option !== "default")
      fail("단품 옵션번호는 default로 입력해 주세요.");
    return p;
  };
  const price = (id, option) => {
    const p = sku(id, option),
      r = db
        .prepare("SELECT * FROM beta_prices WHERE key=?")
        .get(keyOf(id, option));
    return {
      productId: id,
      optionId: option,
      brand: p.brand,
      name: p.name,
      model: p.model,
      optionLabel:
        (p.variants || []).find((v) => String(v.sourceId || v.id) === option)
          ?.option || "",
      unit: "",
      price: null,
      taxMode: "",
      effectiveOn: "",
      ...(r ? JSON.parse(r.value) : {}),
      revision: r?.revision || 0,
    };
  };
  const locations = () =>
    db
      .prepare("SELECT * FROM beta_locations ORDER BY id")
      .all()
      .map((r) => ({ id: r.id, ...JSON.parse(r.value), revision: r.revision }));
  const binding = (actor) =>
    db.prepare("SELECT * FROM beta_bindings WHERE member_id=?").get(actor.id);
  const customer = (actor) => {
    customerOnly(actor);
    if (approvalRequired && !binding(actor)?.activated)
      fail("사업자 승인과 계정 본인 확인을 완료해 주세요.", 403);
  };
  const own = (actor, member) => {
    if (actor.role !== "admin" && actor.id !== member)
      fail("해당 내역을 찾을 수 없습니다.", 404);
  };
  const quoteRow = (r) =>
    r && {
      ...JSON.parse(r.value),
      id: r.id,
      memberId: r.member_id,
      status: r.status,
      revision: r.revision,
    };
  const getQuote = (actor, id) => {
    const r = db.prepare("SELECT * FROM beta_quotes WHERE id=?").get(id);
    if (!r) fail("견적을 찾을 수 없습니다.", 404);
    own(actor, r.member_id);
    return quoteRow(r);
  };
  const publicPickup = (r) => {
    if (!r) return null;
    const v = JSON.parse(r.value);
    return {
      orderId: r.order_id,
      slotId: r.slot_id,
      ...v,
      status: r.status,
      revision: r.revision,
    };
  };
  const activeOrder = (actor, id) => {
    const row = db.prepare("SELECT * FROM orders WHERE id=?").get(id);
    if (!row) fail("주문을 찾을 수 없습니다.", 404);
    own(actor, row.member_id);
    const o = {
      ...JSON.parse(row.snapshot),
      id: row.id,
      status: row.status,
      revision: row.revision,
    };
    if (!o.fulfillment || o.fulfillment.method !== "pickup")
      fail("픽업 주문이 아닙니다.");
    return o;
  };
  const vault =
    pickupKey && /^[a-f0-9]{64}$/i.test(pickupKey)
      ? Buffer.from(pickupKey, "hex")
      : null;
  const encrypt = (pin, aad) => {
    if (!vault) fail("픽업 비밀번호 보관 설정을 확인해 주세요.", 503);
    const iv = randomBytes(12),
      c = createCipheriv("aes-256-gcm", vault, iv);
    c.setAAD(Buffer.from(aad));
    return [
      iv.toString("hex"),
      Buffer.concat([c.update(pin, "utf8"), c.final()]).toString("hex"),
      c.getAuthTag().toString("hex"),
    ].join(":");
  };
  const decrypt = (value, aad) => {
    try {
      const [iv, body, tag] = value.split(":"),
        c = createDecipheriv("aes-256-gcm", vault, Buffer.from(iv, "hex"));
      c.setAAD(Buffer.from(aad));
      c.setAuthTag(Buffer.from(tag, "hex"));
      return Buffer.concat([
        c.update(Buffer.from(body, "hex")),
        c.final(),
      ]).toString("utf8");
    } catch {
      fail("비밀번호를 확인할 수 없습니다. 담당자에게 문의해 주세요.", 503);
    }
  };
  function validateRows(rows) {
    if (!Array.isArray(rows) || !rows.length || rows.length > 5000)
      fail("1~5,000개 상품 행을 확인해 주세요.");
    const counts = new Map();
    for (const r of rows) {
      const k = keyOf(String(r["상품번호"] || ""), String(r["옵션번호"] || ""));
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    return rows.map((r, i) => {
      const errors = [];
      let before = null,
        after = null;
      try {
        const id = String(r["상품번호"] ?? "").trim(),
          option = String(r["옵션번호"] ?? "").trim();
        if (
          !/^[A-Za-z0-9_-]{1,80}$/.test(id) ||
          !/^[A-Za-z0-9_-]{1,80}$/.test(option)
        )
          fail("상품번호·옵션번호 확인");
        if (counts.get(keyOf(id, option)) > 1)
          fail("같은 상품·옵션이 중복됐습니다.");
        before = price(id, option);
        if (Number(r["수정번호"]) !== before.revision)
          fail("수정번호 변경 · 최신 양식을 내려받으세요.");
        if (!["확정", "미정"].includes(r["가격상태"]))
          fail("가격상태는 확정 또는 미정");
        const amount =
          r["판매가"] === "" || r["판매가"] == null ? null : r["판매가"];
        if (
          r["가격상태"] === "확정" &&
          (!Number.isSafeInteger(amount) || amount <= 0 || amount > 100000000)
        )
          fail("확정 판매가는 1~100,000,000원 정수");
        if (r["가격상태"] === "미정" && amount !== null)
          fail("미정 상품은 판매가를 비워 주세요.");
        const unit = str(r["판매단위"], 80),
          tax = str(r["부가세기준"], 10),
          date = str(r["적용일"], 10);
        if (
          r["가격상태"] === "확정" &&
          (!unit ||
            !["포함", "별도"].includes(tax) ||
            !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
            new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date)
        )
          fail("판매단위·부가세기준·적용일 확인");
        if (
          date &&
          date > new Date(clock() + 9 * 3600000).toISOString().slice(0, 10)
        )
          fail("미래 적용일은 해당 날짜에 다시 적용해 주세요.");
        after = {
          ...before,
          unit,
          price: amount,
          taxMode: tax,
          effectiveOn: date,
          revision: before.revision + 1,
        };
      } catch (e) {
        errors.push(e.message);
      }
      return { row: r.row || i + 2, before, after, errors };
    });
  }
  const aftercare = installAftercare(api, db, {
    clock,
    transaction,
    audit,
    adminOnly,
    customerOnly,
    release,
  });
  return {
    ...aftercare,
    config,
    locations,
    binding,
    inventory(actor) {
      adminOnly(actor);
      return api.products(actor).flatMap((p) =>
        (p.variants?.length ? p.variants : [{ id: "default" }]).map((v) => {
          const optionId = String(v.sourceId || v.id),
            r = db
              .prepare("SELECT * FROM beta_sku_stock WHERE key=?")
              .get(keyOf(p.id, optionId));
          return {
            ...p,
            optionId,
            optionLabel: v.name || v.label || v.option || optionId,
            stock: optionId === "default" ? p.stock : r?.stock || 0,
            enabled: optionId === "default" ? p.enabled : !!r?.enabled,
            revision: optionId === "default" ? p.revision : r?.revision || 0,
          };
        }),
      );
    },
    updateInventory(actor, id, input) {
      adminOnly(actor);
      const p = sku(id, input.optionId);
      if (input.optionId === "default" && !(p.variants || []).length)
        return api.updateStock(actor, id, input);
      if (
        !Number.isInteger(input.stock) ||
        input.stock < 0 ||
        input.stock > 1000000 ||
        typeof input.enabled !== "boolean"
      )
        fail("옵션별 수량 확인");
      const key = keyOf(id, input.optionId),
        old = db.prepare("SELECT * FROM beta_sku_stock WHERE key=?").get(key);
      if ((old?.revision || 0) !== input.revision)
        fail("옵션 수량이 변경됐습니다.", 409);
      db.prepare(
        "INSERT INTO beta_sku_stock VALUES(?,?,?,1) ON CONFLICT(key) DO UPDATE SET stock=excluded.stock,enabled=excluded.enabled,revision=beta_sku_stock.revision+1",
      ).run(key, input.stock, Number(input.enabled));
      audit(actor, "product.option_stock_updated", key, {
        stock: input.stock,
        enabled: input.enabled,
      });
      return { ok: true };
    },
    runtime: () => ({
      betaEnabled: config().betaEnabled,
      registrationEnabled: config().registrationEnabled,
      policies: {
        defectShipping:
          config().defectShipping?.value ===
          "worknic_pays_collection_reshipment"
            ? "상품 불량이나 오배송이 확인된 경우 교환·반품에 필요한 회수비와 재발송비는 모두 워크닉이 부담합니다. 단순 변심 비용 기준과 구분하며 고객에게 해당 배송비를 청구하거나 환불액에서 차감하지 않습니다."
            : null,
        standardOutboundShipping:
          config().standardOutboundShipping?.value ===
          "worknic_pays_outbound_full_return"
            ? "일반 재고 상품을 택배 수령 후 전량 단순 변심 반품할 때 최초 발송 배송비는 무료배송 주문을 포함해 워크닉이 부담합니다. 고객에게 최초 발송 비용을 추가 청구하거나 환불액에서 차감하지 않습니다. 반품 회수 배송비는 고객 부담이며 무료 픽업에는 적용하지 않습니다."
            : null,
        standardReturnShipping:
          config().standardReturnShipping?.value === "customer_pays_collection"
            ? "일반 재고 상품의 단순 변심 반품 회수 배송비는 고객이 부담합니다. 실제 비용과 정산 방식은 반품 접수 후 안내하며 임의로 자동 공제하지 않습니다. 최초 배송비와 불량·오배송 비용은 별도 기준으로 안내합니다."
            : null,
        standardReturnCondition:
          config().standardReturnCondition?.value ===
          "unused_complete_outer_box_open_allowed"
            ? "일반 재고 상품은 제품 미사용, 구성품·라벨·포장이 온전히 보존된 경우 외부 박스 개봉만으로 단순 변심 반품을 제한하지 않습니다."
            : null,
        standardReturnPeriod:
          config().standardReturnPeriod?.days === 7
            ? "일반 재고 상품의 단순 변심 반품은 실제 수령 다음날부터 7일 이내에 신청합니다."
            : null,
        specialOrderCancellation:
          config().specialOrderCancellation?.value ===
          "full_before_start_agreement_after"
            ? "주문제작·별도 발주 상품의 단순 변심 취소는 제작·발주 전 전액 환불, 시작 후 건별 협의로 처리합니다."
            : null,
        standardPreReceiptCancellation:
          config().standardPreReceiptCancellation?.value === "full_refund"
            ? "일반 재고 상품은 수령 전 취소 시 남은 입금액 전액을 환불합니다. 담당자가 상품 준비·전달을 중단한 뒤 처리합니다."
            : null,
      },
      locations: locations().map(
        ({ id, name, address, hours, enabled, fee }) => ({
          id,
          name,
          address,
          hours,
          enabled,
          fee,
        }),
      ),
      approvalRequired,
    }),
    updateConfig(actor, input) {
      adminOnly(actor);
      const old = config();
      if (input.revision !== old.revision)
        fail("운영 설정이 변경됐습니다.", 409);
      if (
        typeof input.betaEnabled !== "boolean" ||
        typeof input.registrationEnabled !== "boolean"
      )
        fail("접수 상태 확인");
      if (input.betaEnabled && (!input.documentsConfirmed || !vault))
        fail("문서·부가세·픽업 비밀번호 보관 설정 확인 후 접수를 열어 주세요.");
      const next = {
        ...old,
        betaEnabled: input.betaEnabled,
        registrationEnabled: input.registrationEnabled,
        documentsConfirmed: input.documentsConfirmed === true,
      };
      delete next.revision;
      db.prepare(
        "UPDATE beta_config SET value=?,revision=revision+1 WHERE id=1",
      ).run(JSON.stringify(next));
      audit(actor, "beta.config", "beta");
      return config();
    },
    confirmStandardCancellation(actor, input) {
      adminOnly(actor);
      return transaction(() => {
        const current = config();
        if (input.revision !== current.revision)
          fail("운영 설정이 변경됐습니다. 다시 확인해 주세요.", 409);
        if (input.value !== "full_refund" || input.confirmed !== true)
          fail("일반 재고 상품의 수령 전 전액 환불 기준을 확인해 주세요.");
        const next = {
          ...current,
          standardPreReceiptCancellation: {
            value: "full_refund",
            scope: "standard_stock",
            confirmedAt: clock(),
            confirmedBy: actor.username,
          },
        };
        delete next.revision;
        db.prepare(
          "UPDATE beta_config SET value=?,revision=revision+1 WHERE id=1",
        ).run(JSON.stringify(next));
        audit(actor, "policy.standard_pre_receipt_confirmed", "beta", {
          value: "full_refund",
          scope: "standard_stock",
        });
        return config();
      });
    },
    confirmSpecialCancellation(actor, input) {
      adminOnly(actor);
      return transaction(() => {
        const current = config();
        if (input.revision !== current.revision)
          fail("운영 설정이 변경됐습니다. 다시 확인해 주세요.", 409);
        if (
          input.value !== "full_before_start_agreement_after" ||
          input.confirmed !== true
        )
          fail("주문제작·별도 발주 상품의 취소 기준을 확인해 주세요.");
        const next = {
          ...current,
          specialOrderCancellation: {
            value: input.value,
            scope: "special_order_change_of_mind",
            confirmedAt: clock(),
            confirmedBy: actor.username,
          },
        };
        delete next.revision;
        db.prepare(
          "UPDATE beta_config SET value=?,revision=revision+1 WHERE id=1",
        ).run(JSON.stringify(next));
        audit(actor, "policy.special_order_confirmed", "beta", {
          value: input.value,
        });
        return config();
      });
    },
    confirmStandardReturnPeriod(actor, input) {
      adminOnly(actor);
      return transaction(() => {
        const current = config();
        if (input.revision !== current.revision)
          fail("운영 설정이 변경됐습니다. 다시 확인해 주세요.", 409);
        if (input.days !== 7 || input.confirmed !== true)
          fail(
            "일반 재고 상품의 수령 다음날부터 7일 이내 반품 접수 기준을 확인해 주세요.",
          );
        const next = {
          ...current,
          standardReturnPeriod: {
            days: 7,
            scope: "standard_stock_change_of_mind",
            confirmedAt: clock(),
            confirmedBy: actor.username,
          },
        };
        delete next.revision;
        db.prepare(
          "UPDATE beta_config SET value=?,revision=revision+1 WHERE id=1",
        ).run(JSON.stringify(next));
        audit(actor, "policy.standard_return_period_confirmed", "beta", {
          days: 7,
        });
        return config();
      });
    },
    confirmStandardReturnCondition(actor, input) {
      adminOnly(actor);
      return transaction(() => {
        const current = config();
        if (input.revision !== current.revision)
          fail("운영 설정이 변경됐습니다. 다시 확인해 주세요.", 409);
        if (
          input.value !== "unused_complete_outer_box_open_allowed" ||
          input.confirmed !== true
        )
          fail(
            "제품 미사용·구성품·라벨·포장 보존 및 외부 박스 개봉 허용 기준을 확인해 주세요.",
          );
        const next = {
          ...current,
          standardReturnCondition: {
            value: input.value,
            scope: "standard_stock_change_of_mind",
            confirmedAt: clock(),
            confirmedBy: actor.username,
          },
        };
        delete next.revision;
        db.prepare(
          "UPDATE beta_config SET value=?,revision=revision+1 WHERE id=1",
        ).run(JSON.stringify(next));
        audit(actor, "policy.standard_return_condition_confirmed", "beta", {
          value: input.value,
        });
        return config();
      });
    },
    confirmStandardReturnShipping(actor, input) {
      adminOnly(actor);
      return transaction(() => {
        const current = config();
        if (input.revision !== current.revision)
          fail("운영 설정이 변경됐습니다. 다시 확인해 주세요.", 409);
        if (
          input.value !== "customer_pays_collection" ||
          input.confirmed !== true
        )
          fail(
            "일반 재고 단순 변심 반품의 회수 배송비 고객 부담 기준을 확인해 주세요.",
          );
        const next = {
          ...current,
          standardReturnShipping: {
            value: input.value,
            scope: "standard_stock_change_of_mind",
            confirmedAt: clock(),
            confirmedBy: actor.username,
          },
        };
        delete next.revision;
        db.prepare(
          "UPDATE beta_config SET value=?,revision=revision+1 WHERE id=1",
        ).run(JSON.stringify(next));
        audit(actor, "policy.standard_return_shipping_confirmed", "beta", {
          value: input.value,
        });
        return config();
      });
    },
    confirmStandardOutboundShipping(actor, input) {
      adminOnly(actor);
      return transaction(() => {
        const current = config();
        if (input.revision !== current.revision)
          fail("운영 설정이 변경됐습니다. 다시 확인해 주세요.", 409);
        if (
          input.value !== "worknic_pays_outbound_full_return" ||
          input.confirmed !== true
        )
          fail(
            "택배 전량 단순 변심 반품의 최초 발송 배송비 워크닉 부담 기준을 확인해 주세요.",
          );
        const next = {
          ...current,
          standardOutboundShipping: {
            value: input.value,
            scope: "standard_stock_full_return_change_of_mind",
            confirmedAt: clock(),
            confirmedBy: actor.username,
          },
        };
        delete next.revision;
        db.prepare(
          "UPDATE beta_config SET value=?,revision=revision+1 WHERE id=1",
        ).run(JSON.stringify(next));
        audit(actor, "policy.standard_outbound_shipping_confirmed", "beta", {
          value: input.value,
        });
        return config();
      });
    },
    confirmDefectShipping(actor, input) {
      adminOnly(actor);
      return transaction(() => {
        const current = config();
        if (input.revision !== current.revision)
          fail("운영 설정이 변경됐습니다. 다시 확인해 주세요.", 409);
        if (
          input.value !== "worknic_pays_collection_reshipment" ||
          input.confirmed !== true
        )
          fail(
            "불량·오배송 확인 시 회수비·재발송비 워크닉 부담 기준을 확인해 주세요.",
          );
        const next = {
          ...current,
          defectShipping: {
            value: input.value,
            scope: "confirmed_defect_or_wrong_item",
            confirmedAt: clock(),
            confirmedBy: actor.username,
          },
        };
        delete next.revision;
        db.prepare(
          "UPDATE beta_config SET value=?,revision=revision+1 WHERE id=1",
        ).run(JSON.stringify(next));
        audit(actor, "policy.defect_shipping_confirmed", "beta", {
          value: input.value,
        });
        return config();
      });
    },
    confirmRefundReviewer(actor, input) {
      adminOnly(actor);
      return transaction(() => {
        const current = config();
        if (input.revision !== current.revision)
          fail("운영 설정이 변경됐습니다. 다시 확인해 주세요.", 409);
        if (input.value !== "영우" || input.confirmed !== true)
          fail("취소·반품 검토 및 환불 승인 담당자 영우 지정을 확인해 주세요.");
        const next = {
          ...current,
          refundReviewer: {
            value: input.value,
            scope: "refund_review_and_approval",
            confirmedAt: clock(),
            confirmedBy: actor.username,
          },
        };
        delete next.revision;
        db.prepare(
          "UPDATE beta_config SET value=?,revision=revision+1 WHERE id=1",
        ).run(JSON.stringify(next));
        audit(actor, "operator.refund_reviewer_confirmed", "beta", {
          value: input.value,
        });
        return config();
      });
    },
    catalog(actor) {
      if (actor.role === "admin") return api.products(actor);
      customer(actor);
      return api
        .products(actor)
        .filter((p) => p.published !== false)
        .map(({ price, stock, ...p }) => ({ ...p, canRequest: true }));
    },
    priceRows(actor) {
      adminOnly(actor);
      return api
        .products(actor)
        .filter((p) => p.published !== false)
        .flatMap((p) =>
          (p.variants?.length
            ? p.variants.map((v) => String(v.sourceId || v.id))
            : ["default"]
          ).map((o) => price(p.id, o)),
        );
    },
    previewPrices(actor, rows) {
      adminOnly(actor);
      const checked = validateRows(rows),
        id = randomUUID(),
        now = clock();
      db.prepare("INSERT INTO beta_imports VALUES(?,?,?,?,?,?)").run(
        id,
        actor.id,
        JSON.stringify(checked),
        now,
        now + 15 * 60000,
        "preview",
      );
      return {
        id,
        rows: checked,
        valid: checked.filter((x) => !x.errors.length).length,
        invalid: checked.filter((x) => x.errors.length).length,
        expiresAt: now + 15 * 60000,
      };
    },
    markAllPricesUndetermined(actor, input) {
      adminOnly(actor);
      if (input.confirmed !== true)
        fail("공통 판매가 미정 전환을 확인해 주세요.");
      const rows = api.beta.priceRows(actor);
      if (!rows.length) return { applied: 0 };
      const preview = api.beta.previewPrices(
        actor,
        rows.map((p) => ({
          상품번호: p.productId,
          옵션번호: p.optionId,
          판매단위: p.unit,
          판매가: "",
          부가세기준: p.taxMode,
          가격상태: "미정",
          적용일: p.effectiveOn,
          수정번호: p.revision,
        })),
      );
      return api.beta.applyPrices(actor, preview.id);
    },
    applyPrices(actor, id) {
      adminOnly(actor);
      return transaction(() => {
        const batch = db
          .prepare("SELECT * FROM beta_imports WHERE id=?")
          .get(id);
        if (
          !batch ||
          batch.actor !== actor.id ||
          batch.status !== "preview" ||
          batch.expires <= clock()
        )
          fail("미리보기가 만료됐습니다. 다시 업로드해 주세요.", 409);
        const rows = JSON.parse(batch.rows);
        if (rows.some((x) => x.errors.length))
          fail("오류 행을 수정한 뒤 다시 업로드해 주세요.");
        for (const x of rows) {
          if (
            price(x.after.productId, x.after.optionId).revision !==
            x.before.revision
          )
            fail("가격이 변경됐습니다. 최신 양식으로 다시 확인해 주세요.", 409);
        }
        for (const x of rows) {
          const p = x.after;
          db.prepare(
            "INSERT INTO beta_prices VALUES(?,?,?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,revision=excluded.revision",
          ).run(
            keyOf(p.productId, p.optionId),
            p.productId,
            p.optionId,
            JSON.stringify(p),
            p.revision,
          );
        }
        db.prepare("UPDATE beta_imports SET status='applied' WHERE id=?").run(
          id,
        );
        audit(actor, "price.batch_applied", id, { count: rows.length });
        return { applied: rows.length, id };
      });
    },
    priceHistory(actor) {
      adminOnly(actor);
      return db
        .prepare(
          "SELECT id,created_at,status FROM beta_imports WHERE status!='preview' ORDER BY created_at DESC LIMIT 50",
        )
        .all();
    },
    restorePrices(actor, id) {
      adminOnly(actor);
      return transaction(() => {
        const r = db
          .prepare("SELECT * FROM beta_imports WHERE id=? AND status='applied'")
          .get(id);
        if (!r) fail("복원 가능한 적용 내역이 없습니다.");
        const rows = JSON.parse(r.rows);
        for (const x of rows)
          if (
            price(x.after.productId, x.after.optionId).revision !==
            x.after.revision
          )
            fail("적용 후 다른 가격 수정이 있어 복원할 수 없습니다.", 409);
        for (const x of rows) {
          const old = { ...x.before, revision: x.after.revision + 1 };
          db.prepare(
            "UPDATE beta_prices SET value=?,revision=? WHERE key=?",
          ).run(
            JSON.stringify(old),
            old.revision,
            keyOf(old.productId, old.optionId),
          );
        }
        db.prepare("UPDATE beta_imports SET status='restored' WHERE id=?").run(
          id,
        );
        audit(actor, "price.batch_restored", id);
        return { restored: rows.length };
      });
    },
    bindMember(actor, memberId, proof) {
      adminOnly(actor);
      const m = api.members(actor).find((x) => x.id === memberId);
      if (
        !m ||
        proof.status !== "approved" ||
        proof.businessNumber !== m.profile.businessNumber ||
        String(proof.email || "").toLowerCase() !==
          m.profile.email.toLowerCase() ||
        !proof.id ||
        proof.contactVerified !== true
      )
        fail("OS 승인정보와 실제 담당자 연락처를 확인해 주세요.");
      db.prepare(
        "INSERT INTO beta_bindings VALUES(?,?,0,1) ON CONFLICT(member_id) DO UPDATE SET request_id=excluded.request_id,activated=0,revision=beta_bindings.revision+1",
      ).run(memberId, proof.id);
      const token = randomBytes(32).toString("base64url");
      db.prepare("DELETE FROM beta_activations WHERE member_id=?").run(
        memberId,
      );
      db.prepare("INSERT INTO beta_activations VALUES(?,?,?)").run(
        hash(token),
        memberId,
        clock() + 30 * 60000,
      );
      audit(actor, "member.activation_issued", memberId, {
        requestId: proof.id,
      });
      return { token, expiresInMinutes: 30 };
    },
    activate(token, password) {
      if (
        typeof password !== "string" ||
        password.length < 10 ||
        password.length > 128
      )
        fail("비밀번호는 10~128자로 입력해 주세요.");
      return transaction(() => {
        const row = db
          .prepare("SELECT * FROM beta_activations WHERE hash=? AND expires>?")
          .get(hash(str(token, 100)), clock());
        if (!row) fail("계정 확인 링크가 만료됐습니다.");
        db.prepare(
          "UPDATE members SET password=?,status='approved',revision=revision+1 WHERE id=?",
        ).run(passwordHash(password), row.member_id);
        db.prepare(
          "UPDATE beta_bindings SET activated=1,revision=revision+1 WHERE member_id=?",
        ).run(row.member_id);
        db.prepare("DELETE FROM sessions WHERE member_id=?").run(row.member_id);
        db.prepare("DELETE FROM beta_activations WHERE member_id=?").run(
          row.member_id,
        );
        audit({ id: row.member_id }, "member.activated", row.member_id);
        return { ok: true };
      });
    },
    createQuote(actor, input) {
      customer(actor);
      if (!config().betaEnabled) fail("베타 접수를 준비하고 있습니다.", 409);
      if (!/^[a-zA-Z0-9_-]{16,100}$/.test(input.requestKey || ""))
        fail("요청번호 확인");
      return transaction(() => {
        const previous = db
          .prepare(
            "SELECT * FROM beta_quotes WHERE member_id=? AND request_key=?",
          )
          .get(actor.id, input.requestKey);
        if (previous) return quoteRow(previous);
        if (
          !Array.isArray(input.items) ||
          !input.items.length ||
          input.items.length > 100
        )
          fail("견적 품목을 확인해 주세요.");
        const seen = new Set(),
          items = input.items.map((x) => {
            const p = sku(x.productId, x.optionId),
              key = keyOf(x.productId, x.optionId);
            if (
              seen.has(key) ||
              !Number.isInteger(x.quantity) ||
              x.quantity < 1 ||
              x.quantity > 999
            )
              fail("품목·수량 확인");
            seen.add(key);
            return {
              productId: x.productId,
              optionId: x.optionId,
              name: p.name,
              model: p.model,
              brand: p.brand,
              quantity: x.quantity,
              optionLabel:
                (p.variants || []).find(
                  (v) => String(v.sourceId || v.id) === x.optionId,
                )?.option || "",
            };
          });
        const location = locations().find(
          (l) => l.id === input.locationId && l.enabled,
        );
        if (!location) fail("현재 신청 가능한 픽업 장소를 선택해 주세요.");
        const id = randomUUID(),
          value = {
            items,
            locationId: location.id,
            locationName: location.name,
            createdAt: clock(),
            note: str(input.note, 500),
          };
        db.prepare("INSERT INTO beta_quotes VALUES(?,?,?,'requested',?,1)").run(
          id,
          actor.id,
          input.requestKey,
          JSON.stringify(value),
        );
        audit(actor, "quote.requested", id);
        return getQuote(actor, id);
      });
    },
    quotes(actor) {
      if (actor.role !== "admin") customer(actor);
      return (
        actor.role === "admin"
          ? db.prepare("SELECT * FROM beta_quotes ORDER BY rowid DESC").all()
          : db
              .prepare(
                "SELECT * FROM beta_quotes WHERE member_id=? ORDER BY rowid DESC",
              )
              .all(actor.id)
      ).map(quoteRow);
    },
    quote: getQuote,
    issueQuote(actor, id, input) {
      adminOnly(actor);
      return transaction(() => {
        const q = getQuote(actor, id);
        if (q.status !== "requested" || q.revision !== input.revision)
          fail("견적 상태가 변경됐습니다.", 409);
        if (!config().documentsConfirmed)
          fail("부가세·문서 운영 기준을 먼저 확인해 주세요.");
        const specialOrder = input.specialOrder === true;
        if (
          specialOrder &&
          (config().specialOrderCancellation?.value !==
            "full_before_start_agreement_after" ||
            input.specialOrderAcknowledged !== true)
        )
          fail(
            "확정된 특수 상품 취소 기준과 견적 전체의 주문제작·별도 발주 여부를 확인해 주세요.",
          );
        let individual = null;
        if (input.items !== undefined) {
          if (
            !Array.isArray(input.items) ||
            input.items.length !== q.items.length
          )
            fail("요청된 상품·옵션별 개별 단가를 모두 입력해 주세요.");
          individual = new Map();
          for (const item of input.items) {
            if (!item || typeof item !== "object" || Array.isArray(item))
              fail("상품별 단가 입력을 확인해 주세요.");
            const key = keyOf(item.productId, item.optionId);
            if (
              individual.has(key) ||
              !q.items.some(
                (x) =>
                  x.productId === item.productId &&
                  x.optionId === item.optionId,
              )
            )
              fail("견적 상품·옵션이 중복됐거나 요청과 다릅니다.");
            if (
              !Number.isSafeInteger(item.unitPrice) ||
              item.unitPrice < 1 ||
              item.unitPrice > 100000000 ||
              !str(item.unit, 80) ||
              !["포함", "별도"].includes(item.taxMode)
            )
              fail("업체별 단가·판매단위·부가세 기준을 확인해 주세요.");
            individual.set(key, {
              price: item.unitPrice,
              unit: str(item.unit, 80),
              taxMode: item.taxMode,
            });
          }
        }
        const items = q.items.map((line) => {
          const p = individual
            ? individual.get(keyOf(line.productId, line.optionId))
            : price(line.productId, line.optionId);
          if (!p.price || !p.unit || !["포함", "별도"].includes(p.taxMode))
            fail("확정 판매가·판매단위·부가세 기준을 먼저 등록해 주세요.");
          const total = p.price * line.quantity,
            vat =
              p.taxMode === "포함"
                ? Math.round(total / 11)
                : Math.round(total * 0.1);
          return {
            ...line,
            unit: p.unit,
            unitPrice: p.price,
            taxMode: p.taxMode,
            supplyAmount: p.taxMode === "포함" ? total - vat : total,
            vat,
            amount: p.taxMode === "포함" ? total : total + vat,
            priceRevision: individual ? null : p.revision,
            priceSource: individual ? "individual_quote" : "catalog",
          };
        });
        const fee = input.pickupFee;
        if (fee !== 0 || input.conditionsConfirmed !== true)
          fail("픽업은 무료입니다. 비용 0원과 거래 조건을 확인해 주세요.");
        const expiresAt = Number(input.expiresAt);
        if (
          !Number.isSafeInteger(expiresAt) ||
          expiresAt <= clock() ||
          expiresAt > clock() + 14 * 86400000
        )
          fail("견적 유효기간은 최대 14일");
        const value = {
          ...q,
          specialOrder,
          standardReturnDays: specialOrder
            ? null
            : config().standardReturnPeriod?.days || null,
          standardReturnCondition: specialOrder
            ? null
            : config().standardReturnCondition?.value || null,
          defectShipping: config().defectShipping?.value || null,
          defectShippingText: api.beta.runtime().policies.defectShipping || "",
          standardOutboundShipping: specialOrder
            ? null
            : config().standardOutboundShipping?.value || null,
          outboundShippingText: specialOrder
            ? ""
            : api.beta.runtime().policies.standardOutboundShipping || "",
          standardReturnShipping: specialOrder
            ? null
            : config().standardReturnShipping?.value || null,
          returnShippingText: specialOrder
            ? ""
            : api.beta.runtime().policies.standardReturnShipping || "",
          returnConditionText: specialOrder
            ? ""
            : api.beta.runtime().policies.standardReturnCondition || "",
          cancellationPolicy: specialOrder
            ? "주문제작·별도 발주 상품의 단순 변심 취소는 제작·발주 전 전액 환불, 시작 후 건별 협의로 처리합니다."
            : api.beta.runtime().policies.standardPreReceiptCancellation || "",
          items,
          pickupFee: fee,
          subtotal: items.reduce((s, x) => s + x.amount, 0),
          total: items.reduce((s, x) => s + x.amount, 0) + fee,
          supplyAmount:
            items.reduce((s, x) => s + x.supplyAmount, 0) +
            fee -
            Math.round(fee / 11),
          vat: items.reduce((s, x) => s + x.vat, 0) + Math.round(fee / 11),
          bank: settings().bank,
          seller: settings().seller,
          issuedAt: clock(),
          issuedBy: actor.username,
          expiresAt,
        };
        delete value.id;
        delete value.status;
        delete value.memberId;
        delete value.revision;
        if (value.total > 1000000000) fail("대량 견적은 담당자 별도 처리");
        db.prepare(
          "UPDATE beta_quotes SET status='issued',value=?,revision=revision+1 WHERE id=?",
        ).run(JSON.stringify(value), id);
        audit(actor, "quote.issued", id);
        return getQuote(actor, id);
      });
    },
    acceptQuote(actor, id, input) {
      customer(actor);
      if (input.acceptTerms !== true)
        fail("견적·입금·픽업 안내를 확인해 주세요.");
      return transaction(() => {
        const q = getQuote(actor, id);
        if (q.status === "accepted")
          return { id: q.orderId, status: "already_accepted" };
        if (
          !config().betaEnabled ||
          q.status !== "issued" ||
          q.expiresAt <= clock() ||
          q.revision !== input.revision
        )
          fail("견적이 만료됐거나 변경됐습니다.", 409);
        const location = locations().find(
          (l) => l.id === q.locationId && l.enabled,
        );
        if (!location) fail("픽업 장소 운영 상태를 확인해 주세요.", 409);
        const reservations = q.items.map((x) => {
          const p = sku(x.productId, x.optionId),
            optionStock = (p.variants || []).length > 0,
            r = optionStock
              ? db
                  .prepare("SELECT * FROM beta_sku_stock WHERE key=?")
                  .get(keyOf(x.productId, x.optionId))
              : p.row;
          if (!r?.enabled || r.stock < x.quantity)
            fail("옵션별 주문 가능 수량을 담당자에게 확인해 주세요.", 409);
          return {
            ...x,
            inventoryKey: optionStock ? keyOf(x.productId, x.optionId) : null,
          };
        });
        const member = db
            .prepare("SELECT profile FROM members WHERE id=?")
            .get(actor.id),
          orderId = randomUUID(),
          now = clock(),
          number =
            "WN" +
            new Date(now + 9 * 3600000)
              .toISOString()
              .slice(0, 10)
              .replaceAll("-", "") +
            "-" +
            randomBytes(4).toString("hex").toUpperCase(),
          snapshot = {
            buyer: JSON.parse(member.profile),
            seller: q.seller,
            bank: q.bank,
            items: reservations,
            subtotal: q.subtotal,
            shippingFee: q.pickupFee,
            shippingLabel: "픽업 비용",
            total: q.total,
            supplyAmount: q.supplyAmount,
            vat: q.vat,
            fulfillment: {
              method: "pickup",
              locationId: location.id,
              locationName: location.name,
              address: location.address,
              hours: location.hours,
              handover: location.id === "jinjeop" ? "handoff" : "locker",
            },
            quoteId: id,
            specialOrder: q.specialOrder === true,
            standardReturnDays: q.standardReturnDays || null,
            standardReturnCondition: q.standardReturnCondition || null,
            returnConditionText: q.returnConditionText || "",
            defectShipping: q.defectShipping || null,
            defectShippingText: q.defectShippingText || "",
            standardOutboundShipping: q.standardOutboundShipping || null,
            outboundShippingText: q.outboundShippingText || "",
            standardReturnShipping: q.standardReturnShipping || null,
            returnShippingText: q.returnShippingText || "",
            cancellationPolicy: q.cancellationPolicy || "",
            note: q.note,
            termsVersion: settings().consentVersion,
          };
        for (const x of reservations) {
          if (x.inventoryKey)
            db.prepare(
              "UPDATE beta_sku_stock SET stock=stock-?,revision=revision+1 WHERE key=?",
            ).run(x.quantity, x.inventoryKey);
          else
            db.prepare(
              "UPDATE products SET stock=stock-?,revision=revision+1 WHERE id=?",
            ).run(x.quantity, x.productId);
        }
        db.prepare(
          "INSERT INTO orders(id,number,member_id,request_key,status,snapshot,created_at,due_at) VALUES(?,?,?,?,'pending_payment',?,?,?)",
        ).run(
          orderId,
          number,
          actor.id,
          "quote:" + id,
          JSON.stringify(snapshot),
          now,
          now + settings().paymentDays * 86400000,
        );
        db.prepare(
          "UPDATE beta_quotes SET status='accepted',value=?,revision=revision+1 WHERE id=?",
        ).run(JSON.stringify({ ...q, orderId }), id);
        audit(actor, "quote.accepted", id, { orderId });
        return {
          id: orderId,
          number,
          status: "pending_payment",
          ...snapshot,
          createdAt: now,
          revision: 1,
        };
      });
    },
    updateLocation(actor, id, input) {
      adminOnly(actor);
      const old = locations().find((l) => l.id === id);
      if (!old || old.revision !== input.revision) fail("장소 설정 변경", 409);
      const value = {
        name: old.name,
        address: str(input.address, 300),
        hours: str(input.hours, 300),
        noticeUrl: str(input.noticeUrl, 1000),
        enabled: input.enabled === true,
        sourceVerified: input.sourceVerified === true,
        fee: input.fee,
      };
      if (
        value.enabled &&
        (!value.sourceVerified ||
          !value.address ||
          !value.hours ||
          !/^https:\/\//.test(value.noticeUrl) ||
          !Number.isInteger(value.fee) ||
          value.fee < 0)
      )
        fail("공지 출처·주소·수령 조건·비용을 확인한 뒤 장소를 열어 주세요.");
      db.prepare(
        "UPDATE beta_locations SET value=?,revision=revision+1 WHERE id=?",
      ).run(JSON.stringify(value), id);
      audit(actor, "pickup.location_updated", id);
      return locations();
    },
    slots(actor) {
      adminOnly(actor);
      return db.prepare("SELECT * FROM beta_slots ORDER BY id").all();
    },
    saveSlot(actor, input) {
      adminOnly(actor);
      if (
        !/^[A-Za-z0-9_-]{1,50}$/.test(input.id) ||
        !locations().some((l) => l.id === input.locationId) ||
        !str(input.label, 80)
      )
        fail("보관함 번호·장소 확인");
      const active = db
        .prepare("SELECT order_id FROM beta_pickups WHERE slot_id=?")
        .get(input.id);
      if (active) fail("사용 중인 보관함은 수정할 수 없습니다.", 409);
      db.prepare(
        "INSERT INTO beta_slots VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET location_id=excluded.location_id,label=excluded.label,enabled=excluded.enabled",
      ).run(
        input.id,
        input.locationId,
        str(input.label, 80),
        Number(input.enabled === true),
      );
      audit(actor, "pickup.slot_saved", input.id);
      return { ok: true };
    },
    readyPickup(actor, orderId, input) {
      adminOnly(actor);
      aftercare.assertFulfillmentAllowed(orderId);
      return transaction(() => {
        const o = activeOrder(actor, orderId),
          slot = db
            .prepare("SELECT * FROM beta_slots WHERE id=? AND enabled=1")
            .get(input.slotId);
        if (o.fulfillment.handover === "handoff")
          fail("진접 주문은 담당자 대면 전달로 준비해 주세요.", 409);
        if (
          !["paid", "preparing"].includes(o.status) ||
          o.revision !== input.revision
        )
          fail(
            "입금 확인·준비 중 주문만 픽업 준비 완료 처리할 수 있습니다.",
            409,
          );
        if (!slot || slot.location_id !== o.fulfillment.locationId)
          fail("수령 장소의 사용 가능한 보관함 선택");
        const old = db
          .prepare("SELECT * FROM beta_pickups WHERE order_id=?")
          .get(orderId);
        if (old) fail("이미 보관함에 배치된 주문입니다.", 409);
        if (
          db
            .prepare("SELECT order_id FROM beta_pickups WHERE slot_id=?")
            .get(slot.id)
        )
          fail("이미 사용 중인 보관함입니다.", 409);
        const from = Number(input.availableFrom),
          until = Number(input.availableUntil),
          pin = str(input.pin, 12);
        if (o.fulfillment.locationId === "jinjeop") {
          const start = new Date(from + 9 * 3600000),
            end = new Date(until + 9 * 3600000);
          if (
            !Number.isSafeInteger(from) ||
            !Number.isSafeInteger(until) ||
            Math.abs(from) > 8e15 ||
            Math.abs(until) > 8e15 ||
            start.getUTCDay() < 1 ||
            start.getUTCDay() > 5 ||
            start.toISOString().slice(0, 10) !==
              end.toISOString().slice(0, 10) ||
            start.getUTCHours() < 19 ||
            end.getUTCHours() * 3600 +
              end.getUTCMinutes() * 60 +
              end.getUTCSeconds() >
              23 * 3600
          )
            fail(
              "진접 픽업은 월~금 오후 7시~11시 안에서 수령 기간을 정해 주세요.",
            );
        }
        if (
          !/^[0-9]{6,12}$/.test(pin) ||
          !Number.isSafeInteger(from) ||
          !Number.isSafeInteger(until) ||
          from < clock() - 60000 ||
          until <= from ||
          until > clock() + 7 * 86400000 ||
          input.staged !== true ||
          input.physicalCodeConfigured !== true
        )
          fail(
            "6~12자리 비밀번호·수령 기간·상품 보관·잠금장치 설정을 확인해 주세요.",
          );
        const pinDigest = createHmac("sha256", vault).update(pin).digest("hex");
        for (const r of db.prepare("SELECT value FROM beta_pickups").all())
          if (JSON.parse(r.value).pinDigest === pinDigest)
            fail("다른 주문과 다른 비밀번호를 설정해 주세요.");
        const value = {
          locationId: slot.location_id,
          slotLabel: slot.label,
          availableFrom: from,
          availableUntil: until,
          readyAt: clock(),
          readyBy: actor.username,
          pinDigest,
        };
        db.prepare("INSERT INTO beta_pickups VALUES(?,?,?,?,'ready',1)").run(
          orderId,
          slot.id,
          JSON.stringify(value),
          encrypt(pin, orderId + ":" + slot.id),
        );
        db.prepare(
          "UPDATE orders SET status='pickup_ready',revision=revision+1 WHERE id=?",
        ).run(orderId);
        audit(actor, "pickup.ready", orderId, {
          slotId: slot.id,
          availableFrom: from,
          availableUntil: until,
        });
        return {
          ...publicPickup(
            db
              .prepare("SELECT * FROM beta_pickups WHERE order_id=?")
              .get(orderId),
          ),
          pinDigest: undefined,
        };
      });
    },
    pickup(actor, id) {
      if (actor.role !== "admin") customer(actor);
      activeOrder(actor, id);
      const handoff = db
        .prepare("SELECT * FROM beta_handoffs WHERE order_id=?")
        .get(id);
      if (handoff && ["ready", "reported"].includes(handoff.status)) {
        const h = {
          ...JSON.parse(handoff.value),
          mode: "handoff",
          status: handoff.status,
          revision: handoff.revision,
        };
        if (h.status === "ready" && h.availableUntil <= clock())
          h.status = "expired_handoff";
        return h;
      }
      const r = db
          .prepare("SELECT * FROM beta_pickups WHERE order_id=?")
          .get(id),
        p = publicPickup(r);
      if (!p) return null;
      delete p.pinDigest;
      if (p.status === "ready" && p.availableUntil <= clock())
        p.status = "expired_reset_required";
      return p;
    },
    revealPin(actor, id) {
      customer(actor);
      activeOrder(actor, id);
      aftercare.assertFulfillmentAllowed(id);
      const r = db
        .prepare("SELECT * FROM beta_pickups WHERE order_id=?")
        .get(id);
      if (!r || r.status !== "ready")
        fail("준비 완료된 주문만 비밀번호를 확인할 수 있습니다.", 409);
      const p = JSON.parse(r.value);
      if (clock() < p.availableFrom || clock() >= p.availableUntil)
        fail("안내된 수령 기간에 확인해 주세요.", 409);
      audit(actor, "pickup.code_viewed", id);
      return {
        pin: decrypt(r.secret, id + ":" + r.slot_id),
        availableUntil: p.availableUntil,
        slotLabel: p.slotLabel,
      };
    },
    reportPickup(actor, id, input) {
      customer(actor);
      aftercare.assertFulfillmentAllowed(id);
      return transaction(() => {
        activeOrder(actor, id);
        const h = db
          .prepare("SELECT * FROM beta_handoffs WHERE order_id=?")
          .get(id);
        if (h) {
          const v = JSON.parse(h.value);
          if (
            h.status !== "ready" ||
            h.revision !== input.revision ||
            input.received !== true ||
            clock() < v.availableFrom ||
            clock() >= v.availableUntil
          )
            fail("대면 수령 상태·기간을 확인해 주세요.", 409);
          db.prepare(
            "UPDATE beta_handoffs SET status='reported',value=?,revision=revision+1 WHERE order_id=?",
          ).run(JSON.stringify({ ...v, reportedAt: clock() }), id);
          db.prepare(
            "UPDATE orders SET status='pickup_reported',revision=revision+1 WHERE id=?",
          ).run(id);
          audit(actor, "handoff.reported", id);
          return { ok: true };
        }
        const r = db
          .prepare("SELECT * FROM beta_pickups WHERE order_id=?")
          .get(id);
        if (
          !r ||
          r.status !== "ready" ||
          r.revision !== input.revision ||
          input.received !== true
        )
          fail("수령 상태를 확인해 주세요.", 409);
        const p = JSON.parse(r.value);
        if (clock() < p.availableFrom || clock() > p.availableUntil)
          fail("수령 기간을 확인해 주세요.");
        db.prepare(
          "UPDATE beta_pickups SET status='reported',secret=NULL,value=?,revision=revision+1 WHERE order_id=?",
        ).run(JSON.stringify({ ...p, reportedAt: clock() }), id);
        db.prepare(
          "UPDATE orders SET status='pickup_reported',revision=revision+1 WHERE id=?",
        ).run(id);
        audit(actor, "pickup.reported", id);
        return { ok: true };
      });
    },
    closePickup(actor, id, input) {
      adminOnly(actor);
      if (input.result === "collected") aftercare.assertFulfillmentAllowed(id);
      return transaction(() => {
        const r = db
          .prepare("SELECT * FROM beta_pickups WHERE order_id=?")
          .get(id);
        if (
          !r ||
          r.revision !== input.revision ||
          input.physicalCodeRevoked !== true ||
          input.compartmentChecked !== true ||
          !["collected", "not_collected"].includes(input.result)
        )
          fail("보관함·실제 비밀번호 폐기·수령 결과를 확인해 주세요.");
        const old = JSON.parse(r.value);
        if (
          r.status !== "reported" &&
          old.availableUntil > clock() &&
          input.result !== "collected"
        )
          fail("수령 기간이 남아 있습니다.", 409);
        db.prepare("DELETE FROM beta_pickups WHERE order_id=?").run(id);
        db.prepare(
          "UPDATE orders SET status=?,revision=revision+1 WHERE id=?",
        ).run(
          input.result === "collected" ? "collected" : "pickup_exception",
          id,
        );
        audit(actor, "pickup.closed", id, {
          slotId: r.slot_id,
          result: input.result,
          physicalCodeRevoked: true,
        });
        return { ok: true };
      });
    },
    readyHandoff(actor, id, input) {
      adminOnly(actor);
      aftercare.assertFulfillmentAllowed(id);
      return transaction(() => {
        const o = activeOrder(actor, id),
          from = Number(input.availableFrom),
          until = Number(input.availableUntil);
        if (
          o.fulfillment.locationId !== "jinjeop" ||
          !["paid", "preparing"].includes(o.status) ||
          o.revision !== input.revision
        )
          fail("진접 입금 확인 주문의 대면 전달 준비만 가능합니다.", 409);
        if (
          db
            .prepare("SELECT order_id FROM beta_pickups WHERE order_id=?")
            .get(id) ||
          db
            .prepare(
              "SELECT order_id FROM beta_handoffs WHERE order_id=? AND status IN ('ready','reported')",
            )
            .get(id)
        )
          fail("이미 수령 준비가 등록된 주문입니다.", 409);
        if (
          !Number.isSafeInteger(from) ||
          !Number.isSafeInteger(until) ||
          from < clock() - 60000 ||
          until <= from ||
          until > clock() + 7 * 86400000
        )
          fail("대면 수령 시작·마감 시간을 확인해 주세요.");
        const start = new Date(from + 9 * 3600000),
          end = new Date(until + 9 * 3600000);
        if (
          start.getUTCDay() < 1 ||
          start.getUTCDay() > 5 ||
          start.toISOString().slice(0, 10) !== end.toISOString().slice(0, 10) ||
          start.getUTCHours() < 19 ||
          end.getUTCHours() * 3600 +
            end.getUTCMinutes() * 60 +
            end.getUTCSeconds() >
            23 * 3600
        )
          fail("진접 대면 전달은 월~금 오후 7시~11시 안에서 정해 주세요.");
        if (
          input.staged !== true ||
          input.staffConfirmed !== true ||
          !str(input.meetingPoint, 300) ||
          !str(input.staffContact, 100)
        )
          fail(
            "상품 준비·전달 담당자·정확한 만남 지점과 업무 연락처를 확인해 주세요.",
          );
        const value = {
          mode: "handoff",
          availableFrom: from,
          availableUntil: until,
          meetingPoint: str(input.meetingPoint, 300),
          staffContact: str(input.staffContact, 100),
          readyAt: clock(),
          readyBy: actor.username,
        };
        db.prepare(
          "INSERT INTO beta_handoffs VALUES(?,?,'ready',1) ON CONFLICT(order_id) DO UPDATE SET value=excluded.value,status='ready',revision=beta_handoffs.revision+1",
        ).run(id, JSON.stringify(value));
        db.prepare(
          "UPDATE orders SET status='pickup_ready',revision=revision+1 WHERE id=?",
        ).run(id);
        audit(actor, "handoff.ready", id, {
          availableFrom: from,
          availableUntil: until,
        });
        return { ok: true };
      });
    },
    closeHandoff(actor, id, input) {
      adminOnly(actor);
      aftercare.assertFulfillmentAllowed(id);
      return transaction(() => {
        activeOrder(actor, id);
        const r = db
          .prepare("SELECT * FROM beta_handoffs WHERE order_id=?")
          .get(id);
        if (
          !r ||
          !["ready", "reported"].includes(r.status) ||
          r.revision !== input.revision ||
          input.recipientChecked !== true ||
          !["collected", "not_collected"].includes(input.result)
        )
          fail("대면 전달 결과와 수령자·상품·수량 확인이 필요합니다.", 409);
        const v = JSON.parse(r.value);
        if (
          input.result === "collected" &&
          (clock() < v.availableFrom || clock() >= v.availableUntil)
        )
          fail("안내된 대면 수령 기간을 확인해 주세요.", 409);
        if (input.result === "not_collected" && clock() < v.availableUntil)
          fail("수령 기간이 남아 있습니다.", 409);
        db.prepare(
          "UPDATE beta_handoffs SET status=?,value=?,revision=revision+1 WHERE order_id=?",
        ).run(
          input.result,
          JSON.stringify({ ...v, closedAt: clock(), closedBy: actor.username }),
          id,
        );
        db.prepare(
          "UPDATE orders SET status=?,revision=revision+1 WHERE id=?",
        ).run(
          input.result === "collected" ? "collected" : "pickup_exception",
          id,
        );
        audit(actor, "handoff.closed", id, { result: input.result });
        return { ok: true };
      });
    },
  };
}
