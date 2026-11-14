import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function harness() {
  const node = () => ({
    childNodes: [],
    reset() {},
    append(...items) {
      this.childNodes.push(...items);
    },
    replaceChildren(...items) {
      this.childNodes = items;
    },
  });
  const view = node(),
    messages = [],
    listeners = {};
  const context = vm.createContext({
    $: () => view,
    el: node,
    say() {},
    orderAftercare() {},
    location: { hash: "#prices" },
    document: { querySelectorAll: () => [] },
    window: {
      opener: { postMessage: (...args) => messages.push(args) },
      addEventListener: (name, fn) => {
        listeners[name] = fn;
      },
    },
  });
  let code = readFileSync(new URL("../beta-admin.js", import.meta.url), "utf8");
  code = code
    .slice(code.indexOf("let actor ="))
    .replace(/if \(!requestOSConnection\(\)\) load\(\);\s*$/, "");
  vm.runInContext(code, context);
  vm.runInContext('actor = {role: "admin"}', context);
  return { context, view, messages, listeners };
}

test("늦게 도착한 이전 메뉴 응답이 현재 관리자 화면에 섞이지 않음", async () => {
  const { context, view } = harness();
  let finishPrices;
  context.prices = async (root) => {
    await new Promise((resolve) => {
      finishPrices = resolve;
    });
    root.append("old-prices");
  };
  context.members = async (root) => {
    root.append("current-members");
  };
  const previous = context.route();
  context.location.hash = "#members";
  await context.route();
  finishPrices();
  await previous;
  assert.deepEqual(view.childNodes, ["current-members"]);
});

test("이미 열린 관리자 창도 OS 연결 메뉴로 돌아오면 인증 교환을 다시 요청", () => {
  const { context, messages, listeners } = harness();
  context.location.hash = "#os-connect";
  listeners.hashchange();
  assert.equal(messages.length, 1);
  assert.equal(messages[0][0].type, "WORKNIC_TRADE_READY");
  assert.equal(messages[0][1], "https://worknic.tools");
  context.location.hash = "#members";
  assert.equal(context.requestOSConnection(), false);
  assert.equal(messages.length, 1);
});

async function pickupForm(locationId) {
  const { context } = harness(),
    fields = new Map(),
    submissions = [],
    calls = [];
  let now = Date.parse("2026-11-09T00:00:00Z");
  context.Date = class extends Date {
    static now() {
      return now;
    }
  };
  context.card = context.el;
  context.dl = context.el;
  context.link = context.el;
  context.money = String;
  context.date = String;
  context.labels = {};
  context.field = (form, name, label, value, type) => {
    const input = {
      checked: value === true,
      required: type !== "checkbox",
      addEventListener(event, fn) {
        this[event] = fn;
      },
    };
    fields.set(name, input);
    return input;
  };
  context.formTask = (form, fn) => submissions.push(fn);
  context.route = () => {};
  context.call = async (path, input) => {
    if (path === "/admin/orders")
      return {
        orders: [
          {
            id: "mock-order",
            number: "MOCK",
            status: "paid",
            revision: 1,
            buyer: { companyName: "test", phone: "010-0000-0000" },
            total: 11000,
            fulfillment: { locationId },
          },
        ],
      };
    if (path === "/admin/slots") return { slots: [] };
    if (path === "/admin/refunds") return { refunds: [] };
    calls.push({ path, input });
    return {};
  };
  await context.orderList(true, context.el());
  return {
    fields,
    calls,
    submit: submissions[0],
    advance: (ms) => {
      now += ms;
    },
    now: () => now,
  };
}

test("즉시 수령은 폼을 작성한 뒤 시간이 지나도 실제 제출 시점으로 시작", async () => {
  const f = await pickupForm("pocheon_after_hours");
  assert.equal(f.fields.get("startNow").checked, true);
  assert.equal(f.fields.get("availableFrom").disabled, true);
  assert.equal(f.fields.get("availableFrom").required, false);
  f.advance(15 * 60000);
  await f.submit({
    startNow: "on",
    availableFrom: "2026-11-09T00:00:00Z",
    availableUntil: "2026-11-09T01:00:00Z",
  });
  assert.equal(f.calls[0].input.availableFrom, f.now());
});

test("진접 대면 전달은 보관함·비밀번호 없이 수령 시작을 직접 지정", async () => {
  const f = await pickupForm("jinjeop");
  assert.equal(f.fields.has("startNow"), false);
  assert.equal(f.fields.has("pin"), false);
  assert.equal(f.fields.has("staffContact"), true);
  assert.equal(f.fields.get("availableFrom").required, true);
  const selected = "2026-11-09T10:00:00Z";
  await f.submit({
    availableFrom: selected,
    availableUntil: "2026-11-09T14:00:00Z",
  });
  assert.equal(f.calls[0].input.availableFrom, Date.parse(selected));
  assert.equal(f.calls[0].path, "/admin/handoffs/ready");
});
