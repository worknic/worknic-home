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
import { readTradeEntry, entryProduct } from "./entry-intent.js";
import { orderAftercare, recoveryForm, resetForm } from "./aftercare-ui.js";
const entry = readTradeEntry(location.search);
let focusedProductId = entry.productId,
  loginReturn = entry.next,
  routeRevision = 0;
let member = null,
  bound = false,
  runtime = null,
  catalog = { products: [], brands: [] },
  cart = [],
  pinTimers = [];
try {
  cart = JSON.parse(localStorage.getItem("worknic_beta_cart") || "[]");
  if (!Array.isArray(cart)) cart = [];
} catch {}
const save = () =>
  localStorage.setItem(
    "worknic_beta_cart",
    JSON.stringify(
      cart.map((x) => ({
        productId: x.productId,
        optionId: x.optionId,
        quantity: x.quantity,
      })),
    ),
  );
const clearPins = () => {
    pinTimers.forEach(clearTimeout);
    pinTimers = [];
    document.querySelectorAll(".pin").forEach((x) => x.remove());
  },
  allowed = () => member?.status === "approved" && bound;
async function identity() {
  try {
    const r = await call("/me");
    member = r.member;
    bound = r.bound;
  } catch {
    member = null;
    bound = false;
  }
}
function authNotice(destination = "orders") {
  loginReturn = destination;
  const c = card("사업자 확인 후 이용할 수 있습니다.");
  c.append(
    el(
      "p",
      "워크닉의 승인을 받고 담당자가 전달한 계정 확인 링크에서 본인 확인을 완료해 주세요.",
    ),
    link("로그인·계정 확인", "#account"),
  );
  return c;
}
function productCard(p) {
  const c = el("article", null, "product"),
    frame = el("div", null, "photo"),
    img = el("img");
  img.src = p.thumbnail?.editedSource || p.images?.[0] || "/assets/logo.png";
  img.alt = p.name;
  img.loading = "lazy";
  frame.append(img);
  if (window.WORKNIC_MEDIA?.valid(p.thumbnail))
    window.WORKNIC_MEDIA.frame(img, p.thumbnail);
  c.append(frame, el("h3", p.name), el("p", p.model || p.id, "model"));
  let option = "default";
  if (p.variants?.length) {
    option = String(p.variants[0].sourceId || p.variants[0].id);
    const s = el("select");
    s.setAttribute("aria-label", p.name + " 옵션");
    for (const v of p.variants) {
      const o = el(
        "option",
        v.name || v.label || v.option || v.model || v.sourceId,
      );
      o.value = String(v.sourceId || v.id);
      s.append(o);
    }
    s.onchange = () => (option = s.value);
    c.append(s);
  }
  const actions = el("div", null, "actions");
  actions.append(
    link(
      "규격 보기",
      "https://worknic.co.kr/products/?id=" + encodeURIComponent(p.id),
    ),
    button("견적에 담기", () => {
      if (!allowed()) {
        loginReturn = "catalog";
        say("사업자 승인과 계정 확인 후 이용해 주세요.");
        location.hash = "account";
        return;
      }
      const old = cart.find(
        (x) => x.productId === p.id && x.optionId === option,
      );
      if (old) old.quantity = Math.min(999, old.quantity + 1);
      else cart.push({ productId: p.id, optionId: option, quantity: 1 });
      save();
      say("견적 목록에 담았습니다.");
      route();
    }),
  );
  c.append(actions);
  return c;
}
function catalogView(root) {
  const toolbar = el("form", null, "toolbar"),
    query = field(toolbar, "query", "제품·모델 검색"),
    brand = el("select");
  query.required = false;
  brand.setAttribute("aria-label", "브랜드");
  brand.append(el("option", "전체 브랜드"));
  brand.firstElementChild.value = "";
  for (const b of catalog.brands) {
    const o = el("option", b.name);
    o.value = b.id;
    brand.append(o);
  }
  const label = el("label", "브랜드");
  label.append(brand);
  toolbar.append(label, el("button", "검색", "button"));
  const products = el("div", null, "products");
  const focused = entryProduct(focusedProductId, catalog.products),
    selected = card("공식 홈페이지에서 살펴본 제품");
  if (focusedProductId && !focused) {
    focusedProductId = "";
    root.append(
      el(
        "p",
        "선택한 제품의 현재 공개 상태를 확인할 수 없습니다. 아래 공개 목록에서 다시 선택해 주세요.",
        "muted",
      ),
    );
  }
  if (focused) {
    selected.append(
      el("p", focused.name + (focused.model ? " · " + focused.model : "")),
      el(
        "p",
        "옵션과 수량을 확인해 견적 목록에 담아 주세요. 이동만으로 견적이나 주문이 접수되지는 않습니다.",
        "muted",
      ),
      button(
        "전체 제품 보기",
        () => {
          focusedProductId = "";
          query.value = "";
          brand.value = "";
          render();
        },
        "button secondary",
      ),
    );
    root.append(selected);
  }
  const render = () => {
    const q = query.value.toLowerCase();
    selected.hidden = !focusedProductId;
    products.replaceChildren(
      ...catalog.products
        .filter(
          (p) =>
            (!focusedProductId || p.id === focusedProductId) &&
            (!brand.value || p.brand === brand.value) &&
            (!q || [p.id, p.name, p.model].join(" ").toLowerCase().includes(q)),
        )
        .map(productCard),
    );
  };
  toolbar.onsubmit = (e) => {
    e.preventDefault();
    focusedProductId = "";
    render();
  };
  root.append(
    toolbar,
    el("p", "가격과 공급 조건은 승인 후 견적서로 안내합니다.", "muted"),
    link("견적 목록·주문 내역", "#orders", "button secondary"),
    products,
  );
  render();
}
function cartView() {
  const c = card("견적 요청 목록");
  if (!cart.length) {
    c.append(el("p", "제품 화면에서 필요한 상품을 담아 주세요."));
    return c;
  }
  for (const x of cart) {
    const p = catalog.products.find((p) => p.id === x.productId),
      row = el("div", null, "stock-item cart-item");
    row.append(
      el(
        "p",
        (p?.name || x.productId) +
          (x.optionId === "default" ? "" : " · " + x.optionId),
      ),
    );
    const input = el("input");
    input.type = "number";
    input.min = "1";
    input.max = "999";
    input.value = x.quantity;
    input.setAttribute("aria-label", (p?.name || x.productId) + " 요청 수량");
    input.onchange = () => {
      if (
        !Number.isInteger(Number(input.value)) ||
        input.value < 1 ||
        input.value > 999
      )
        return;
      x.quantity = Number(input.value);
      save();
    };
    row.append(
      input,
      button(
        "제외",
        () => {
          cart = cart.filter((v) => v !== x);
          save();
          route();
        },
        "button secondary",
      ),
    );
    c.append(row);
  }
  const f = el("form"),
    label = el("label", "픽업 장소"),
    s = el("select");
  s.required = true;
  s.name = "locationId";
  for (const l of runtime.locations) {
    const o = el("option", l.name + (l.enabled ? "" : " · 준비 중"));
    o.value = l.id;
    o.disabled = !l.enabled;
    s.append(o);
  }
  label.append(s);
  f.append(label);
  field(f, "note", "요청 사항").required = false;
  f.append(
    el("p", "견적 요청만으로 주문이나 입금이 확정되지 않습니다.", "muted"),
    el("button", "견적 요청하기", "button"),
  );
  const submit = f.querySelector('button[type="submit"],button:not([type])');
  if (!runtime.betaEnabled || !runtime.locations.some((l) => l.enabled)) {
    submit.disabled = true;
    c.append(
      el(
        "p",
        "신규 견적·픽업 접수는 준비 중입니다. 담은 제품은 이 기기에 보관되며 운영 시작 후 요청할 수 있습니다.",
        "muted",
      ),
    );
  }
  formTask(f, async (data) => {
    if (!runtime.betaEnabled) throw Error("베타 접수를 준비하고 있습니다.");
    await call("/quotes", {
      ...data,
      items: cart,
      requestKey: crypto.randomUUID(),
    });
    cart = [];
    save();
    say("견적 요청을 접수했습니다. 담당자가 확인합니다.");
    route();
  });
  c.append(f);
  return c;
}
async function ordersView(root) {
  if (!allowed()) {
    root.append(authNotice("orders"));
    return;
  }
  root.append(cartView());
  if (runtime.policies?.standardPreReceiptCancellation)
    root.append(
      el("p", runtime.policies.standardPreReceiptCancellation, "muted"),
    );
  const [{ quotes }, { orders }, { refunds }] = await Promise.all([
    call("/quotes"),
    call("/orders"),
    call("/refunds"),
  ]);
  const list = el("div", null, "cards");
  for (const q of quotes) {
    const c = card("견적 " + q.id.slice(0, 8));
    c.append(
      el("span", labels[q.status] || q.status, "badge"),
      el("p", q.items.map((x) => x.name + " " + x.quantity).join(" / ")),
      el("p", q.locationName),
    );
    if (q.status === "issued") {
      if (q.standardReturnDays === 7 && !q.specialOrder)
        c.append(
          el(
            "p",
            "일반 재고 상품의 단순 변심 반품은 실제 수령 다음날부터 7일 이내 신청합니다.",
          ),
        );
      if (
        q.cancellationPolicy ||
        runtime.policies?.standardPreReceiptCancellation
      )
        c.append(
          el(
            "p",
            q.cancellationPolicy ||
              runtime.policies.standardPreReceiptCancellation,
          ),
        );
      c.append(
        dl([
          ["합계", money(q.total)],
          ["유효기간", date(q.expiresAt)],
        ]),
        link("견적서 보기", "/api/beta/quotes/" + q.id + "/print"),
      );
      const f = el("form");
      field(
        f,
        "agree",
        "견적 금액·구성·입금·픽업 조건을 확인했습니다.",
        false,
        "checkbox",
      ).required = true;
      f.append(el("button", "이 견적으로 주문하기", "button"));
      formTask(f, async () => {
        await call("/quotes/" + q.id + "/accept", {
          revision: q.revision,
          acceptTerms: true,
        });
        say("주문을 접수했습니다. 입금계좌와 준비 상태를 확인해 주세요.");
        route();
      });
      c.append(f);
    }
    list.append(c);
  }
  for (const o of orders) {
    const c = card(o.number);
    c.append(
      el("span", labels[o.status] || o.status, "badge"),
      dl([
        ["원주문 금액", money(o.total)],
        ["입금계좌", o.bank.name + " " + o.bank.account],
        ["예금주", o.bank.holder],
        ["수령 장소", o.fulfillment?.locationName || "담당자 안내"],
      ]),
      link("거래명세서 보기", "/api/beta/orders/" + o.id + "/statement"),
    );
    orderAftercare(c, o, refunds, route);
    if (o.specialOrder)
      c.append(
        el("p", o.cancellationPolicy),
        el(
          "p",
          o.procurement?.state === "started"
            ? "제작·발주 시작됨 · " + date(o.procurement.startedAt)
            : "제작·발주 전",
        ),
      );
    list.append(c);
  }
  root.append(el("h2", "견적·주문 내역"), list);
}
async function pickupView(root) {
  root.append(el("h2", "픽업 안내"));
  root.append(
    el(
      "p",
      "토요일에는 오프라인 매장 픽업이 가능합니다. 영업시간과 준비 상태는 담당자에게 확인해 주세요.",
      "muted",
    ),
  );
  for (const l of runtime.locations) {
    const c = card(l.name);
    c.append(
      el("span", l.enabled ? "베타 운영" : "준비 중", "badge"),
      el("p", l.address || "스토어 공지 원문 확인 후 안내합니다."),
      el("p", l.hours || "장소·운영시간 확인 중"),
      el(
        "p",
        "픽업 무료 · " +
          (l.id === "jinjeop"
            ? "담당자 대면 전달"
            : "개별 비밀번호 보관함 수령"),
      ),
    );
    root.append(c);
  }
  if (!allowed()) {
    root.append(authNotice("pickup"));
    return;
  }
  const { orders } = await call("/orders");
  for (const o of orders.filter((x) => x.fulfillment?.method === "pickup")) {
    const c = card(o.number);
    c.append(
      el("span", labels[o.status] || o.status, "badge"),
      el("p", o.fulfillment.locationName),
    );
    if (o.refundHold)
      c.append(
        el(
          "p",
          "취소·환불 검토 중입니다. 방문과 수령을 중단하고 담당자 안내를 기다려 주세요.",
        ),
      );
    else if (o.pickup) {
      c.append(
        dl([
          [
            o.pickup.mode === "handoff" ? "만남 지점" : "보관함",
            o.pickup.mode === "handoff"
              ? o.pickup.meetingPoint
              : o.pickup.slotLabel,
          ],
          ["수령 시작", date(o.pickup.availableFrom)],
          ["수령 마감", date(o.pickup.availableUntil)],
        ]),
      );
      if (o.pickup.mode === "handoff")
        c.append(el("p", "담당자 대면 전달 · " + o.pickup.staffContact));
      if (o.pickup.status === "ready") {
        if (o.pickup.mode !== "handoff")
          c.append(
            button("개별 비밀번호 확인", async () => {
              clearPins();
              const r = await call("/orders/" + o.id + "/code", {}),
                n = el("output", r.pin, "pin");
              c.append(
                n,
                el(
                  "p",
                  "비밀번호는 30초 후 숨겨집니다. 다른 사람에게 공유하지 마세요.",
                  "muted",
                ),
              );
              pinTimers.push(setTimeout(() => n.remove(), 30000));
            }),
          );
        c.append(
          button(
            "상품을 수령했습니다",
            async () => {
              if (!confirm("주문 상품과 수량을 확인하고 수령하셨나요?")) return;
              await call("/orders/" + o.id + "/received", {
                revision: o.pickup.revision,
                received: true,
              });
              say("수령 표시를 접수했습니다. 담당자가 확인합니다.");
              route();
            },
            "button secondary",
          ),
        );
      } else c.append(el("p", labels[o.pickup.status] || o.pickup.status));
    } else if (o.status === "collected")
      c.append(el("p", "수령이 완료된 주문입니다."));
    else if (
      ["cancelled", "expired", "refunded", "cancelled_settled"].includes(
        o.status,
      )
    )
      c.append(el("p", "종료된 주문입니다. 방문 전 담당자에게 확인해 주세요."));
    else c.append(el("p", "준비 완료 안내를 받은 뒤 방문해 주세요."));
    root.append(c);
  }
}
function accountView(root) {
  const resetToken = new URLSearchParams(location.hash.split("?")[1] || "").get(
    "reset",
  );
  if (resetToken) {
    resetForm(root, resetToken, () => {
      history.replaceState(null, "", "/trade/#account");
      member = null;
      bound = false;
      clearPins();
      cart = [];
      save();
      say(
        "비밀번호를 변경하고 기존 로그인을 모두 종료했습니다. 새 비밀번호로 로그인해 주세요.",
      );
      route();
    });
    return;
  }
  const activation = new URLSearchParams(location.hash.split("?")[1] || "").get(
    "activate",
  );
  if (activation) {
    const c = card("사업자 계정 본인 확인"),
      f = el("form");
    field(f, "password", "새 비밀번호", "", "password").minLength = 10;
    f.append(el("button", "계정 확인 완료", "button"));
    formTask(f, async (data) => {
      await call("/activate", { token: activation, password: data.password });
      history.replaceState(null, "", "/trade/#account");
      say("계정 확인을 완료했습니다. 새 비밀번호로 로그인해 주세요.");
      route();
    });
    c.append(f);
    root.append(c);
    return;
  }
  if (member) {
    const c = card(member.profile.companyName || member.username);
    c.append(
      el("span", labels[member.status] || member.status, "badge"),
      el(
        "p",
        bound
          ? "계정 확인 완료"
          : "OS 승인 후 담당자가 전달한 계정 확인 링크를 열어 주세요.",
      ),
      button("OS 접수 다시 보내기", async () => {
        await call("/receipt-retry", {});
        say("OS 접수 요청을 보냈습니다.");
      }),
      button(
        "로그아웃",
        async () => {
          clearPins();
          cart = [];
          save();
          await logout();
        },
        "button secondary",
      ),
    );
    root.append(c);
    return;
  }
  const grid = el("div", null, "intro-grid"),
    lc = card("로그인"),
    lf = el("form");
  field(lf, "username", "아이디");
  field(lf, "password", "비밀번호", "", "password");
  lf.append(el("button", "로그인", "button"));
  formTask(lf, async () => {
    await login(lf);
    await identity();
    say("계정에 연결했습니다.");
    if (allowed() && loginReturn !== "account") location.hash = loginReturn;
    else route();
  });
  lc.append(lf);
  recoveryForm(lc);
  grid.append(lc);
  const rc = card("사업자 계정 신청");
  if (!runtime.registrationEnabled)
    rc.append(
      el(
        "p",
        "베타 계정 신청을 준비하고 있습니다. 기존 사업자 신청은 공식 홈페이지에서 이용해 주세요.",
      ),
      link("사업자회원 신청", "https://worknic.co.kr/business/"),
    );
  else {
    const f = el("form");
    for (const [name, title, type] of [
      ["username", "아이디", "text"],
      ["password", "비밀번호 · 10자 이상", "password"],
      ["companyName", "상호", "text"],
      ["businessNumber", "사업자등록번호", "text"],
      ["contactName", "담당자 이름", "text"],
      ["phone", "연락처", "tel"],
      ["email", "이메일", "email"],
      ["postalCode", "우편번호", "text"],
      ["address", "주소", "text"],
      ["addressDetail", "상세주소", "text"],
    ]) {
      const i = field(f, name, title, "", type);
      if (name === "addressDetail") i.required = false;
    }
    field(
      f,
      "consent",
      "가입 심사·회원 관리·견적 및 주문 처리를 위한 개인정보 수집·이용에 동의합니다.",
      false,
      "checkbox",
    ).required = true;
    f.append(
      link("개인정보 처리 안내", "https://worknic.co.kr/privacy/"),
      el("p", "승인과 계정 확인을 마친 뒤 거래할 수 있습니다.", "muted"),
      el("button", "계정 신청", "button"),
    );
    formTask(f, async (data) => {
      const r = await call("/register", {
        ...data,
        consent: data.consent === "on",
      });
      say(
        r.message ||
          "계정을 신청했습니다. OS 승인과 담당자 계정 확인을 기다려 주세요.",
      );
      f.reset();
    });
    rc.append(f);
  }
  grid.append(rc);
  root.append(grid);
}
async function route() {
  clearPins();
  const revision = ++routeRevision;
  const name = location.hash.slice(1).split("?")[0] || "catalog",
    view = $("#view"),
    root = el("div");
  view.replaceChildren();
  document
    .querySelectorAll(".nav a,.bottom-nav a")
    .forEach((a) =>
      a.setAttribute("aria-current", a.hash === "#" + name ? "page" : "false"),
    );
  try {
    if (name === "catalog") catalogView(root);
    else if (name === "orders") await ordersView(root);
    else if (name === "pickup") await pickupView(root);
    else accountView(root);
    if (revision === routeRevision) view.replaceChildren(...root.childNodes);
  } catch (e) {
    if (revision === routeRevision) say(e.message, true);
  }
}
window.addEventListener("hashchange", route);
window.addEventListener("pagehide", clearPins);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearPins();
});
(async () => {
  try {
    runtime = await call("/health");
    await identity();
    catalog = await call("/public-catalog");
    say(
      runtime.betaEnabled
        ? "승인된 사업자회원 대상 픽업 베타입니다."
        : "베타 운영 연결을 준비하고 있습니다. 제품 정보는 확인할 수 있습니다.",
    );
    await route();
    setInterval(() => {
      if (
        !document.hidden &&
        member &&
        ["orders", "pickup"].includes(location.hash.slice(1))
      )
        route();
    }, 45000);
  } catch (e) {
    say(e.message, true);
  }
})();
