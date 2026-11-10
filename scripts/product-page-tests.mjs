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
}
const p=published[0],route='/products/'+p.id+'/';
function browser(html,pathname,search,fetch){const document=documentFrom(html),redirects=[];const context={window:{WORKNIC_BUILD:true,WORKNIC_CATEGORIES:category.window.WORKNIC_CATEGORIES},document,URL,URLSearchParams,AbortSignal,location:{origin:'https://worknic.co.kr',pathname,search,replace:u=>redirects.push(u)},fetch};vm.runInNewContext(guide,context);return {context,document,redirects};}
const staticHtml=fs.readFileSync(path.join(root,'products',p.id,'index.html'),'utf8');
let test=browser(staticHtml,route,'',async()=>{throw Error('timeout')});await test.context.window.WORKNIC_INIT();assert.equal(test.document.querySelector('#product').hidden,false);assert(test.document.querySelector('#product-status').textContent.includes('마지막으로 공개 확인된 정보'));
const response=data=>({ok:true,json:async()=>({ok:true,data})});
test=browser(staticHtml,route,'',async()=>response({brands:data.brands,products:[]}));await test.context.window.WORKNIC_INIT();assert.equal(test.document.querySelector('#product').hidden,true);assert.equal(test.document.querySelector('meta[name=robots]').content,'noindex,follow');assert.equal(test.document.querySelectorAll('script[data-product-schema]').length,0);
test=browser(staticHtml,route,'',async()=>response(data));await test.context.window.WORKNIC_INIT();assert.equal(test.document.querySelector('#product').hidden,false);assert.equal(test.document.querySelector('#name').textContent,p.name);
const legacy=fs.readFileSync(path.join(root,'products/index.html'),'utf8');
assert(legacy.includes('content="noindex,follow"'));
test=browser(legacy,'/products/','?id='+p.id,async()=>({ok:true,json:async()=>manifest}));await test.context.window.WORKNIC_INIT();assert.deepEqual(test.redirects,[route]);
test=browser(legacy,'/products/','?id=https://evil.example/',async url=>url==='/products/routes.json'?{ok:true,json:async()=>({products:[{id:'https://evil.example/',path:'https://evil.example/'}]})}:response({brands:[],products:[]}));await test.context.window.WORKNIC_INIT();assert.deepEqual(test.redirects,[]);assert.equal(test.document.querySelector('#product').hidden,true);
console.log(`PASS: ${published.length} static pages, unique metadata, public filtering, schema, quote/contact links, timeout preservation, unpublication, refresh, safe legacy redirects.`);
