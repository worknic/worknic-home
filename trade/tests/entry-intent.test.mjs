import test from "node:test";
import assert from "node:assert/strict";
import { readTradeEntry, entryProduct } from "../entry-intent.js";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import {createDraftSession,itemsOnly,mayRefresh} from '../quote-draft.js';
test('전송 중 계정이 바뀌면 이전 계정의 응답이 새 계정의 장바구니를 지우지 않음',async()=>{
 const node=()=>({childNodes:[],dataset:{},append(...v){this.childNodes.push(...v)},querySelector(){return {disabled:false}},setAttribute(){}});
 const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 let submit,finish;
 const A={id:'A',status:'approved'},B={id:'B',status:'approved'};
 const context=vm.createContext({readTradeEntry,entryProduct,URLSearchParams,itemsOnly,mayRefresh,createDraftSession:s=>createDraftSession(s,()=> 'isolated-submit-key-0001'),location:{search:'',hash:'#orders'},localStorage:storage,
  document:{addEventListener(){},querySelectorAll:()=>[]},window:{addEventListener(){}},el:node,card:node,button:node,field:node,say(){},formTask:(f,fn)=>submit=fn,
  call:async path=>path==='/me'?{member:A,bound:true}:new Promise(r=>finish=r)});
 let code=readFileSync(new URL('../beta.js',import.meta.url),'utf8');code=code.slice(code.indexOf('const entry ='));code=code.slice(0,code.lastIndexOf('\n(async () => {'));vm.runInContext(code,context);
 vm.runInContext('member={id:"A",status:"approved"};bound=true;runtime={betaEnabled:true,locations:[{id:"isolated",name:"격리",enabled:true}]};cart=[{productId:"p",optionId:"default",quantity:1}];draftSession.select("A");save();cartView();',context);
 const pending=submit({locationId:'isolated',note:''});
 // Let the owner verification finish and the quote POST begin.
 await new Promise(r=>setImmediate(r));assert.equal(typeof finish,'function');
 vm.runInContext('member={id:"B",status:"approved"};draftSession.select("B");cart=[{productId:"other",optionId:"default",quantity:3}];save();',context);
 finish({ok:true});await pending;
 assert.equal(JSON.parse(values.get('worknic_quote_v2:member%3AB:cart'))[0].productId,'other');
 assert.equal(JSON.parse(values.get('worknic_quote_v2:member%3AA:cart'))[0].productId,'p');
});
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
  const view=node(), context=vm.createContext({readTradeEntry,entryProduct,URLSearchParams,createDraftSession,itemsOnly,mayRefresh,
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

test('자동 조회 도중 입력이 시작되면 늦은 응답으로 초안을 덮어쓰지 않음',async()=>{
 const node=()=>({childNodes:[],append(...v){this.childNodes.push(...v)},replaceChildren(...v){this.childNodes=v},querySelector(){return null},contains(){return false}});
 const view=node();view.childNodes=['kept-draft'];
 const document={querySelectorAll:()=>[],querySelector:()=>view,addEventListener(){},activeElement:null};
 const context=vm.createContext({readTradeEntry,entryProduct,URLSearchParams,createDraftSession,itemsOnly,mayRefresh,location:{search:'',hash:'#orders'},localStorage:{getItem:()=> '[]'},document,window:{addEventListener(){}},$:()=>view,el:node,say(){},clearTimeout(){}});
 let code=readFileSync(new URL('../beta.js',import.meta.url),'utf8');code=code.slice(code.indexOf('const entry ='));code=code.slice(0,code.lastIndexOf('\n(async () => {'));vm.runInContext(code,context);
 let finish;context.ordersView=async root=>{await new Promise(r=>finish=r);root.append('background-result')};
 const pending=context.route({background:true});view.querySelector=()=>({dirty:true});finish();await pending;assert.deepEqual(view.childNodes,['kept-draft']);
});
