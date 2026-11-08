import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function harness() {
  const node = () => ({ childNodes: [], append(...items) { this.childNodes.push(...items); },
    replaceChildren(...items) { this.childNodes = items; } });
  const view = node(), messages = [], listeners = {};
  const context = vm.createContext({
    $: () => view, el: node, say() {},
    location: { hash: "#prices" },
    document: { querySelectorAll: () => [] },
    window: { opener: { postMessage: (...args) => messages.push(args) },
      addEventListener: (name, fn) => { listeners[name] = fn; } },
  });
  let code = readFileSync(new URL("../beta-admin.js", import.meta.url), "utf8");
  code = code.slice(code.indexOf("let actor =")).replace(/if \(!requestOSConnection\(\)\) load\(\);\s*$/, "");
  vm.runInContext(code, context);
  vm.runInContext('actor = {role: "admin"}', context);
  return { context, view, messages, listeners };
}

test("늦게 도착한 이전 메뉴 응답이 현재 관리자 화면에 섞이지 않음", async () => {
  const { context, view } = harness();
  let finishPrices;
  context.prices = async root => {
    await new Promise(resolve => { finishPrices = resolve; });
    root.append("old-prices");
  };
  context.members = async root => { root.append("current-members"); };
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
