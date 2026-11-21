import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {getContents,mergeProduct} from '../content/public-content.js';
const release=JSON.parse(fs.readFileSync(new URL('../data/published-content.json',import.meta.url)));
const reply=j=>({ok:true,json:async()=>j});
test('repository publication is restricted to requested, reviewed owned codes; no OS request for them',async()=>{
 const code=Object.keys(release.items)[0];let calls=0;
 const found=await getContents([code],{fetcher:async url=>{calls++;assert.equal(url,'/data/published-content.json');return reply(release)}});
 assert.deepEqual(Object.keys(found),[code]);assert.equal(calls,1);
 const source={name:'Original',price:123,stock:9};const merged=mergeProduct(source,found[code],code);assert.equal(merged.price,123);assert.equal(merged.stock,9);assert.equal(merged.name,'Original');
});
test('withdrawn or unreviewed owned records never reappear from OS; OS-managed unpublish remains empty',async()=>{
 const code=Object.keys(release.items)[0];const r=structuredClone(release);r.items[code].withdrawn=true;let batches=[];
 const found=await getContents([code,'OS'],{fetcher:async(url,opts)=>{if(url.startsWith('/'))return reply(r);batches.push(JSON.parse(opts.body).payload.codes);return reply({ok:true,data:{schema:1,items:{}}})}});
 assert.deepEqual(found,{});assert.deepEqual(batches,[['OS']]);
 delete r.items[code].withdrawn;r.items[code].checks.photos=false;
 assert.deepEqual(await getContents([code],{fetcher:async()=>reply(r)}),{});
});
test('over 120 OS codes are fully batched, even when static index unavailable',async()=>{
 let batches=[];const codes=Array.from({length:245},(_,i)=>'C'+i);
 await getContents(codes,{fetcher:async(url,o)=>{if(url.startsWith('/'))throw Error('offline');batches.push(JSON.parse(o.body).payload.codes);return reply({ok:true,data:{schema:1,items:{}}})}});
 assert.deepEqual(batches.map(x=>x.length),[120,120,5]);assert.deepEqual(batches.flat(),codes);
});
test('release codes and categories agree with ERP; no protected fields or missing sources',()=>{
 const erp=JSON.parse(fs.readFileSync(new URL('../data/assortment.json',import.meta.url)));const codes=new Set(erp.products.map(x=>x.code));
 const cats=JSON.parse(fs.readFileSync(new URL('../data/parts-categories.json',import.meta.url)));const groups=JSON.parse(fs.readFileSync(new URL('../data/parts-groups.json',import.meta.url))).groups.flatMap(x=>x.codes);
 for(const [code,item]of Object.entries(release.items)){assert(codes.has(code));assert(cats.items[code]);assert(groups.includes(code));assert.equal(item.code,code);assert.equal(item.record.sources.length,2);for(const key of Object.keys(item.record))assert(['thumbnail','description','specs','sources','checkedOn'].includes(key));}
});
