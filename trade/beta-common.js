export const $ = (s) => document.querySelector(s),
  el = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text != null) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
export const money = (n) => new Intl.NumberFormat("ko-KR").format(n) + "원",
  date = (n) =>
    new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      dateStyle: "medium",
      timeStyle: "short",
    }).format(n);
export const labels = {
  requested: "견적 요청",
  issued: "견적서 도착",
  accepted: "주문 전환",
  pending_payment: "입금 대기",
  paid: "입금 확인",
  preparing: "수령 준비",
  pickup_ready: "픽업 준비 완료",
  pickup_reported: "수령 확인 중",
  collected: "수령 완료",
  pickup_exception: "담당자 확인 필요",
  expired: "입금기한 만료",
  cancelled: "취소",
  refunded: "전액 환불 완료",
  cancelled_settled: "협의 취소 정산 완료",
  pending: "승인 대기",
  approved: "승인",
  suspended: "거래 정지",
  rejected: "반려",
  ready: "수령 가능",
  reported: "수령 확인 중",
  expired_reset_required: "수령기간 만료 · 담당자 확인",
  expired_handoff: "대면 수령기간 종료 · 담당자 확인",
};
export function say(text, error = false) {
  const n = $("#status");
  n.textContent = text;
  n.className = "status" + (error ? " error" : "");
}
export async function call(path, input) {
  const r = await fetch("/api/beta" + path, {
    method: input === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: input === undefined ? {} : { "Content-Type": "application/json" },
    body: input === undefined ? undefined : JSON.stringify(input),
    signal: AbortSignal.timeout(45000),
  });
  let j;
  try {
    j = await r.json();
  } catch {
    throw Error("베타 서버 연결을 준비하고 있습니다.");
  }
  if (!r.ok) {
    const e = Error(j.error || "처리 결과를 확인하지 못했습니다.");
    e.status = r.status;
    throw e;
  }
  return j;
}
export async function login(form) {
  const r = await fetch("/api/trade/login", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Object.fromEntries(new FormData(form))),
    signal: AbortSignal.timeout(30000),
  });
  const j = await r.json();
  if (!r.ok) throw Error(j.error || "로그인을 확인해 주세요.");
  return j;
}
export async function logout() {
  await fetch("/api/trade/logout", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  location.reload();
}
export function button(text, fn, cls = "button") {
  const b = el("button", text, cls);
  b.type = "button";
  b.addEventListener("click", async () => {
    b.disabled = true;
    try {
      await fn();
    } catch (e) {
      say(e.message, true);
    } finally {
      b.disabled = false;
    }
  });
  return b;
}
export function link(text, url, cls = "button secondary") {
  const a = el("a", text, cls);
  a.href = url;
  return a;
}
export function field(form, name, label, value = "", type = "text") {
  const l = el("label", label),
    i = el("input");
  i.type = type;
  i.name = name;
  if (type === "checkbox") {
    i.checked = value === true;
    l.className = "check";
    l.prepend(i);
  } else {
    i.value = value ?? "";
    i.required = true;
    if (type === "number") {
      i.min = "0";
      i.step = "1";
    }
    l.append(i);
  }
  form.append(l);
  return i;
}
export function formTask(form, fn) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (form.dataset.busy || !form.reportValidity()) return;
    form.dataset.busy = "true";
    const bs = [...form.querySelectorAll("button")];
    bs.forEach((b) => (b.disabled = true));
    try {
      await fn(Object.fromEntries(new FormData(form)));
    } catch (e) {
      say(e.message, true);
    } finally {
      delete form.dataset.busy;
      bs.forEach((b) => (b.disabled = false));
    }
  });
}
export function card(title) {
  const n = el("article", null, "card");
  n.append(el("h3", title));
  return n;
}
export function dl(values) {
  const root = el("dl", null, "facts");
  for (const [k, v] of values) {
    const r = el("div");
    r.append(el("dt", k), el("dd", v));
    root.append(r);
  }
  return root;
}
