import { STATUS } from "./store.mjs";
const escape = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (n) => new Intl.NumberFormat("ko-KR").format(n) + "원";
const date = (n) =>
  new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(n);
export function statement(o) {
  const e = escape,
    pickup = o.fulfillment?.method === "pickup",
    quotation = o.status === "quote",
    title = quotation ? "견적서" : "거래명세서";
  const rows = o.items
    .map(
      (l) =>
        `<tr><td>${e(l.brand)} · ${e(l.name)}<br><small>${e(l.model)}${l.optionId && l.optionId !== "default" ? " · 옵션 " + e(l.optionLabel || l.optionId) : ""}</small></td><td>${l.quantity} ${e(l.unit)}</td><td>${money(l.unitPrice)}<br><small>부가세 ${e(l.taxMode || "포함")}</small></td><td>${money(l.amount)}</td></tr>`,
    )
    .join("");
  const destination = pickup
    ? `<h2>수령 장소</h2><p>${e(o.fulfillment.locationName)}<br>${e(o.fulfillment.address)}<br>${e(o.fulfillment.hours)}</p><p>입금 후 준비 완료 안내를 받은 뒤 방문해 주세요. 개별 비밀번호는 계정의 픽업 화면에서 확인합니다.</p>`
    : `<h2>배송지</h2><p>(${e(o.buyer.postalCode)}) ${e(o.buyer.address)} ${e(o.buyer.addressDetail)}<br>${e(o.buyer.contactName)} · ${e(o.buyer.phone)}</p>`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title} ${e(o.number)} · WORKNIC</title><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/trade/trade.css"><script src="/trade/print.js" defer></script></head><body class="statement-body"><main class="statement"><header class="statement-head"><div><p class="eyebrow">WORKNIC · BUSINESS</p><h1>${title}</h1><p>${e(o.number)} · ${e(date(o.createdAt))}</p></div><span class="badge">${e(STATUS[o.status] || o.status)}</span></header><div class="statement-parties"><section><h2>공급자</h2><p>${e(o.seller.companyName)}<br>${e(o.seller.businessNumber)}<br>${e(o.seller.address)}<br>${e(o.seller.phone)}</p></section><section><h2>공급받는 자</h2><p>${e(o.buyer.companyName)}<br>${e(o.buyer.businessNumber)}<br>${e(o.buyer.contactName)} · ${e(o.buyer.phone)}</p></section></div><div class="table-scroll"><table><caption>상품별 단가의 부가세 기준을 확인해 주세요. 금액 열은 부가세 포함입니다.</caption><thead><tr><th scope="col">품명·모델·옵션</th><th scope="col">수량·단위</th><th scope="col">단가</th><th scope="col">금액</th></tr></thead><tbody>${rows}</tbody></table></div><dl class="totals"><div><dt>상품금액 · 부가세 포함</dt><dd>${money(o.subtotal)}</dd></div><div><dt>${e(o.shippingLabel || "배송비")} · 부가세 포함</dt><dd>${money(o.shippingFee)}</dd></div><div><dt>공급가액</dt><dd>${money(o.supplyAmount)}</dd></div><div><dt>부가세</dt><dd>${money(o.vat)}</dd></div><div class="grand-total"><dt>합계${quotation ? " 견적" : " 입금"} 금액</dt><dd>${money(o.total)}</dd></div></dl><section class="bank-panel"><h2>${quotation ? "견적 안내" : o.payment ? "입금 확인" : "입금 안내"}</h2>${quotation ? "<p>이 견적을 계정 화면에서 확인·수락하면 주문과 입금 안내가 준비됩니다. 견적서만 보고 입금하지 마세요.</p>" : `<p>${e(o.bank.name)} <strong>${e(o.bank.account)}</strong><br>예금주 ${e(o.bank.holder)}${o.depositor ? " · 입금자명 " + e(o.depositor) : ""}</p>`}<p>${quotation ? "견적 유효기간" : "입금기한"}: ${e(date(o.dueAt))}</p>${o.payment ? `<p>확인일: ${e(date(o.payment.confirmedAt))} · 확인금액 ${money(o.payment.amount)}</p>` : !quotation ? `<p>${["cancelled", "expired"].includes(o.status) ? "취소 또는 만료된 주문입니다. 입금하지 말고 담당자에게 문의해 주세요." : "담당자가 실제 입금 내역을 확인한 뒤 상품을 준비합니다."}</p>` : ""}</section><section>${quotation ? `<h2>수령 방식</h2><p>${e(o.locationName)}</p>` : destination}${o.note ? `<p>요청사항: ${e(o.note)}</p>` : ""}${o.shipment ? `<p>배송: ${e(o.shipment.carrier)} · ${e(o.shipment.tracking)}</p>` : ""}</section><p class="muted">상품별 부가세 기준에 따라 원 단위 반올림한 합계입니다. 이 문서는 세금계산서 또는 결제 영수증을 대신하지 않습니다.</p><footer class="statement-actions"><button id="print-statement" class="button">인쇄·PDF 저장</button><a class="button secondary" href="/trade/#orders">견적·주문 내역</a></footer></main></body></html>`;
}
