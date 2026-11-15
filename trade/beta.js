import {itemsOnly,createDraftSession,mayRefresh} from "./quote-draft.js";
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
const draftSession = createDraftSession(localStorage);
const save = () => draftSession.save(cart);
const canRefresh = () => mayRefresh(document.querySelector('#view'),document.activeElement);
document.addEventListener('input',event=>{const form=event.target.closest('#view form');if(form)form.dataset.draftDirty='true';});
document.addEventListener('change',event=>{const form=event.target.closest('#view form');if(form)form.dataset.draftDirty='true';});
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
  cart = draftSession.select(member?.id || null);
}
async function verifyDraftOwner() {
  const expected = member?.id;
  await identity();
  if (!expected || member?.id !== expected || !allowed()) throw Error('�α��� ������ ����Ǿ��ų� Ȯ���� �� �����ϴ�. ���� ������ �ʾ��� ������ �����˴ϴ�.');
}
function authNotice(destination = "orders") {
  loginReturn = destination;
  const c = card("����� Ȯ�� �� �̿��� �� �ֽ��ϴ�.");
  c.append(
    el(
      "p",
      "��ũ���� ������ �ް� ����ڰ� ������ ���� Ȯ�� ��ũ���� ���� Ȯ���� �Ϸ��� �ּ���.",
    ),
    link("�α��Ρ����� Ȯ��", "#account"),
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
    s.setAttribute("aria-label", p.name + " �ɼ�");
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
      "�԰� ����",
      "https://worknic.co.kr/products/?id=" + encodeURIComponent(p.id),
    ),
    button("������ ���", () => {
      if (!allowed()) {
        loginReturn = "catalog";
        say("����� ���ΰ� ���� Ȯ�� �� �̿��� �ּ���.");
        location.hash = "account";
        return;
      }
      const old = cart.find(
        (x) => x.productId === p.id && x.optionId === option,
      );
      if (old) old.quantity = Math.min(999, old.quantity + 1);
      else cart.push({ productId: p.id, optionId: option, quantity: 1 });
      save();
      say("���� ��Ͽ� ��ҽ��ϴ�.");
      route();
    }),
  );
  c.append(actions);
  return c;
}
function catalogView(root) {
  const toolbar = el("form", null, "toolbar"),
    query = field(toolbar, "query", "��ǰ���� �˻�"),
    brand = el("select");
  query.required = false;
  brand.setAttribute("aria-label", "�귣��");
  brand.append(el("option", "��ü �귣��"));
  brand.firstElementChild.value = "";
  for (const b of catalog.brands) {
    const o = el("option", b.name);
    o.value = b.id;
    brand.append(o);
  }
  const label = el("label", "�귣��");
  label.append(brand);
  toolbar.append(label, el("button", "�˻�", "button"));
  const products = el("div", null, "products");
  const focused = entryProduct(focusedProductId, catalog.products),
    selected = card("���� Ȩ���������� ���캻 ��ǰ");
  if (focusedProductId && !focused) {
    focusedProductId = "";
    root.append(
      el(
        "p",
        "������ ��ǰ�� ���� ���� ���¸� Ȯ���� �� �����ϴ�. �Ʒ� ���� ��Ͽ��� �ٽ� ������ �ּ���.",
        "muted",
      ),
    );
  }
  if (focused) {
    selected.append(
      el("p", focused.name + (focused.model ? " �� " + focused.model : "")),
      el(
        "p",
        "�ɼǰ� ������ Ȯ���� ���� ��Ͽ� ��� �ּ���. �̵������� �����̳� �ֹ��� ���������� �ʽ��ϴ�.",
        "muted",
      ),
      button(
        "��ü ��ǰ ����",
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
    el("p", "���ݰ� ���� ������ ���� �� �������� �ȳ��մϴ�.", "muted"),
    link("���� ��ϡ��ֹ� ����", "#orders", "button secondary"),
    products,
  );
  render();
}
function cartView() {
  const c = card("���� ��û ���");
  if (!cart.length) {
    c.append(el("p", "��ǰ ȭ�鿡�� �ʿ��� ��ǰ�� ��� �ּ���."));
    return c;
  }
  for (const x of cart) {
    const p = catalog.products.find((p) => p.id === x.productId),
      row = el("div", null, "stock-item cart-item");
    row.append(
      el(
        "p",
        (p?.name || x.productId) +
          (x.optionId === "default" ? "" : " �� " + x.optionId),
      ),
    );
    const input = el("input");
    input.type = "number";
    input.min = "1";
    input.max = "999";
    input.value = x.quantity;
    input.setAttribute("aria-label", (p?.name || x.productId) + " ��û ����");
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
        "����",
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
    label = el("label", "�Ⱦ� ���"),
    s = el("select");
  s.required = true;
  s.name = "locationId";
  for (const l of runtime.locations) {
    const o = el("option", l.name + (l.enabled ? "" : " �� �غ� ��"));
    o.value = l.id;
    o.disabled = !l.enabled;
    s.append(o);
  }
  label.append(s);
  f.append(label);
  field(f, "note", "��û ����").required = false;
  f.append(
    el("p", "���� ��û������ �ֹ��̳� �Ա��� Ȯ������ �ʽ��ϴ�.", "muted"),
    el("button", "���� ��û�ϱ�", "button"),
  );
  const submit = f.querySelector('button[type="submit"],button:not([type])');
  if (!runtime.betaEnabled || !runtime.locations.some((l) => l.enabled)) {
    submit.disabled = true;
    c.append(
      el(
        "p",
        "�ű� �������Ⱦ� ������ �غ� ���Դϴ�. ���� ��ǰ�� �� ��⿡ �����Ǹ� � ���� �� ��û�� �� �ֽ��ϴ�.",
        "muted",
      ),
    );
  }
  formTask(f, async (data) => {
    if (!runtime.betaEnabled) throw Error("��Ÿ ������ �غ��ϰ� �ֽ��ϴ�.");
    const owner = member?.id;
    const items = itemsOnly(cart);
    await verifyDraftOwner();
    if (owner !== member?.id) throw Error('�α��� ������ �ٽ� Ȯ���� �ּ���.');
    const payload = {...data,items};
    const requestKey = draftSession.requestKey(payload);
    await call("/quotes", {...payload,requestKey});
    if (member?.id !== owner) { say("���� ��û�� �����߽��ϴ�. ���� ������ �ʾ��� �����մϴ�."); return; }
    draftSession.confirmed();
    cart = [];
    save();
    say("���� ��û�� �����߽��ϴ�. ����ڰ� Ȯ���մϴ�.");
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
  if (runtime.policies?.preReceiptRefundTiming)
    root.append(el("p", runtime.policies.preReceiptRefundTiming, "muted"));
  if (runtime.policies?.returnRefundTiming)
    root.append(el("p", runtime.policies.returnRefundTiming, "muted"));
  if (runtime.policies?.refundRecipient)
    root.append(el("p", runtime.policies.refundRecipient, "muted"));
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
    const c = card("���� " + q.id.slice(0, 8));
    c.append(
      el("span", labels[q.status] || q.status, "badge"),
      el("p", q.items.map((x) => x.name + " " + x.quantity).join(" / ")),
      el("p", q.locationName),
    );
    if (q.status === "issued") {
      if (q.defectShippingText) c.append(el("p", q.defectShippingText));
      if (q.outboundShippingText) c.append(el("p", q.outboundShippingText));
      if (q.returnShippingText) c.append(el("p", q.returnShippingText));
      if (q.returnConditionText) c.append(el("p", q.returnConditionText));
      if (q.standardReturnDays === 7 && !q.specialOrder)
        c.append(
          el(
            "p",
            "�Ϲ� ��� ��ǰ�� �ܼ� ���� ��ǰ�� ���� ���� ���������� 7�� �̳� ��û�մϴ�.",
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
          ["�հ�", money(q.total)],
          ["��ȿ�Ⱓ", date(q.expiresAt)],
        ]),
        link("������ ����", "/api/beta/quotes/" + q.id + "/print"),
      );
      const f = el("form");
      field(
        f,
        "agree",
        "���� �ݾס��������Աݡ��Ⱦ� ������ Ȯ���߽��ϴ�.",
        false,
        "checkbox",
      ).required = true;
      f.append(el("button", "�� �������� �ֹ��ϱ�", "button"));
      formTask(f, async () => {
        await call("/quotes/" + q.id + "/accept", {
          revision: q.revision,
          acceptTerms: true,
        });
        say("�ֹ��� �����߽��ϴ�. �Աݰ��¿� �غ� ���¸� Ȯ���� �ּ���.");
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
        ["���ֹ� �ݾ�", money(o.total)],
        ["�Աݰ���", o.bank.name + " " + o.bank.account],
        ["������", o.bank.holder],
        ["���� ���", o.fulfillment?.locationName || "����� �ȳ�"],
      ]),
      link("�ŷ������� ����", "/api/beta/orders/" + o.id + "/statement"),
    );
    c.append(button('���� ǰ������ �� ���� �غ�', async()=>{
      await verifyDraftOwner();
      const next = itemsOnly(o.items);
      if (!next.length) throw Error('���� ǰ���� Ȯ���� �� �����ϴ�.');
      if (cart.length && !confirm('�ۼ� ���� ��û ����� ���� �ֹ��� ǰ������ �ٲܱ��?')) return;
      cart = next;
      save();
      say('ǰ�񡤿ɼǡ������� ��ҽ��ϴ�. ���� ���ݡ��������Ⱦ� ������ �������� �ʾҽ��ϴ�. ���� �Ǹ� ������ ������ Ȯ���մϴ�.');
      route();
    },'button secondary'));
    orderAftercare(c, o, refunds, route);
    if (o.specialOrder)
      c.append(
        el("p", o.cancellationPolicy),
        el(
          "p",
          o.procurement?.state === "started"
            ? "���ۡ����� ���۵� �� " + date(o.procurement.startedAt)
            : "���ۡ����� ��",
        ),
      );
    list.append(c);
  }
  root.append(el("h2", "�������ֹ� ����"), list);
}
async function pickupView(root) {
  root.append(el("h2", "�Ⱦ� �ȳ�"));
  root.append(
    el(
      "p",
      "����Ͽ��� �������� ���� �Ⱦ��� �����մϴ�. �����ð��� �غ� ���´� ����ڿ��� Ȯ���� �ּ���.",
      "muted",
    ),
  );
  for (const l of runtime.locations) {
    const c = card(l.name);
    c.append(
      el("span", l.enabled ? "��Ÿ �" : "�غ� ��", "badge"),
      el("p", l.address || "����� ���� ���� Ȯ�� �� �ȳ��մϴ�."),
      el("p", l.hours || "��ҡ���ð� Ȯ�� ��"),
      el(
        "p",
        "�Ⱦ� ���� �� " +
          (l.id === "jinjeop"
            ? "����� ��� ����"
            : "���� ��й�ȣ ������ ����"),
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
          "��ҡ�ȯ�� ���� ���Դϴ�. �湮�� ������ �ߴ��ϰ� ����� �ȳ��� ��ٷ� �ּ���.",
        ),
      );
    else if (o.pickup) {
      c.append(
        dl([
          [
            o.pickup.mode === "handoff" ? "���� ����" : "������",
            o.pickup.mode === "handoff"
              ? o.pickup.meetingPoint
              : o.pickup.slotLabel,
          ],
          ["���� ����", date(o.pickup.availableFrom)],
          ["���� ����", date(o.pickup.availableUntil)],
        ]),
      );
      if (o.pickup.mode === "handoff")
        c.append(el("p", "����� ��� ���� �� " + o.pickup.staffContact));
      if (o.pickup.status === "ready") {
        if (o.pickup.mode !== "handoff")
          c.append(
            button("���� ��й�ȣ Ȯ��", async () => {
              clearPins();
              const r = await call("/orders/" + o.id + "/code", {}),
                n = el("output", r.pin, "pin");
              c.append(
                n,
                el(
                  "p",
                  "��й�ȣ�� 30�� �� �������ϴ�. �ٸ� ������� �������� ������.",
                  "muted",
                ),
              );
              pinTimers.push(setTimeout(() => n.remove(), 30000));
            }),
          );
        c.append(
          button(
            "��ǰ�� �����߽��ϴ�",
            async () => {
              if (!confirm("�ֹ� ��ǰ�� ������ Ȯ���ϰ� �����ϼ̳���?")) return;
              await call("/orders/" + o.id + "/received", {
                revision: o.pickup.revision,
                received: true,
              });
              say("���� ǥ�ø� �����߽��ϴ�. ����ڰ� Ȯ���մϴ�.");
              route();
            },
            "button secondary",
          ),
        );
      } else c.append(el("p", labels[o.pickup.status] || o.pickup.status));
    } else if (o.status === "collected")
      c.append(el("p", "������ �Ϸ�� �ֹ��Դϴ�."));
    else if (
      ["cancelled", "expired", "refunded", "cancelled_settled"].includes(
        o.status,
      )
    )
      c.append(el("p", "����� �ֹ��Դϴ�. �湮 �� ����ڿ��� Ȯ���� �ּ���."));
    else c.append(el("p", "�غ� �Ϸ� �ȳ��� ���� �� �湮�� �ּ���."));
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
        "��й�ȣ�� �����ϰ� ���� �α����� ��� �����߽��ϴ�. �� ��й�ȣ�� �α����� �ּ���.",
      );
      route();
    });
    return;
  }
  const activation = new URLSearchParams(location.hash.split("?")[1] || "").get(
    "activate",
  );
  if (activation) {
    const c = card("����� ���� ���� Ȯ��"),
      f = el("form");
    field(f, "password", "�� ��й�ȣ", "", "password").minLength = 10;
    f.append(el("button", "���� Ȯ�� �Ϸ�", "button"));
    formTask(f, async (data) => {
      await call("/activate", { token: activation, password: data.password });
      history.replaceState(null, "", "/trade/#account");
      say("���� Ȯ���� �Ϸ��߽��ϴ�. �� ��й�ȣ�� �α����� �ּ���.");
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
          ? "���� Ȯ�� �Ϸ�"
          : "OS ���� �� ����ڰ� ������ ���� Ȯ�� ��ũ�� ���� �ּ���.",
      ),
      button("OS ���� �ٽ� ������", async () => {
        await call("/receipt-retry", {});
        say("OS ���� ��û�� ���½��ϴ�.");
      }),
      button(
        "�α׾ƿ�",
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
    lc = card("�α���"),
    lf = el("form");
  field(lf, "username", "���̵�");
  field(lf, "password", "��й�ȣ", "", "password");
  lf.append(el("button", "�α���", "button"));
  formTask(lf, async () => {
    await login(lf);
    await identity();
    say("������ �����߽��ϴ�.");
    if (allowed() && loginReturn !== "account") location.hash = loginReturn;
    else route();
  });
  lc.append(lf);
  recoveryForm(lc);
  grid.append(lc);
  const rc = card("����� ���� ��û");
  if (!runtime.registrationEnabled)
    rc.append(
      el(
        "p",
        "��Ÿ ���� ��û�� �غ��ϰ� �ֽ��ϴ�. ���� ����� ��û�� ���� Ȩ���������� �̿��� �ּ���.",
      ),
      link("�����ȸ�� ��û", "https://worknic.co.kr/business/"),
    );
  else {
    const f = el("form");
    for (const [name, title, type] of [
      ["username", "���̵�", "text"],
      ["password", "��й�ȣ �� 10�� �̻�", "password"],
      ["companyName", "��ȣ", "text"],
      ["businessNumber", "����ڵ�Ϲ�ȣ", "text"],
      ["contactName", "����� �̸�", "text"],
      ["phone", "����ó", "tel"],
      ["email", "�̸���", "email"],
      ["postalCode", "������ȣ", "text"],
      ["address", "�ּ�", "text"],
      ["addressDetail", "���ּ�", "text"],
    ]) {
      const i = field(f, name, title, "", type);
      if (name === "addressDetail") i.required = false;
    }
    field(
      f,
      "consent",
      "���� �ɻ硤ȸ�� ���������� �� �ֹ� ó���� ���� �������� �������̿뿡 �����մϴ�.",
      false,
      "checkbox",
    ).required = true;
    f.append(
      link("�������� ó�� �ȳ�", "https://worknic.co.kr/privacy/"),
      el("p", "���ΰ� ���� Ȯ���� ��ģ �� �ŷ��� �� �ֽ��ϴ�.", "muted"),
      el("button", "���� ��û", "button"),
    );
    formTask(f, async (data) => {
      const r = await call("/register", {
        ...data,
        consent: data.consent === "on",
      });
      say(
        r.message ||
          "������ ��û�߽��ϴ�. OS ���ΰ� ����� ���� Ȯ���� ��ٷ� �ּ���.",
      );
      f.reset();
    });
    rc.append(f);
  }
  grid.append(rc);
  root.append(grid);
}
async function route(options = {}) {
  const background = options?.background === true;
  if (background && !canRefresh()) return;
  clearPins();
  const revision = ++routeRevision;
  const name = location.hash.slice(1).split("?")[0] || "catalog",
    view = $("#view"),
    root = el("div");
  if (!background) view.replaceChildren();
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
    if (revision === routeRevision && (!background || canRefresh())) view.replaceChildren(...root.childNodes);
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
        ? "���ε� �����ȸ�� ��� �Ⱦ� ��Ÿ�Դϴ�."
        : "��Ÿ � ������ �غ��ϰ� �ֽ��ϴ�. ��ǰ ������ Ȯ���� �� �ֽ��ϴ�.",
    );
    await route();
    setInterval(() => {
      if (
        !document.hidden &&
        member &&
        ["orders", "pickup"].includes(location.hash.slice(1))
      )
        route({background:true});
    }, 45000);
  } catch (e) {
    say(e.message, true);
  }
})();
