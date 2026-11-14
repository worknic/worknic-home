import { installBeta } from "./beta-store.mjs";
import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
  createHash,
  createHmac,
} from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

export class TradeError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const fail = (message, status) => {
  throw new TradeError(message, status);
};
const text = (v, max = 200) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
const id = () => randomUUID();
const digest = (v) => createHash("sha256").update(v).digest("hex");
const SCRYPT_OPTIONS = { N: 65536, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };
export const passwordHash = (password) => {
  const salt = randomBytes(16).toString("hex");
  return (
    salt + ":" + scryptSync(password, salt, 64, SCRYPT_OPTIONS).toString("hex")
  );
};
const checkPassword = (password, hash) => {
  const [salt, expected] = hash.split(":");
  const actual = scryptSync(password, salt, 64, SCRYPT_OPTIONS);
  return timingSafeEqual(actual, Buffer.from(expected, "hex"));
};
const validPassword = (v) =>
  typeof v === "string" && v.length >= 10 && v.length <= 128;
export function validBusinessNumber(value) {
  const v = String(value || "").replace(/[-\s]/g, "");
  if (!/^\d{10}$/.test(v) || /^0+$/.test(v)) return false;
  const n = [...v].map(Number),
    weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  const sum =
    weights.reduce((s, w, i) => s + w * n[i], 0) + Math.floor((n[8] * 5) / 10);
  return (10 - (sum % 10)) % 10 === n[9];
}
export const STATUS = {
  pending_payment: "입금 대기",
  paid: "입금 확인",
  preparing: "배송 준비",
  quote: "견적 발행",
  pickup_ready: "픽업 준비 완료",
  pickup_reported: "수령 확인 중",
  collected: "수령 완료",
  pickup_exception: "담당자 확인 필요",
  shipped: "발송 완료",
  cancelled: "주문 취소",
  refunded: "전액 환불 완료",
  cancelled_settled: "협의 취소 정산 완료",
  expired: "입금기한 만료",
};
export const DEFAULT_SETTINGS = {
  seller: {
    companyName: "워크닉 주식회사",
    businessNumber: "363-86-03519",
    phone: "1833-3640",
    address: "경기도 포천시 화현면 화동로348번길 5-1",
  },
  bank: {
    name: "하나은행",
    account: "556-910020-91004",
    holder: "워크닉 주식회사",
  },
  shipping: { fee: 5000, freeOver: 500000, label: "배송·포장비" },
  paymentDays: 3,
  ordersEnabled: false,
  consentVersion: "trade-2026-11-07",
};

export function openStore(
  filename,
  { clock = () => Date.now(), catalogPath, betaOptions = {} } = {},
) {
  mkdirSync(dirname(filename), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('customer','admin')),
      status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','suspended')),
      profile TEXT NOT NULL, created_at INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, source TEXT NOT NULL, price INTEGER, stock INTEGER NOT NULL DEFAULT 0,
      enabled INTEGER NOT NULL DEFAULT 0, special_shipping INTEGER NOT NULL DEFAULT 0, revision INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, number TEXT UNIQUE NOT NULL,
      member_id TEXT NOT NULL REFERENCES members(id), request_key TEXT NOT NULL,
      status TEXT NOT NULL, snapshot TEXT NOT NULL, created_at INTEGER NOT NULL, due_at INTEGER NOT NULL,
      payment TEXT, shipment TEXT, revision INTEGER NOT NULL DEFAULT 1, UNIQUE(member_id,request_key));
    CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY, actor_id TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, detail TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS resets (hash TEXT PRIMARY KEY, member_id TEXT NOT NULL REFERENCES members(id), expires INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS orders_member ON orders(member_id,created_at);
    CREATE INDEX IF NOT EXISTS orders_expiry ON orders(status,due_at);
  `);
  db.prepare("INSERT OR IGNORE INTO settings(id,value) VALUES(1,?)").run(
    JSON.stringify(DEFAULT_SETTINGS),
  );
  const transaction = (fn) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };
  const audit = (actor, action, target, detail = {}) =>
    db
      .prepare(
        "INSERT INTO audit(actor_id,action,target,detail,created_at) VALUES(?,?,?,?,?)",
      )
      .run(actor.id, action, target, JSON.stringify(detail), clock());
  const adminOnly = (actor) => {
    if (actor?.role !== "admin" || actor.status !== "approved")
      fail("관리자 권한이 필요합니다.", 403);
  };
  const customerOnly = (actor) => {
    if (actor?.role !== "customer" || actor.status !== "approved")
      fail("사업자 거래 승인 후 주문할 수 있습니다.", 403);
  };
  const safeMember = (row) =>
    row && {
      id: row.id,
      username: row.username,
      role: row.role,
      status: row.status,
      profile: JSON.parse(row.profile),
      createdAt: row.created_at,
      revision: row.revision,
    };
  const settings = () => {
    const row = db.prepare("SELECT * FROM settings WHERE id=1").get();
    return { ...JSON.parse(row.value), revision: row.revision };
  };
  const orderValue = (row) => ({
    id: row.id,
    number: row.number,
    memberId: row.member_id,
    status: row.status,
    createdAt: row.created_at,
    dueAt: row.due_at,
    ...JSON.parse(row.snapshot),
    payment: row.payment ? JSON.parse(row.payment) : null,
    shipment: row.shipment ? JSON.parse(row.shipment) : null,
    revision: row.revision,
  });
  const release = (row) => {
    for (const line of JSON.parse(row.snapshot).items) {
      if (line.inventoryKey)
        db.prepare(
          "UPDATE beta_sku_stock SET stock=stock+?,revision=revision+1 WHERE key=?",
        ).run(line.quantity, line.inventoryKey);
      else
        db.prepare(
          "UPDATE products SET stock=stock+?,revision=revision+1 WHERE id=?",
        ).run(line.quantity, line.productId);
    }
  };
  const expireOrders = () =>
    transaction(() => {
      for (const row of db
        .prepare(
          "SELECT * FROM orders WHERE status='pending_payment' AND due_at<=?",
        )
        .all(clock())) {
        release(row);
        db.prepare(
          "UPDATE orders SET status='expired',revision=revision+1 WHERE id=?",
        ).run(row.id);
        audit({ id: "system" }, "order.expired", row.id);
      }
      db.prepare("DELETE FROM sessions WHERE expires<=?").run(clock());
      db.prepare("DELETE FROM limits WHERE expires<=?").run(clock());
      db.prepare("DELETE FROM resets WHERE expires<=?").run(clock());
    });
  function seedCatalog(path) {
    const data =
      typeof path === "string" ? JSON.parse(readFileSync(path, "utf8")) : path;
    if (
      !data ||
      !Array.isArray(data.brands) ||
      !Array.isArray(data.products) ||
      data.products.length > 10000 ||
      data.brands.length > 1000
    )
      fail("카탈로그 형식을 확인해 주세요.");
    const seen = new Set();
    for (const p of data.products) {
      if (
        !p ||
        !/^[a-zA-Z0-9_-]{1,80}$/.test(p.id) ||
        !text(p.name, 200) ||
        seen.has(p.id) ||
        !Array.isArray(p.images || []) ||
        (p.images || []).length > 3
      )
        fail("카탈로그 상품을 확인해 주세요.");
      seen.add(p.id);
    }
    transaction(() => {
      for (const p of data.products.filter((p) => p.published === true)) {
        const brand = data.brands.find((b) => b.id === p.brand);
        const source = {
          id: p.id,
          published: true,
          name: text(p.name, 200),
          model: text(p.model, 200),
          brand: text(brand?.name || p.brand, 100),
          summary: text(p.summary, 3000),
          images: (p.images || []).filter(
            (src) =>
              typeof src === "string" &&
              src.length <= 2000 &&
              /^(https:\/\/|\/assets\/)/.test(src),
          ),
          specs: Array.isArray(p.specs) ? p.specs.slice(0, 100) : [],
          variants: p.variants || [],
          guide: p.guide || {},
        };
        // New catalog entries start unavailable. Existing order snapshots never change.
        db.prepare(
          "INSERT INTO products(id,source) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET source=excluded.source,revision=products.revision+1 WHERE products.source<>excluded.source",
        ).run(p.id, JSON.stringify(source));
      }
      const publishedIds = new Set(
        data.products.filter((p) => p.published === true).map((p) => p.id),
      );
      for (const row of db
        .prepare("SELECT id,source,enabled FROM products")
        .all()) {
        if (!publishedIds.has(row.id)) {
          const old = JSON.parse(row.source);
          if (old.published !== false || row.enabled)
            db.prepare(
              "UPDATE products SET enabled=0,source=?,revision=revision+1 WHERE id=?",
            ).run(JSON.stringify({ ...old, published: false }), row.id);
        }
      }
    });
    return {
      imported: data.products.filter((p) => p.published === true).length,
    };
  }
  if (
    catalogPath &&
    db.prepare("SELECT count(*) AS n FROM products").get().n === 0
  )
    seedCatalog(catalogPath);
  const dummyHash = passwordHash(randomBytes(32).toString("hex"));
  const api = {
    close: () => db.close(),
    settings,
    seedCatalog,
    expireOrders,
    importCatalog(actor, data) {
      adminOnly(actor);
      const result = seedCatalog(data);
      audit(actor, "catalog.imported", "catalog", result);
      return result;
    },
    limit(key, max = 15, windowMs = 15 * 60_000) {
      const k = digest(key),
        now = clock();
      const row = db.prepare("SELECT * FROM limits WHERE key=?").get(k);
      if (!row || row.expires <= now)
        db.prepare(
          "INSERT INTO limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=1,expires=excluded.expires",
        ).run(k, now + windowMs);
      else {
        if (row.count >= max)
          fail("요청이 많습니다. 잠시 후 다시 시도해 주세요.", 429);
        db.prepare("UPDATE limits SET count=count+1 WHERE key=?").run(k);
      }
    },
    register(input) {
      const username = text(input.username, 40).toLowerCase();
      if (!/^[a-z0-9][a-z0-9_-]{3,39}$/.test(username))
        fail("아이디는 영문·숫자 4~40자로 입력해 주세요.");
      if (!validPassword(input.password))
        fail("비밀번호는 조합 제한 없이 10~128자로 입력해 주세요.");
      if (
        typeof input.businessNumber !== "string" ||
        !validBusinessNumber(input.businessNumber)
      )
        fail("사업자등록번호를 확인해 주세요.");
      if (input.consent !== true)
        fail("회원가입을 위한 개인정보 수집·이용 동의가 필요합니다.");
      const profile = {
        companyName: text(input.companyName, 100),
        businessNumber: input.businessNumber.replace(/[-\s]/g, ""),
        contactName: text(input.contactName, 60),
        phone: text(input.phone, 30),
        email: text(input.email, 254),
        postalCode: text(input.postalCode, 10),
        address: text(input.address, 300),
        addressDetail: text(input.addressDetail, 150),
        consentVersion: settings().consentVersion,
        consentAt: clock(),
        businessVerification: "manual_pending",
      };
      if (
        !profile.companyName ||
        !profile.contactName ||
        !/^[+\d()\s-]{8,30}$/.test(profile.phone) ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email) ||
        !/^\d{5}$/.test(profile.postalCode) ||
        !profile.address
      )
        fail("회사·담당자·연락처·이메일·우편번호·배송지를 확인해 주세요.");
      const memberId = id();
      try {
        db.prepare(
          "INSERT INTO members(id,username,password,role,status,profile,created_at) VALUES(?,?,?,'customer','pending',?,?)",
        ).run(
          memberId,
          username,
          passwordHash(input.password),
          JSON.stringify(profile),
          clock(),
        );
      } catch (e) {
        if (e.errcode === 2067 || e.code?.includes("CONSTRAINT"))
          fail("이미 사용 중인 아이디입니다.", 409);
        throw e;
      }
      audit({ id: memberId }, "member.registered", memberId);
      return { status: "pending" };
    },
    createAdmin(username, password) {
      if (!/^[a-z0-9][a-z0-9_-]{3,39}$/.test(text(username, 40).toLowerCase()))
        fail("관리자 아이디는 영문·숫자 4~40자가 필요합니다.");
      if (!validPassword(password))
        fail("관리자 비밀번호는 10~128자가 필요합니다.");
      const memberId = id();
      db.prepare(
        "INSERT INTO members(id,username,password,role,status,profile,created_at) VALUES(?,?,?,'admin','approved','{}',?)",
      ).run(
        memberId,
        text(username).toLowerCase(),
        passwordHash(password),
        clock(),
      );
      return memberId;
    },
    login(username, password) {
      const row = db
        .prepare("SELECT * FROM members WHERE username=?")
        .get(text(username, 40).toLowerCase());
      const good = checkPassword(
        typeof password === "string" && password.length <= 128 ? password : "",
        row?.password || dummyHash,
      );
      if (!row || !good || ["rejected", "suspended"].includes(row.status))
        fail("아이디 또는 비밀번호를 확인해 주세요.", 401);
      return safeMember(row);
    },
    session(member) {
      const token = randomBytes(32).toString("base64url");
      const expires =
        clock() + (member.role === "admin" ? 3600_000 : 12 * 3600_000);
      db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
        digest(token),
        member.id,
        expires,
      );
      return { token, expires };
    },
    authenticate(token) {
      if (!token || token.length > 200) return null;
      const row = db
        .prepare(
          "SELECT m.* FROM sessions s JOIN members m ON m.id=s.member_id WHERE s.hash=? AND s.expires>?",
        )
        .get(digest(token), clock());
      return row && !["rejected", "suspended"].includes(row.status)
        ? safeMember(row)
        : null;
    },
    logout(token) {
      db.prepare("DELETE FROM sessions WHERE hash=?").run(digest(token || ""));
    },
    members(actor) {
      adminOnly(actor);
      return db
        .prepare(
          "SELECT * FROM members WHERE role='customer' ORDER BY created_at DESC",
        )
        .all()
        .map(safeMember);
    },
    osAdmin(username, password, osUser) {
      let row = db
        .prepare("SELECT * FROM members WHERE username=? AND role='admin'")
        .get(username);
      if (!row) {
        api.createAdmin(username, password);
        db.prepare("UPDATE members SET profile=? WHERE username=?").run(
          JSON.stringify({ authSource: "worknic_os", osUser }),
          username,
        );
        row = db
          .prepare("SELECT * FROM members WHERE username=?")
          .get(username);
      }
      return safeMember(row);
    },
    updateStock(actor, productId, input) {
      adminOnly(actor);
      if (
        !Number.isInteger(input.stock) ||
        input.stock < 0 ||
        input.stock > 1000000 ||
        typeof input.enabled !== "boolean"
      )
        fail("주문 가능 수량을 확인해 주세요.");
      const r = db
        .prepare(
          "UPDATE products SET stock=?,enabled=?,revision=revision+1 WHERE id=? AND revision=?",
        )
        .run(input.stock, Number(input.enabled), productId, input.revision);
      if (!r.changes) fail("상품 정보가 변경됐습니다.", 409);
      audit(actor, "product.stock_updated", productId, {
        stock: input.stock,
        enabled: input.enabled,
      });
      return { ok: true };
    },
    updateMember(actor, memberId, input) {
      adminOnly(actor);
      if (!["approved", "rejected", "suspended"].includes(input.status))
        fail("회원 상태를 확인해 주세요.");
      if (input.status === "approved" && input.businessChecked !== true)
        fail("사업자 정보를 확인한 뒤 승인해 주세요.");
      return transaction(() => {
        const row = db
          .prepare("SELECT * FROM members WHERE id=? AND role='customer'")
          .get(memberId);
        if (!row) fail("회원을 찾을 수 없습니다.", 404);
        if (row.revision !== input.revision)
          fail("회원 정보가 변경되었습니다. 새로고침해 주세요.", 409);
        const profile = {
          ...JSON.parse(row.profile),
          businessVerification:
            input.status === "approved"
              ? "staff_checked"
              : JSON.parse(row.profile).businessVerification,
        };
        db.prepare(
          "UPDATE members SET status=?,profile=?,revision=revision+1 WHERE id=?",
        ).run(input.status, JSON.stringify(profile), memberId);
        if (input.status !== "approved")
          db.prepare("DELETE FROM sessions WHERE member_id=?").run(memberId);
        audit(actor, "member." + input.status, memberId);
        return safeMember(
          db.prepare("SELECT * FROM members WHERE id=?").get(memberId),
        );
      });
    },
    resetToken(actor, memberId) {
      adminOnly(actor);
      const row = db
        .prepare("SELECT id FROM members WHERE id=? AND role='customer'")
        .get(memberId);
      if (!row) fail("회원을 찾을 수 없습니다.", 404);
      const token = randomBytes(32).toString("base64url");
      db.prepare("DELETE FROM resets WHERE member_id=?").run(memberId);
      db.prepare("INSERT INTO resets VALUES(?,?,?)").run(
        digest(token),
        memberId,
        clock() + 30 * 60_000,
      );
      audit(actor, "member.reset_issued", memberId);
      return { token, expiresInMinutes: 30 };
    },
    resetPassword(token, password) {
      if (!validPassword(password))
        fail("비밀번호는 10~128자로 입력해 주세요.");
      const row = db
        .prepare("SELECT * FROM resets WHERE hash=? AND expires>?")
        .get(digest(text(token, 100)), clock());
      if (!row) fail("재설정 정보가 만료되었거나 올바르지 않습니다.");
      transaction(() => {
        db.prepare(
          "UPDATE members SET password=?,revision=revision+1 WHERE id=?",
        ).run(passwordHash(password), row.member_id);
        db.prepare("DELETE FROM resets WHERE member_id=?").run(row.member_id);
        db.prepare("DELETE FROM sessions WHERE member_id=?").run(row.member_id);
        audit({ id: row.member_id }, "member.password_reset", row.member_id);
      });
      return { ok: true };
    },
    products(actor) {
      if (!actor || actor.status !== "approved")
        fail("사업자 거래 승인 후 상품 가격을 확인할 수 있습니다.", 403);
      return db
        .prepare("SELECT * FROM products ORDER BY id")
        .all()
        .map((row) => ({
          ...JSON.parse(row.source),
          price: row.price,
          stock: row.stock,
          enabled: !!row.enabled,
          specialShipping: !!row.special_shipping,
          revision: row.revision,
        }));
    },
    updateProduct(actor, productId, input) {
      adminOnly(actor);
      if (
        !Number.isSafeInteger(input.price) ||
        input.price <= 0 ||
        input.price > 100_000_000 ||
        !Number.isSafeInteger(input.stock) ||
        input.stock < 0 ||
        input.stock > 1_000_000 ||
        typeof input.enabled !== "boolean" ||
        typeof input.specialShipping !== "boolean"
      )
        fail("부가세 포함 단가와 주문 가능 수량을 확인해 주세요.");
      const result = db
        .prepare(
          "UPDATE products SET price=?,stock=?,enabled=?,special_shipping=?,revision=revision+1 WHERE id=? AND revision=?",
        )
        .run(
          input.price,
          input.stock,
          Number(input.enabled),
          Number(input.specialShipping),
          productId,
          input.revision,
        );
      if (!result.changes)
        fail("상품 정보가 변경되었거나 없습니다. 새로고침해 주세요.", 409);
      audit(actor, "product.updated", productId, {
        price: input.price,
        stock: input.stock,
        enabled: input.enabled,
      });
      return { ok: true };
    },
    updateSettings(actor, input) {
      adminOnly(actor);
      const old = settings();
      if (old.revision !== input.revision)
        fail("운영 설정이 변경되었습니다. 새로고침해 주세요.", 409);
      const bank = {
        name: text(input.bank?.name, 50),
        account: text(input.bank?.account, 60),
        holder: text(input.bank?.holder, 100),
      };
      if (!bank.name || !bank.account || !bank.holder)
        fail("입금계좌를 모두 입력해 주세요.");
      const shipping = {
        fee: input.shipping?.fee,
        freeOver: input.shipping?.freeOver,
        label: "배송·포장비",
      };
      if (
        !Number.isSafeInteger(shipping.fee) ||
        shipping.fee < 0 ||
        shipping.fee > 1_000_000 ||
        !Number.isSafeInteger(shipping.freeOver) ||
        shipping.freeOver <= 0 ||
        !Number.isInteger(input.paymentDays) ||
        input.paymentDays < 1 ||
        input.paymentDays > 14 ||
        typeof input.ordersEnabled !== "boolean"
      )
        fail("배송비·무료배송 기준·입금기한을 확인해 주세요.");
      const next = {
        ...old,
        bank,
        shipping,
        paymentDays: input.paymentDays,
        ordersEnabled: input.ordersEnabled,
      };
      delete next.revision;
      db.prepare(
        "UPDATE settings SET value=?,revision=revision+1 WHERE id=1",
      ).run(JSON.stringify(next));
      audit(actor, "settings.updated", "1");
      return settings();
    },
    createOrder(actor, input) {
      customerOnly(actor);
      expireOrders();
      const key = text(input.requestKey, 100);
      if (!/^[a-zA-Z0-9_-]{16,100}$/.test(key))
        fail("주문 요청번호를 확인해 주세요.");
      return transaction(() => {
        const existing = db
          .prepare("SELECT * FROM orders WHERE member_id=? AND request_key=?")
          .get(actor.id, key);
        if (existing) return orderValue(existing);
        const config = settings();
        if (!config.ordersEnabled)
          fail("주문 접수를 준비하고 있습니다. 워크닉에 문의해 주세요.", 409);
        if (input.acceptTerms !== true)
          fail("주문·입금·배송 안내를 확인해 주세요.");
        if (input.shippingConfirmed !== true)
          fail(
            "일반 배송 가능 여부를 확인해 주세요. 특수 배송은 담당자 확인이 필요합니다.",
          );
        if (
          !Array.isArray(input.items) ||
          !input.items.length ||
          input.items.length > 100
        )
          fail("장바구니를 확인해 주세요.");
        const items = [],
          used = new Set();
        for (const line of input.items) {
          const productId = text(line.productId, 80),
            quantity = line.quantity;
          if (
            used.has(productId) ||
            !Number.isInteger(quantity) ||
            quantity < 1 ||
            quantity > 999
          )
            fail("상품별 수량은 1~999개로 입력해 주세요.");
          used.add(productId);
          const row = db
            .prepare("SELECT * FROM products WHERE id=?")
            .get(productId);
          if (!row || !row.enabled || row.special_shipping || !row.price)
            fail(
              "주문할 수 없는 상품이 있습니다. 담당자에게 확인해 주세요.",
              409,
            );
          if (row.stock < quantity)
            fail(
              "주문 가능 수량이 변경되었습니다. 장바구니를 확인해 주세요.",
              409,
            );
          if (line.expectedPrice !== row.price)
            fail(
              "상품 가격이 변경되었습니다. 다시 확인한 뒤 주문해 주세요.",
              409,
            );
          const product = JSON.parse(row.source);
          items.push({
            productId,
            name: product.name,
            model: product.model,
            brand: product.brand,
            quantity,
            unitPrice: row.price,
            amount: row.price * quantity,
          });
        }
        const subtotal = items.reduce((s, line) => s + line.amount, 0);
        const shippingFee =
          subtotal >= config.shipping.freeOver ? 0 : config.shipping.fee;
        if (
          input.expectedSubtotal !== subtotal ||
          input.expectedShippingFee !== shippingFee
        )
          fail(
            "주문금액 또는 배송비가 변경되었습니다. 다시 확인해 주세요.",
            409,
          );
        const total = subtotal + shippingFee;
        if (!Number.isSafeInteger(total) || total > 1_000_000_000)
          fail("대량 주문은 담당자에게 문의해 주세요.");
        const vat = Math.round(total / 11);
        const rowId = id(),
          now = clock(),
          due = now + config.paymentDays * 86400_000;
        const number =
          "WN" +
          new Date(now).toISOString().slice(0, 10).replaceAll("-", "") +
          "-" +
          randomBytes(4).toString("hex").toUpperCase();
        const snapshot = {
          buyer: actor.profile,
          seller: config.seller,
          bank: config.bank,
          items,
          subtotal,
          shippingFee,
          total,
          supplyAmount: total - vat,
          vat,
          shippingLabel: config.shipping.label,
          depositor: text(input.depositor, 100) || actor.profile.companyName,
          note: text(input.note, 500),
          termsVersion: config.consentVersion,
        };
        for (const line of items)
          db.prepare(
            "UPDATE products SET stock=stock-?,revision=revision+1 WHERE id=?",
          ).run(line.quantity, line.productId);
        db.prepare(
          "INSERT INTO orders(id,number,member_id,request_key,status,snapshot,created_at,due_at) VALUES(?,?,?,?,'pending_payment',?,?,?)",
        ).run(rowId, number, actor.id, key, JSON.stringify(snapshot), now, due);
        audit(actor, "order.created", rowId, { total });
        return orderValue(
          db.prepare("SELECT * FROM orders WHERE id=?").get(rowId),
        );
      });
    },
    orders(actor) {
      expireOrders();
      const rows =
        actor.role === "admin"
          ? db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all()
          : db
              .prepare(
                "SELECT * FROM orders WHERE member_id=? ORDER BY created_at DESC",
              )
              .all(actor.id);
      return rows.map(orderValue);
    },
    order(actor, orderId) {
      expireOrders();
      const row = db.prepare("SELECT * FROM orders WHERE id=?").get(orderId);
      if (!row || (actor.role !== "admin" && row.member_id !== actor.id))
        fail("주문을 찾을 수 없습니다.", 404);
      return orderValue(row);
    },
    updateOrder(actor, orderId, input) {
      expireOrders();
      return transaction(() => {
        const row = db.prepare("SELECT * FROM orders WHERE id=?").get(orderId);
        if (!row || (actor.role !== "admin" && row.member_id !== actor.id))
          fail("주문을 찾을 수 없습니다.", 404);
        if (row.revision !== input.revision)
          fail("주문이 변경되었습니다. 다시 확인해 주세요.", 409);
        const snapshot = JSON.parse(row.snapshot);
        if (input.action === "cancel") {
          if (row.status !== "pending_payment")
            fail("입금 확인 이후 취소는 워크닉 담당자에게 문의해 주세요.", 409);
          release(row);
          db.prepare(
            "UPDATE orders SET status='cancelled',revision=revision+1 WHERE id=?",
          ).run(orderId);
        } else {
          adminOnly(actor);
          if (input.action === "confirm_payment") {
            if (row.status !== "pending_payment")
              fail("입금 대기 주문만 확인할 수 있습니다.", 409);
            if (
              input.amount !== snapshot.total ||
              !text(input.reference, 100) ||
              input.bankChecked !== true
            )
              fail(
                "실제 입금액·입금자 또는 확인번호와 은행 확인 여부를 입력해 주세요.",
              );
            const payment = {
              amount: input.amount,
              reference: text(input.reference, 100),
              confirmedBy: actor.username,
              confirmedAt: clock(),
            };
            db.prepare(
              "UPDATE orders SET status='paid',payment=?,revision=revision+1 WHERE id=?",
            ).run(JSON.stringify(payment), orderId);
          } else if (input.action === "prepare") {
            if (row.status !== "paid")
              fail("입금 확인 후 배송을 준비할 수 있습니다.", 409);
            db.prepare(
              "UPDATE orders SET status='preparing',revision=revision+1 WHERE id=?",
            ).run(orderId);
          } else if (input.action === "ship") {
            if (row.status !== "preparing")
              fail("배송 준비 상태에서 발송할 수 있습니다.", 409);
            const carrier = text(input.carrier, 50),
              tracking = text(input.tracking, 80);
            if (!carrier || !/^[A-Za-z0-9-]{5,80}$/.test(tracking))
              fail("택배사와 운송장번호를 입력해 주세요.");
            const shipment = {
              carrier,
              tracking,
              shippedBy: actor.username,
              shippedAt: clock(),
            };
            db.prepare(
              "UPDATE orders SET status='shipped',shipment=?,revision=revision+1 WHERE id=?",
            ).run(JSON.stringify(shipment), orderId);
          } else fail("올바른 주문 작업을 선택해 주세요.");
        }
        audit(actor, "order." + input.action, orderId);
        return orderValue(
          db.prepare("SELECT * FROM orders WHERE id=?").get(orderId),
        );
      });
    },
  };
  api.beta = installBeta(
    api,
    db,
    { clock, transaction, audit, adminOnly, customerOnly, settings, release },
    betaOptions,
  );
  return api;
}

// RFC 6238, base32 secrets stored only in the server environment.
export function verifyTotp(secret, code, now = Date.now()) {
  if (!/^[0-9]{6}$/.test(String(code || ""))) return false;
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.toUpperCase().replace(/[=\s]/g, "")) {
    const n = alphabet.indexOf(c);
    if (n < 0) return false;
    bits += n.toString(2).padStart(5, "0");
  }
  const key = Buffer.from(
    (bits.match(/.{8}/g) || []).map((b) => parseInt(b, 2)),
  );
  if (key.length < 16) return false;
  for (const drift of [-1, 0, 1]) {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000) + drift));
    const hash = createHmac("sha1", key).update(counter).digest();
    const offset = hash[19] & 15;
    const expected = String(
      (hash.readUInt32BE(offset) & 0x7fffffff) % 1_000_000,
    ).padStart(6, "0");
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(String(code))))
      return true;
  }
  return false;
}
