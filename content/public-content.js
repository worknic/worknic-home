export const ENDPOINT='https://script.google.com/macros/s/AKfycbzMH4qy5GOqUsmyNTPOfyk1W2giY1A_ZjUpFsMD3rLAOs4dP4uVDya7bywaIlQOVi8F9g/exec';
export function safeImage(value){return typeof value==='string'&&((/^https:\/\/[^\s\\]+$/i.test(value)&&!/^https:\/\/(?:localhost|127\.|10\.|192\.168\.|169\.254\.|\[)/i.test(value))||(/^\/assets\/[A-Za-z0-9_./-]+$/.test(value)&&!value.includes('..')))?value:'';}
export function codeForPath(path,links){const codes=Object.keys(links||{}).filter(code=>links[code]?.path===path);return codes.length===1?codes[0]:null;}
export function publicRecord(item,code){const r=item?.record;if(item?.code!==code||!Number.isInteger(item.revision)||item.revision<1||!r||!Array.isArray(r.sources)||!r.checkedOn)return null;return r;}
// Repository publications have explicit ownership. OS-managed codes keep their
// original publish/unpublish semantics; they are never copied into this file.
export async function getContents(codes,{fetcher=fetch,endpoint=ENDPOINT}={}){
 const requested=[...new Set(codes)];if(!requested.length)return {};
 const items={},owned=new Set();
 try{const response=await fetcher('/data/published-content.json',{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(5000)});const j=await response.json();
  if(response.ok&&j.schema===1&&j.items&&typeof j.items==='object')for(const code of requested){const item=j.items[code];
   if(item?.publicationChannel!=='repository')continue;owned.add(code);
   if(item.withdrawn===true)continue;
   if(publicRecord(item,code)&&['identity','photos','specs','sources'].every(k=>item.checks?.[k]===true))items[code]=item;
  }
 }catch{/* Existing OS publications remain available if the static index fails. */}
 const pending=requested.filter(code=>!owned.has(code));
 for(let i=0;i<pending.length;i+=120){const batch=pending.slice(i,i+120);try{const response=await fetcher(endpoint,{method:'POST',credentials:'omit',cache:'no-store',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'catalog.content.get',payload:{codes:batch}}),signal:AbortSignal.timeout(20000)});const j=await response.json();
  if(response.ok&&j.ok===true&&j.data?.schema===1&&j.data.items&&typeof j.data.items==='object')for(const code of batch)if(publicRecord(j.data.items[code],code))items[code]=j.data.items[code];
 }catch{/* A failed batch must not hide other verified publications. */}}
 return items;
}
// Whitelist presentation fields. Never spread an override onto a source product.
export function mergeProduct(product,item,code){const r=publicRecord(item,code);if(!r)return product;const p=structuredClone(product);if(typeof r.description==='string'&&r.description.trim())p.summary=r.description;if(Array.isArray(r.specs)&&r.specs.length&&r.specs.every(x=>Array.isArray(x)&&x.length===2&&x.every(v=>typeof v==='string'))){p.specs=r.specs;p.guide={...p.guide,highlights:r.specs.slice(0,3).map(([label,value])=>({label,value}))};}
 const thumbnail=safeImage(r.thumbnail?.url);if(thumbnail){p.contentThumbnailAlt=r.thumbnail.alt;p.contentThumbnailFallback=safeImage(p.guide?.media?.thumbnail?.editedSource||p.images?.[0]);p.images=[thumbnail,...(p.images||[]).slice(1)];p.guide={...p.guide,media:{...p.guide?.media,thumbnail:{editedSource:thumbnail}}};}
 p.guide={...p.guide,checkedOn:r.checkedOn,sources:[...(p.guide?.sources||[]),...r.sources.filter(s=>safeImage(s.url)&&typeof s.label==='string').map(s=>({type:'reference',url:s.url,scope:s.label,checkedOn:r.checkedOn}))]};p.contentRevision=item.revision;return p;}
export async function enrichCatalog(data,{fetcher=fetch,endpoint=ENDPOINT}={}){try{const response=await fetcher('/data/assortment-detail-links.json',{credentials:'omit',signal:AbortSignal.timeout(5000)});if(!response.ok)return data;const map=await response.json();if(map.schema!==1)return data;const keyed=data.products.map(p=>({p,code:codeForPath('/products/'+p.id+'/',map.links)})),codes=keyed.map(x=>x.code).filter(Boolean);const items={};for(let i=0;i<codes.length;i+=120)Object.assign(items,await getContents(codes.slice(i,i+120),{fetcher,endpoint}));return {...data,products:keyed.map(({p,code})=>code?mergeProduct(p,items[code],code):p)};}catch{return data;}}
