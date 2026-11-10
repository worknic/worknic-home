#!/usr/bin/env node
// Run with the same --source= snapshot used by the generator, optionally --check.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {documentFrom} from './build-product-pages.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=process.argv.find(a=>a.startsWith('--source='))?.slice(9)||path.join(root,'data/catalog.json');
const data=JSON.parse(fs.readFileSync(source,'utf8'));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'products/routes.json'),'utf8'));
const guide=fs.readFileSync(path.join(root,'products/guide.js'),'utf8');
const category={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'categories.js'),'utf8'),category);
const published=data.products.filter(p=>p.published===true&&data.brands.some(b=>b.id===p.brand&&b.published===true)&&category.window.WORKNIC_CATEGORIES.classify(p).group!=='unclassified');
assert.deepEqual(new Set(manifest.products.map(p=>p.id)),new Set(published.map(p=>p.id)));
const titles=new Set();
const introductionText=value=>value.replaceAll('판매가 미정 · 별도 문의 제품입니다.','사업자 정보 확인·워크닉 승인 후 담당자가 발행한 견적서에서 가격과 공급 조건을 확인합니다.');
for(const p of published){
 const html=fs.readFileSync(path.join(root,'products',p.id,'index.html'),'utf8');
 const doc=documentFrom(html),head=doc.head.children;
 assert.equal(doc.querySelector('#product').hidden,false);
 assert.equal(doc.querySelector('#product').getAttribute('data-static-id'),p.id);
 assert.equal(doc.querySelector('#name').textContent,p.name);
 assert.equal(doc.querySelector('#summary').textContent,p.summary||'');
 const title=doc.querySelector('title').textContent;assert(!titles.has(title),'duplicate title');titles.add(title);
 assert.equal(head.find(n=>n.attrs.rel==='canonical').attrs.href,'https://worknic.co.kr/products/'+p.id+'/');
 assert(!head.some(n=>n.attrs.name==='robots'&&n.attrs.content.includes('noindex')));
 const structured=head.filter(n=>n.attrs.type==='application/ld+json').map(n=>JSON.parse(n.textContent));
 const product=structured.find(n=>n['@type']==='Product');assert.equal(product.sku,p.id);assert(!product.offers&&!product.review&&!product.aggregateRating);
 assert(structured.find(n=>n['@type']==='BreadcrumbList'));
 assert.equal(doc.querySelector('#product-quote').attrs.href,'/business/portal/?product='+encodeURIComponent(p.id));
 assert(doc.querySelector('#product-enquiry').attrs.href.startsWith('mailto:worknic@worknickorea.com?'));
 assert.equal(doc.querySelector('#checked-date').textContent,p.guide?.checkedOn?'상품 정보 확인 · '+p.guide.checkedOn:'');
 assert(!html.includes('판매가 미정')&&!html.includes('가격·구성 문의하기')&&!html.includes('id="enquiry-pricing"'));
 assert(html.includes('신규 견적 접수 가능 여부는 사업자 거래 화면의 운영 안내를 확인해 주세요.'));
 assert.equal(doc.querySelector('#product-quote').textContent,'사업자 인증·매입 상담');
 assert.equal(doc.querySelector('#product-enquiry').textContent,'제품 정보 문의');
 const mail=decodeURIComponent(doc.querySelector('#product-enquiry').attrs.href);assert(!mail.includes('필요 수량')&&!mail.includes('가격'));
 assert.equal(product.description,p.summary||product.description);
 assert.equal(doc.querySelector('#model').textContent,p.model||'');
 const specs=(p.specs||[]).filter(x=>Array.isArray(x)&&x.length===2&&x[0]&&x[1]&&x[0]!=='등록 상품명');
 assert.deepEqual(doc.querySelector('#spec-rows').children.map(row=>row.children.map(n=>n.textContent)),specs);
 if(p.guide?.configuration?.text)assert.equal(doc.querySelector('#configuration').textContent,introductionText(p.guide.configuration.text));
 for(const [i,c] of (p.guide?.checks||[]).entries()){const row=doc.querySelector('#checks').children[i];assert.equal(row.children.at(-1).textContent,introductionText(c.text));}
 const rows=doc.querySelector('#sources').children;
 for(const [i,source] of (p.guide?.sources||[]).entries()){
  const row=rows[i];assert(row,'missing source');assert.equal(row.children[0].attrs.href,source.url);
  if(source.type!=='manufacturer'&&new URL(source.url).hostname==='smartstore.naver.com')assert.equal(row.children[0].textContent,'제품 출처 확인 · 워크닉 스마트스토어');
  if(source.scope)assert(row.children.some(n=>n.textContent===source.scope));
  if(source.checkedOn)assert(row.children.some(n=>n.textContent==='확인 · '+source.checkedOn));
 }
 for(const key of ['unit','quantity','included','excluded','options'])if(p.guide?.configuration?.[key])assert(doc.querySelector('#configuration-rows').textContent.includes(p.guide.configuration[key]));

}
const p=published[0],route='/products/'+p.id+'/';
function browser(html,pathname,search,fetch){const document=documentFrom(html),redirects=[];const context={window:{WORKNIC_BUILD:true,WORKNIC_CATEGORIES:category.window.WORKNIC_CATEGORIES},document,URL,URLSearchParams,AbortSignal,location:{origin:'https://worknic.co.kr',pathname,search,replace:u=>redirects.push(u)},fetch};vm.runInNewContext(guide,context);return {context,document,redirects};}
const staticHtml=fs.readFileSync(path.join(root,'products',p.id,'index.html'),'utf8');
let test=browser(staticHtml,route,'',async()=>{throw Error('timeout')});await test.context.window.WORKNIC_INIT();assert.equal(test.document.querySelector('#product').hidden,false);assert(test.document.querySelector('#product-status').textContent.includes('마지막으로 공개 확인된 정보'));
const response=data=>({ok:true,json:async()=>({ok:true,data})});
test=browser(staticHtml,route,'',async()=>response({brands:data.brands,products:[]}));await test.context.window.WORKNIC_INIT();assert.equal(test.document.querySelector('#product').hidden,true);assert.equal(test.document.querySelector('meta[name=robots]').content,'noindex,follow');assert.equal(test.document.querySelectorAll('script[data-product-schema]').length,0);
test=browser(staticHtml,route,'',async()=>response(data));await test.context.window.WORKNIC_INIT();assert.equal(test.document.querySelector('#product').hidden,false);assert.equal(test.document.querySelector('#name').textContent,p.name);
// A previously rendered enquiry-only product must never retain its old price CTA.
const sequence=published.filter(p=>p.guide?.commerce?.mode==='enquiry-only').slice(0,1).concat(published.filter(p=>p.guide?.commerce?.mode!=='enquiry-only').slice(0,1));
for(const item of sequence){test.context.window.WORKNIC_RENDER({...data,products:[{...item,id:p.id}]});assert.equal(test.document.querySelector('#product-enquiry').textContent,'제품 정보 문의');assert.equal(test.document.querySelector('#product-quote').textContent,'사업자 인증·매입 상담');}
const legacy=fs.readFileSync(path.join(root,'products/index.html'),'utf8');
assert(legacy.includes('content="noindex,follow"'));
test=browser(legacy,'/products/','?id='+p.id,async()=>({ok:true,json:async()=>manifest}));await test.context.window.WORKNIC_INIT();assert.deepEqual(test.redirects,[route]);
test=browser(legacy,'/products/','?id=https://evil.example/',async url=>url==='/products/routes.json'?{ok:true,json:async()=>({products:[{id:'https://evil.example/',path:'https://evil.example/'}]})}:response({brands:[],products:[]}));await test.context.window.WORKNIC_INIT();assert.deepEqual(test.redirects,[]);assert.equal(test.document.querySelector('#product').hidden,true);
console.log(`PASS: ${published.length} static pages, unique metadata, public filtering, schema, quote/contact links, timeout preservation, unpublication, refresh, safe legacy redirects, business-purpose CTAs, successive-render labels, and source/specification preservation.`);
