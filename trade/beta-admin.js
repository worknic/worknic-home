import {
  $,
  el,
  call,
  login,
  logout,
  button,
  link,
  field,
  formTask,
  card,
  dl,
  money,
  date,
  labels,
  say,
} from "./beta-common.js";
import { adminRefunds, adminRecovery, orderAftercare } from "./aftercare-ui.js";
let actor = null,
  lastPreview = null;
async function prices(root) {
  const c = card("판매가 엑셀 일괄 관리");
  c.append(
    el(
      "p",
      "현재 공통 판매가는 미정으로 운영합니다. 업체별 단가는 견적·주문에서 해당 견적에만 입력합니다. 향후 공통 가격표가 확정되면 최신 엑셀 양식으로 관리할 수 있습니다.",
    ),
    link("판매가 엑셀 내려받기", "/api/beta/admin/prices/template"),
  );
  const f = el("form"),
    file = field(f, "file", "판매가 엑셀 파일", "", "file");
  file.accept = ".xlsx";
  const preview = el("div");
  f.append(el("button", "변경 미리보기", "button"));
  formTask(f, async () => {
    if (!file.files[0]) throw Error("엑셀 파일을 선택해 주세요.");
    const r = await fetch("/api/beta/admin/prices/file", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/octet-stream" },
        body: file.files[0],
        signal: AbortSignal.timeout(45000),
      }),
      j = await r.json();
    if (!r.ok) throw Error(j.error);
    lastPreview = j;
    preview.replaceChildren(
      el("p", `적용 가능 ${j.valid}개 · 오류 ${j.invalid}개`),
    );
    const table = el("table"),
      head = el("tr");
    for (const label of [
      "행",
      "상품·옵션",
      "이전 가격",
      "새 가격",
      "검증 결과",
    ])
      head.append(el("th", label));
    table.append(head);
    for (const x of j.rows) {
      const row = el("tr");
      for (const text of [
        x.row,
        x.after ? x.after.productId + " / " + x.after.optionId : "확인 필요",
        x.before?.price == null ? "미정" : money(x.before.price),
        x.after?.price == null ? "미정" : money(x.after.price),
        x.errors.join(" / ") || "적용 가능",
      ])
        row.append(el("td", text));
      table.append(row);
    }
    const wrap = el("div", null, "table-wrap");
    wrap.append(table);
    preview.append(wrap);
    if (!j.invalid)
      preview.append(
        button("확인한 가격 일괄 적용", async () => {
          const r = await call("/admin/prices/apply", { id: lastPreview.id });
          lastPreview = null;
          say(
            r.applied +
              "개 판매가를 적용했습니다. 기존 견적·주문 금액은 유지됩니다.",
          );
          route();
        }),
      );
  });
  c.append(f, preview);
  c.append(
    button(
      "공통 판매가 모두 미정으로",
      async () => {
        if (
          !confirm(
            "공통 판매가를 모두 미정으로 전환할까요? 기존 견적·주문 금액과 재고는 유지됩니다.",
          )
        )
          return;
        const r = await call("/admin/prices/undetermined", { confirmed: true });
        say(r.applied + "개 상품·옵션의 공통 판매가를 미정으로 전환했습니다.");
        route();
      },
      "button secondary",
    ),
  );
  root.append(c);
  const { history } = await call("/admin/prices/history");
  for (const h of history) {
    const item = card("가격 적용 내역 · " + date(h.created_at));
    item.append(
      el("p", h.status === "restored" ? "이전 가격 복원됨" : "일괄 적용 완료"),
    );
    let restoreConfirmation;
    if (h.status === "applied")
      item.append(
        button(
          "이전 가격으로 복원",
          async () => {
            if (restoreConfirmation?.isConnected) return;
            restoreConfirmation = el("div");
            restoreConfirmation.append(
              el("p", "적용 이후 수정되지 않은 가격을 이전 값으로 복원할까요?"),
              button("복원 확인", async () => {
                await call("/admin/prices/restore", { id: h.id });
                say("이전 가격을 복원했습니다.");
                route();
              }),
              button(
                "취소",
                () => restoreConfirmation.remove(),
                "button secondary",
              ),
            );
            item.append(restoreConfirmation);
          },
          "button secondary",
        ),
      );
    root.append(item);
  }
  const stocks = card("주문 가능 수량");
  stocks.append(
    button(
      "공개 상품 동기화",
      async () => {
        const r = await call("/admin/catalog-sync", {});
        say(
          r.imported + "개 공개 상품을 동기화했습니다. 가격·수량은 유지됩니다.",
        );
        route();
      },
      "button secondary",
    ),
  );
  const search = field(stocks, "stockSearch", "상품 검색");
  search.required = false;
  const list = el("div", null, "cards");
  stocks.append(list);
  const { products } = await call("/admin/products");
  const render = () => {
    list.replaceChildren(
      ...products
        .filter((p) =>
          [p.name, p.model, p.id]
            .join(" ")
            .toLowerCase()
            .includes(search.value.toLowerCase()),
        )
        .slice(0, 30)
        .map((p) => {
          const f = el("form", null, "stock-item");
          f.append(el("p", p.name + " · " + p.model + " · " + p.optionLabel));
          field(f, "stock", "주문 가능 수량", p.stock, "number");
          field(f, "enabled", "수량 확인·주문 가능", p.enabled, "checkbox");
          f.append(el("button", "수량 저장", "button"));
          formTask(f, async (d) => {
            await call("/admin/products/stock", {
              id: p.id,
              optionId: p.optionId,
              revision: p.revision,
              stock: Number(d.stock),
              enabled: d.enabled === "on",
            });
            say("수량을 저장했습니다.");
            route();
          });
          return f;
        }),
    );
  };
  search.oninput = render;
  render();
  root.append(stocks);
}
async function members(root) {
  root.append(
    el(
      "p",
      "회원 승인은 기존 OS 사업자회원 관리에서 처리합니다. 여기서는 승인된 사업자정보와 계정을 대조하고 실제 담당자 연락처를 확인한 뒤 계정 확인 링크를 준비합니다.",
      "muted",
    ),
    link("OS 사업자 승인 열기", "https://worknic.tools/business-members/"),
  );
  const { members } = await call("/admin/members");
  for (const m of members) {
    const c = card(m.profile.companyName);
    c.append(
      el(
        "p",
        m.username + " · " + m.profile.businessNumber + " · " + m.profile.email,
      ),
      el(
        "p",
        "거래 계정 등록 상태: " +
          (labels[m.status] || m.status) +
          " · 실제 거래 권한은 OS 사업자 승인에서 확인합니다.",
        "muted",
      ),
    );
    const f = el("form");
    field(
      f,
      "checked",
      "등록된 담당자와 직접 연락하여 계정 사용자를 확인했습니다.",
      false,
      "checkbox",
    ).required = true;
    f.append(el("button", "OS 승인 대조·계정 확인 링크 만들기", "button"));
    formTask(f, async () => {
      const r = await call("/admin/members/bind", {
          id: m.id,
          contactVerified: true,
        }),
        url =
          location.origin +
          "/trade/#account?activate=" +
          encodeURIComponent(r.token),
        box = el("div");
      box.append(
        el(
          "p",
          "등록된 담당자에게 전달하세요. 30분 동안 한 번만 사용할 수 있습니다.",
          "muted",
        ),
      );
      const a = el("a", "계정 확인 링크");
      a.href = url;
      box.append(a);
      c.append(box);
    });
    c.append(f);
    root.append(c);
  }
}
async function quotes(root) {
  const { quotes } = await call("/admin/quotes");
  for (const q of quotes) {
    const c = card("견적 " + q.id.slice(0, 8));
    c.append(
      el("span", labels[q.status] || q.status, "badge"),
      el(
        "p",
        "거래처: " +
          (q.companyName || "거래 계정 확인 필요") +
          " · " +
          (q.businessNumber || ""),
      ),
      el(
        "p",
        q.items
          .map((x) => x.name + " · " + x.optionId + " · " + x.quantity)
          .join(" / "),
      ),
      el("p", q.locationName),
    );
    if (q.status === "requested") {
      const f = el("form");
      f.append(
        el(
          "p",
          "업체별 단가를 이 견적에만 적용합니다. 공통 판매가와 다른 업체의 견적은 변경되지 않습니다.",
        ),
      );
      const individual = q.items.map((line, i) => {
        const box = card(
          line.name +
            " · " +
            line.model +
            " · " +
            (line.optionLabel || line.optionId) +
            " · 요청 수량 " +
            line.quantity,
        );
        const amount = field(box, "amount" + i, "개별 단가 · 원", "", "number");
        amount.min = 1;
        amount.max = 100000000;
        const unit = field(box, "unit" + i, "확인한 판매단위");
        const label = el("label", "부가세 기준"),
          tax = el("select");
        tax.required = true;
        for (const [value, name] of [
          ["", "선택해 주세요"],
          ["포함", "부가세 포함"],
          ["별도", "부가세 별도"],
        ]) {
          const o = el("option", name);
          o.value = value;
          tax.append(o);
        }
        label.append(tax);
        box.append(label);
        f.append(box);
        return { line, amount, unit, tax };
      });
      field(f, "pickupFee", "픽업 비용 · 무료", 0, "number").readOnly = true;
      field(f, "expiresAt", "견적 유효기간", "", "datetime-local");
      field(
        f,
        "specialOrder",
        "견적 전체가 주문제작·별도 발주 상품이며, 일반 재고 상품을 섞지 않았습니다.",
        false,
        "checkbox",
      );
      f.append(
        el(
          "p",
          "주문제작·별도 발주 상품은 취소 기준을 견적에 명시합니다. 일반 재고 상품은 별도 견적으로 나누세요.",
          "muted",
        ),
      );
      field(
        f,
        "checked",
        "가격표·규격·포함품·수량·픽업 비용을 확인했습니다.",
        false,
        "checkbox",
      ).required = true;
      f.append(el("button", "견적서 발행", "button"));
      formTask(f, async (d) => {
        await call("/admin/quotes/issue", {
          id: q.id,
          revision: q.revision,
          pickupFee: Number(d.pickupFee),
          expiresAt: new Date(d.expiresAt).getTime(),
          conditionsConfirmed: true,
          specialOrder: d.specialOrder === "on",
          specialOrderAcknowledged: d.specialOrder === "on",
          items: individual.map(({ line, amount, unit, tax }) => ({
            productId: line.productId,
            optionId: line.optionId,
            unitPrice: Number(amount.value),
            unit: unit.value,
            taxMode: tax.value,
          })),
        });
        say("견적서를 발행했습니다.");
        route();
      });
      c.append(f);
    } else if (q.total)
      c.append(
        dl([
          ["합계", money(q.total)],
          ["발행", date(q.issuedAt)],
        ]),
        link("견적서 보기", "/api/beta/quotes/" + q.id + "/print"),
      );
    root.append(c);
  }
  await orderList(false, root);
}
async function orderList(pickupOnly, root) {
  const { orders } = await call("/admin/orders");
  const { refunds = [] } = await call("/admin/refunds");
  root.append(el("h2", pickupOnly ? "픽업 주문" : "확정 주문"));
  for (const o of orders) {
    const refundHold = refunds.some(
      (r) => r.orderId === o.id && ["requested", "approved"].includes(r.status),
    );
    const c = card(o.number);
    c.append(
      el("span", labels[o.status] || o.status, "badge"),
      dl([
        ["거래처", o.buyer.companyName],
        ["연락처", o.buyer.phone],
        ["합계", money(o.total)],
        ["픽업", o.fulfillment?.locationName || "배송"],
      ]),
      link("거래명세서", "/api/beta/orders/" + o.id + "/statement"),
    );
    orderAftercare(c, o, refunds, route, true);
    if (o.specialOrder) {
      c.append(
        el("p", o.cancellationPolicy),
        el(
          "p",
          o.procurement?.state === "started"
            ? "제작·발주 시작 기록: " + date(o.procurement.startedAt)
            : "제작·발주 전",
        ),
      );
      if (
        !refundHold &&
        ["paid", "preparing"].includes(o.status) &&
        o.procurement?.state !== "started"
      ) {
        const sf = el("form");
        field(
          sf,
          "reference",
          "실제 제작·발주 시작 내부 확인번호 · 고객에게 공개하지 않음",
        );
        field(
          sf,
          "confirmed",
          "실제 제작·발주를 시작했으며, 이 화면은 공급사 발주를 대신하지 않음을 확인했습니다.",
          false,
          "checkbox",
        ).required = true;
        sf.append(el("button", "제작·발주 시작 기록", "button secondary"));
        formTask(sf, async (d) => {
          await call("/admin/orders/special-start", {
            id: o.id,
            orderRevision: o.revision,
            reference: d.reference,
            actualStartConfirmed: true,
          });
          say(
            "실제 제작·발주 시작을 기록했습니다. 이후 단순 변심 취소는 건별 협의합니다.",
          );
          route();
        });
        c.append(sf);
      }
    }
    if (o.status === "pending_payment") {
      const f = el("form");
      field(f, "amount", "실제 입금액", "", "number");
      field(f, "reference", "입금자 또는 확인번호");
      field(
        f,
        "checked",
        "실제 은행 내역과 입금액을 확인했습니다.",
        false,
        "checkbox",
      ).required = true;
      f.append(el("button", "입금 확인", "button"));
      formTask(f, async (d) => {
        await call("/admin/orders/update", {
          id: o.id,
          revision: o.revision,
          action: "confirm_payment",
          amount: Number(d.amount),
          reference: d.reference,
          bankChecked: true,
        });
        say("입금을 확인했습니다.");
        route();
      });
      c.append(f);
    }
    if (
      pickupOnly &&
      !refundHold &&
      ["paid", "preparing"].includes(o.status) &&
      !o.pickup &&
      o.fulfillment?.locationId === "jinjeop"
    ) {
      const f = el("form");
      f.append(
        el("h3", "진접 담당자 대면 전달"),
        el(
          "p",
          "보관함과 비밀번호 없이, 확인된 담당자가 직접 전달합니다. 픽업 비용은 무료입니다.",
        ),
      );
      field(f, "meetingPoint", "정확한 만남 지점", o.fulfillment.address);
      field(f, "staffContact", "고객에게 안내할 담당자·업무 연락처");
      field(f, "availableFrom", "수령 시작", "", "datetime-local");
      field(f, "availableUntil", "수령 마감", "", "datetime-local");
      field(
        f,
        "staged",
        "상품·수량을 대면 전달용으로 준비했습니다.",
        false,
        "checkbox",
      ).required = true;
      field(
        f,
        "staffConfirmed",
        "전달 담당자와 만남 장소·시간을 확인했습니다.",
        false,
        "checkbox",
      ).required = true;
      f.append(el("button", "대면 전달 준비 완료", "button"));
      formTask(f, async (d) => {
        await call("/admin/handoffs/ready", {
          ...d,
          id: o.id,
          revision: o.revision,
          availableFrom: new Date(d.availableFrom).getTime(),
          availableUntil: new Date(d.availableUntil).getTime(),
          staged: true,
          staffConfirmed: true,
        });
        say(
          "대면 전달 준비를 저장했습니다. 고객에게 장소·시간을 안내해 주세요.",
        );
        route();
      });
      c.append(f);
    }
    if (
      pickupOnly &&
      !refundHold &&
      ["paid", "preparing"].includes(o.status) &&
      !o.pickup &&
      o.fulfillment?.locationId !== "jinjeop"
    ) {
      const { slots } = await call("/admin/slots"),
        f = el("form"),
        label = el("label", "보관함"),
        select = el("select");
      select.name = "slotId";
      for (const s of slots.filter(
        (s) => s.location_id === o.fulfillment?.locationId && s.enabled,
      )) {
        const op = el("option", s.label);
        op.value = s.id;
        select.append(op);
      }
      label.append(select);
      f.append(label);
      const pin = field(
        f,
        "pin",
        "실제 잠금장치에 설정한 개별 비밀번호",
        "",
        "password",
      );
      pin.pattern = "[0-9]{6,12}";
      pin.autocomplete = "off";
      const startNow = field(
        f,
        "startNow",
        "준비 완료 처리 시점부터 수령 가능",
        o.fulfillment?.locationId !== "jinjeop",
        "checkbox",
      );
      const from = field(f, "availableFrom", "수령 시작", "", "datetime-local");
      const syncStart = () => {
        from.disabled = startNow.checked;
        from.required = !startNow.checked;
      };
      startNow.addEventListener("change", syncStart);
      syncStart();
      field(f, "availableUntil", "수령 마감", "", "datetime-local");
      field(
        f,
        "staged",
        "상품·수량을 보관함에 배치했습니다.",
        false,
        "checkbox",
      ).required = true;
      field(
        f,
        "physical",
        "해당 잠금장치의 개별 비밀번호를 실제로 설정·확인했습니다.",
        false,
        "checkbox",
      ).required = true;
      f.append(el("button", "픽업 준비 완료", "button"));
      formTask(f, async (d) => {
        await call("/admin/pickups/ready", {
          ...d,
          id: o.id,
          revision: o.revision,
          availableFrom:
            d.startNow === "on"
              ? Date.now()
              : new Date(d.availableFrom).getTime(),
          availableUntil: new Date(d.availableUntil).getTime(),
          staged: true,
          physicalCodeConfigured: true,
        });
        f.reset();
        say(
          "픽업 준비 완료 상태로 변경했습니다. 고객에게 앱에서 수령 기간과 코드를 확인하도록 안내해 주세요.",
        );
        route();
      });
      c.append(f);
    }
    if (pickupOnly && !refundHold && o.pickup?.mode === "handoff") {
      c.append(
        dl([
          ["수령 방식", "담당자 대면 전달"],
          ["만남 지점", o.pickup.meetingPoint],
          ["담당자·업무 연락처", o.pickup.staffContact],
          ["수령 시작", date(o.pickup.availableFrom)],
          ["수령 마감", date(o.pickup.availableUntil)],
          ["상태", labels[o.pickup.status] || o.pickup.status],
        ]),
      );
      const f = el("form"),
        label = el("label", "대면 전달 결과"),
        result = el("select");
      result.name = "result";
      for (const [value, name] of [
        ["collected", "수령자에게 직접 전달 완료"],
        ["not_collected", "기간 종료·미수령"],
      ]) {
        const option = el("option", name);
        option.value = value;
        result.append(option);
      }
      label.append(result);
      f.append(label);
      field(
        f,
        "recipientChecked",
        "실제 수령자·상품·수량 또는 미수령 결과를 확인했습니다.",
        false,
        "checkbox",
      ).required = true;
      f.append(el("button", "대면 전달 결과 저장", "button"));
      formTask(f, async (d) => {
        await call("/admin/handoffs/close", {
          id: o.id,
          revision: o.pickup.revision,
          result: d.result,
          recipientChecked: true,
        });
        say("대면 전달 결과를 기록했습니다.");
        route();
      });
      c.append(f);
    }
    if (pickupOnly && !refundHold && o.pickup && o.pickup.mode !== "handoff") {
      c.append(
        dl([
          ["보관함", o.pickup.slotLabel],
          ["수령 마감", date(o.pickup.availableUntil)],
          ["상태", labels[o.pickup.status] || o.pickup.status],
        ]),
      );
      const f = el("form"),
        label = el("label", "실제 확인 결과"),
        s = el("select");
      s.name = "result";
      for (const [v, t] of [
        ["collected", "수령 완료 확인"],
        ["not_collected", "미수령·담당자 처리"],
      ]) {
        const op = el("option", t);
        op.value = v;
        s.append(op);
      }
      label.append(s);
      f.append(label);
      field(
        f,
        "compartment",
        "보관함의 실제 상품·수령 여부를 확인했습니다.",
        false,
        "checkbox",
      ).required = true;
      field(
        f,
        "revoked",
        "실제 잠금장치에서 이전 비밀번호를 변경·폐기했습니다.",
        false,
        "checkbox",
      ).required = true;
      f.append(el("button", "수령 확인·보관함 사용 종료", "button"));
      formTask(f, async (d) => {
        await call("/admin/pickups/close", {
          id: o.id,
          revision: o.pickup.revision,
          result: d.result,
          physicalCodeRevoked: true,
          compartmentChecked: true,
        });
        say("확인 기록을 저장하고 보관함을 비웠습니다.");
        route();
      });
      c.append(f);
    }
    root.append(c);
  }
}
async function pickups(root) {
  await orderList(true, root);
}
async function settings(root) {
  const config = await call("/admin/config"),
    c = card("베타 접수");
  const policy = card("확정 운영 기준 · 일반 재고 상품 취소");
  policy.append(
    el(
      "p",
      "일반 재고 상품은 수령 전 취소 시 남은 입금액 전액 환불. 담당자가 상품 준비·전달을 중단한 뒤 처리합니다.",
    ),
  );
  if (config.standardPreReceiptCancellation?.value === "full_refund")
    policy.append(
      el(
        "p",
        "확정 저장됨 · " +
          date(config.standardPreReceiptCancellation.confirmedAt),
      ),
    );
  else {
    const pf = el("form");
    field(
      pf,
      "confirmed",
      "일반 재고 상품의 수령 전 전액 환불 기준을 확정했습니다.",
      false,
      "checkbox",
    ).required = true;
    pf.append(el("button", "취소 기준 확정 저장", "button"));
    formTask(pf, async () => {
      await call("/admin/policies/standard-cancellation", {
        revision: config.revision,
        value: "full_refund",
        confirmed: true,
      });
      say("일반 재고 상품의 수령 전 전액 환불 기준을 저장했습니다.");
      route();
    });
    policy.append(pf);
  }
  root.append(policy);
  const specialPolicy = card("확정 운영 기준 · 주문제작·별도 발주 상품");
  specialPolicy.append(
    el(
      "p",
      "단순 변심 취소는 제작·발주 전 전액 환불, 시작 후 건별 협의로 처리합니다. 견적에 해당 상품임을 명시하고 실제 시작 기록을 남깁니다.",
    ),
  );
  if (
    config.specialOrderCancellation?.value ===
    "full_before_start_agreement_after"
  )
    specialPolicy.append(
      el(
        "p",
        "확정 저장됨 · " + date(config.specialOrderCancellation.confirmedAt),
      ),
    );
  else {
    const sf = el("form");
    field(
      sf,
      "confirmed",
      "주문제작·별도 발주 상품의 시작 전 전액 환불·시작 후 건별 협의 기준을 확정했습니다.",
      false,
      "checkbox",
    ).required = true;
    sf.append(el("button", "특수 상품 취소 기준 확정 저장", "button"));
    formTask(sf, async () => {
      await call("/admin/policies/special-cancellation", {
        revision: config.revision,
        value: "full_before_start_agreement_after",
        confirmed: true,
      });
      say("주문제작·별도 발주 상품의 취소 기준을 저장했습니다.");
      route();
    });
    specialPolicy.append(sf);
  }
  root.append(specialPolicy);
  const returnPolicy = card("확정 운영 기준 · 일반 재고 단순 변심 반품 기간");
  returnPolicy.append(
    el(
      "p",
      "실제 수령 다음날을 1일째로 계산하여 7일째 한국 시간 23:59까지 신청합니다. 반품 비용은 별도 확정합니다.",
    ),
  );
  if (config.standardReturnPeriod?.days === 7)
    returnPolicy.append(
      el("p", "확정 저장됨 · " + date(config.standardReturnPeriod.confirmedAt)),
    );
  else {
    const rf = el("form");
    field(
      rf,
      "confirmed",
      "일반 재고 상품의 수령 다음날부터 7일 이내 반품 접수 기준을 확정했습니다.",
      false,
      "checkbox",
    ).required = true;
    rf.append(el("button", "반품 접수기간 확정 저장", "button"));
    formTask(rf, async () => {
      await call("/admin/policies/standard-return-period", {
        revision: config.revision,
        days: 7,
        confirmed: true,
      });
      say("일반 재고 상품의 단순 변심 반품 접수기간을 7일로 저장했습니다.");
      route();
    });
    returnPolicy.append(rf);
  }
  root.append(returnPolicy);
  const conditionPolicy = card("확정 운영 기준 · 단순 변심 반품의 상품 상태");
  conditionPolicy.append(
    el(
      "p",
      "제품이 미사용이고 구성품·라벨·포장이 온전히 보존된 경우 외부 박스 개봉을 허용합니다. 반품 비용은 별도 확정합니다.",
    ),
  );
  if (
    config.standardReturnCondition?.value ===
    "unused_complete_outer_box_open_allowed"
  )
    conditionPolicy.append(
      el(
        "p",
        "확정 저장됨 · " + date(config.standardReturnCondition.confirmedAt),
      ),
    );
  else {
    const cf = el("form");
    field(
      cf,
      "confirmed",
      "미사용·구성품·라벨·포장 보존 시 외부 박스 개봉 허용 기준을 확정했습니다.",
      false,
      "checkbox",
    ).required = true;
    cf.append(el("button", "반품 상품 상태 기준 확정 저장", "button"));
    formTask(cf, async () => {
      await call("/admin/policies/standard-return-condition", {
        revision: config.revision,
        value: "unused_complete_outer_box_open_allowed",
        confirmed: true,
      });
      say("단순 변심 반품의 상품 상태 기준을 저장했습니다.");
      route();
    });
    conditionPolicy.append(cf);
  }
  root.append(conditionPolicy);
  const f = el("form");
  field(
    f,
    "registrationEnabled",
    "계정 신청 열기",
    config.registrationEnabled,
    "checkbox",
  );
  field(
    f,
    "betaEnabled",
    "견적·픽업 신청 열기",
    config.betaEnabled,
    "checkbox",
  );
  field(
    f,
    "documentsConfirmed",
    "부가세·문서 양식·개인정보·수령 운영 기준을 확인했습니다.",
    config.documentsConfirmed,
    "checkbox",
  );
  f.append(el("button", "접수 설정 저장", "button"));
  formTask(f, async (d) => {
    await call("/admin/config", {
      revision: config.revision,
      registrationEnabled: d.registrationEnabled === "on",
      betaEnabled: d.betaEnabled === "on",
      documentsConfirmed: d.documentsConfirmed === "on",
    });
    say("접수 설정을 저장했습니다.");
    route();
  });
  c.append(f);
  root.append(c);
  const { locations } = await call("/admin/locations");
  for (const l of locations) {
    const c = card(l.name),
      f = el("form");
    field(f, "address", "확인된 수령 주소", l.address);
    field(f, "hours", "운영 요일·시간 및 수령 조건", l.hours);
    field(f, "noticeUrl", "확인한 공식 공지 주소", l.noticeUrl, "url");
    field(f, "fee", "기본 픽업 비용 · 무료", 0, "number").readOnly = true;
    field(
      f,
      "sourceVerified",
      "공지 원문·현장 수령 조건·비용을 확인했습니다.",
      l.sourceVerified,
      "checkbox",
    );
    field(f, "enabled", "이 장소의 신청 열기", l.enabled, "checkbox");
    f.append(el("button", "장소 설정 저장", "button"));
    formTask(f, async (d) => {
      await call("/admin/locations", {
        ...d,
        id: l.id,
        revision: l.revision,
        fee: d.fee === "" ? null : Number(d.fee),
        enabled: d.enabled === "on",
        sourceVerified: d.sourceVerified === "on",
      });
      say("장소 설정을 저장했습니다.");
      route();
    });
    c.append(f);
    root.append(c);
  }
  const slot = card("개별 비밀번호 보관함 등록"),
    sf = el("form");
  field(sf, "id", "보관함 ID · 영문·숫자");
  field(sf, "label", "보관함 표시 이름");
  const label = el("label", "장소"),
    select = el("select");
  select.name = "locationId";
  for (const l of locations) {
    const o = el("option", l.name);
    o.value = l.id;
    select.append(o);
  }
  label.append(select);
  sf.append(label);
  field(sf, "enabled", "보관함 사용", false, "checkbox");
  sf.append(el("button", "보관함 등록", "button"));
  formTask(sf, async (d) => {
    await call("/admin/slots", { ...d, enabled: d.enabled === "on" });
    say("보관함을 등록했습니다.");
    route();
  });
  slot.append(sf);
  root.append(slot);
}
function auth() {
  const c = card("OS 관리자 연결"),
    f = el("form");
  c.append(
    el(
      "p",
      "운영에서는 워크닉 OS에서 이 관리 화면을 열어 주세요. 아래 로그인은 검증 환경 또는 운영 담당자용입니다.",
    ),
  );
  field(f, "username", "관리자 아이디");
  field(f, "password", "비밀번호", "", "password");
  field(f, "otp", "인증 앱 코드").required = false;
  f.append(el("button", "로그인", "button"));
  formTask(f, async () => {
    await login(f);
    await load();
  });
  c.append(f);
  $("#view").append(c);
}
let routeRevision = 0;
async function route() {
  const revision = ++routeRevision,
    view = $("#view"),
    root = el("div");
  view.replaceChildren();
  if (!actor) {
    auth();
    return;
  }
  const name = location.hash.slice(1).split("?")[0] || "prices";
  document
    .querySelectorAll(".nav a")
    .forEach((a) =>
      a.setAttribute("aria-current", a.hash === "#" + name ? "page" : "false"),
    );
  try {
    if (name === "refunds") await adminRefunds(root, route);
    else if (name === "recovery") await adminRecovery(root, route);
    else if (name === "members") await members(root);
    else if (name === "quotes") await quotes(root);
    else if (name === "pickups") await pickups(root);
    else if (name === "settings") await settings(root);
    else await prices(root);
    if (revision === routeRevision) view.replaceChildren(...root.childNodes);
  } catch (e) {
    if (revision === routeRevision) say(e.message, true);
  }
}
async function load() {
  try {
    actor = (await call("/me")).member;
    if (actor.role !== "admin") throw Error("관리자 계정이 필요합니다.");
    say("관리자 연결 완료 · 운영 원본과 상품자료는 보존됩니다.");
  } catch (e) {
    actor = null;
    say(e.message, true);
  }
  route();
}
function requestOSConnection() {
  if (location.hash !== "#os-connect" || !window.opener) return false;
  ++routeRevision;
  $("#view").replaceChildren();
  say("OS 관리자 연결을 확인하고 있습니다.");
  window.opener.postMessage(
    { type: "WORKNIC_TRADE_READY" },
    "https://worknic.tools",
  );
  return true;
}
window.addEventListener("hashchange", () => {
  if (!requestOSConnection()) route();
});
window.addEventListener("message", async (e) => {
  if (e.origin !== "https://worknic.tools" || e.source !== window.opener)
    return;
  if (e.data?.type === "WORKNIC_OS_LOGOUT") {
    actor = null;
    $("#view").replaceChildren();
    await logout();
  }
  if (
    e.data?.type === "WORKNIC_OS_SESSION" &&
    typeof e.data.token === "string"
  ) {
    try {
      await call("/admin/os-connect", { token: e.data.token });
      history.replaceState(null, "", "/trade/admin#prices");
      await load();
    } catch (x) {
      say(x.message, true);
    }
  }
});
if (!requestOSConnection()) load();
