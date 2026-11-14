import test from "node:test";
import assert from "node:assert/strict";
import { readTradeEntry, entryProduct } from "../entry-intent.js";
import { readFileSync } from "node:fs";
import vm from "node:vm";
test("공식 상품번호를 그대로 이어받고 별도 입력 없이 옵션·수량을 만들지 않음", () => {
  const entry = readTradeEntry("?product=13721375775");
  assert.deepEqual(entry, { productId: "13721375775", next: "catalog" });
  const products = [{ id: "13721375775", variants: [{ id: "different-option" }] }];
  assert.equal(entryProduct(entry.productId, products), products[0]);
  assert.equal(entry.quantity, undefined);
  assert.equal(entry.optionId, undefined);
});
test("로그인 후 이동은 허용된 내부 화면에만 한정", () => {
  assert.equal(readTradeEntry("?next=pickup").next, "pickup");
  assert.equal(readTradeEntry("?next=orders").next, "orders");
  assert.equal(readTradeEntry("?next=https%3A%2F%2Fother.invalid").next, "orders");
  assert.equal(readTradeEntry("?product=makita-uc032g&next=javascript%3Aalert(1)").next, "catalog");
});
test("없는 상품과 URL·HTML 형태의 상품값을 임의 상품으로 대체하지 않음", () => {
  assert.equal(entryProduct("missing", [{ id: "existing" }]), null);
  for (const product of ["../private", "<script>", "https://other.invalid", "x".repeat(121)])
    assert.equal(readTradeEntry("?product=" + encodeURIComponent(product)).productId, "");
});
test("고객 화면도 늦게 도착한 주문 응답이 픽업 화면에 섞이지 않음", async () => {
  const node = () => ({childNodes: [], append(...v) {this.childNodes.push(...v);}, replaceChildren(...v) {this.childNodes=v;}});
  const view=node(), context=vm.createContext({readTradeEntry,entryProduct,URLSearchParams,
    location:{search:'?product=13721375775',hash:'#orders'},localStorage:{getItem:()=> '[]'},
    document:{querySelectorAll:()=>[],addEventListener(){}},window:{addEventListener(){}},
    $:()=>view,el:node,say(){},clearTimeout(){}});
  let code=readFileSync(new URL('../beta.js',import.meta.url),'utf8');
  code=code.slice(code.indexOf('const entry ='));
  code=code.slice(0,code.lastIndexOf('\n(async () => {'));
  vm.runInContext(code,context);
  let finish;
  context.ordersView=async root=>{await new Promise(r=>{finish=r;});root.append('old-order');};
  context.pickupView=async root=>root.append('current-pickup');
  const before=context.route();context.location.hash='#pickup';await context.route();finish();await before;
  assert.deepEqual(view.childNodes,['current-pickup']);
});
