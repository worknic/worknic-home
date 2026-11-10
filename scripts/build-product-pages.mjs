#!/usr/bin/env node
// Dependency-free static rendering. Uses the same presentation function as the browser.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=process.argv.find(a=>a.startsWith('--source='))?.slice(9)||path.join(root,'data/catalog.json');
const check=process.argv.includes('--check');
const data=JSON.parse(fs.readFileSync(source,'utf8'));
const escape=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const decode=s=>s.replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const voids=new Set(['meta','link','img','br','hr','input','source','wbr','area','base','embed','param','track','col']);
class Node {
 constructor(tag='',text=''){this.tag=tag;this.text=text;this.attrs={};this.children=[];this.style={};}
 append(...nodes){for(const n of nodes)n.parent=this;this.children.push(...nodes);}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
 replaceChildren(...nodes){this.children=[...nodes];this.text='';}
 set textContent(v){this.children=[];this.text=v==null?'':String(v);}
 get textContent(){return this.text+this.children.map(n=>n.textContent).join('');}
 set hidden(v){if(v)this.attrs.hidden='';else delete this.attrs.hidden;}
 get hidden(){return 'hidden' in this.attrs;}
 setAttribute(k,v){this.attrs[k]=String(v);}
 getAttribute(k){return this.attrs[k]??null;}
 toString(){if(!this.tag)return escape(this.text);const styles=Object.entries(this.style).map(([k,v])=>k.replace(/[A-Z]/g,c=>'-'+c.toLowerCase())+':'+v).join(';');const attrs={...this.attrs,...(styles?{style:styles}:{})};return '<'+this.tag+Object.entries(attrs).map(([k,v])=>' '+k+'="'+escape(v)+'"').join('')+'>'+ (voids.has(this.tag)?'':escape(this.text)+this.children.join('')+'</'+this.tag+'>');}
}
for(const key of ['href','src','alt','width','height','loading','decoding','target','rel','scope','content','name'])Object.defineProperty(Node.prototype,key,{get(){return this.attrs[key]||''},set(v){this.attrs[key]=String(v)}});
Object.defineProperty(Node.prototype,'className',{set(v){this.attrs.class=String(v)}});
function documentFrom(html){const top=new Node('root'),stack=[top],ids=new Map();for(const token of html.match(/<!--[^]*?-->|<![^>]*>|<[^>]*>|[^<]+/g)||[]){if(token.startsWith('<!'))continue;if(token.startsWith('</')){stack.pop();continue;}if(token.startsWith('<')){const tag=token.match(/^<([\w-]+)/)[1],n=new Node(tag);for(const m of token.slice(tag.length+1,-1).matchAll(/([\w:-]+)(?:="([^"]*)")?/g))n.attrs[m[1]]=decode(m[2]??'');stack.at(-1).append(n);if(n.attrs.id)ids.set(n.attrs.id,n);if(!voids.has(tag))stack.push(n);}else stack.at(-1).append(new Node('',decode(token)));}const find=(tag)=>{const walk=n=>n.tag===tag?n:n.children.map(walk).find(Boolean);return walk(top)};return {top,head:find('head'),querySelector:s=>s[0]==='#'?ids.get(s.slice(1)):s==='meta[name=robots]'?find('head').children.find(n=>n.tag==='meta'&&n.attrs.name==='robots'):find(s),querySelectorAll:s=>s==='script[data-product-schema]'?find('head').children.filter(n=>n.tag==='script'&&'data-product-schema' in n.attrs):[],createElement:t=>new Node(t),createTextNode:t=>new Node('',t),set title(v){find('title').textContent=v}};}
const categories={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'categories.js'),'utf8'),categories);
const classify=categories.window.WORKNIC_CATEGORIES.classify;
const brands=new Map(data.brands.filter(b=>b.published===true).map(b=>[b.id,b]));
const products=data.products.filter(p=>p.published===true&&brands.has(p.brand)&&classify(p).group!=='unclassified');
if(!products.length)throw Error('No reviewed public products found');
const seen=new Set();for(const p of products){if(typeof p.id!=='string'||!/^[a-zA-Z0-9_-]+$/.test(p.id)||seen.has(p.id))throw Error('Invalid or duplicate route ID: '+p.id);seen.add(p.id);}
const template=fs.readFileSync(path.join(root,'products/index.html'),'utf8');
const guide=fs.readFileSync(path.join(root,'products/guide.js'),'utf8');
const origin='https://worknic.co.kr';
const safeUrl=v=>{if(typeof v!=='string'||!v.trim())return null;try{const u=new URL(v,origin);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null}catch{return null}};
const json=v=>JSON.stringify(v).replace(/</g,'\\u003c');
let changed=[];
function output(relative,content){const target=path.join(root,relative);if(fs.existsSync(target)&&fs.readFileSync(target,'utf8')===content)return;if(check){changed.push(relative);return;}fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content);}
for(const p of products){
 const b=brands.get(p.brand),doc=documentFrom(template),route='/products/'+p.id+'/',url=origin+route;
 const context={window:{WORKNIC_BUILD:true,WORKNIC_CATEGORIES:categories.window.WORKNIC_CATEGORIES},document:doc,URL,URLSearchParams,location:{origin,pathname:route,search:''}};
 vm.runInNewContext(guide,context);context.window.WORKNIC_RENDER(data);
 const article=doc.querySelector('#product');article.attrs['data-static-id']=p.id;
 doc.head.children=doc.head.children.filter(n=>n.attrs.name!=='robots');
 const title=`${b.name} ${p.name}${p.model?' · '+p.model:''} | WORKNIC`;
 const description=[b.name,p.name,p.model,p.summary||'규격과 판매 단위·구성, 구매 전 확인사항과 출처를 확인하세요.'].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
 for(const n of doc.head.children)if(n.attrs.name==='description')n.content=description;
 const canonical=new Node('link');canonical.rel='canonical';canonical.href=url;doc.head.append(canonical);
 for(const [property,content] of Object.entries({'og:type':'product','og:locale':'ko_KR','og:site_name':'WORKNIC','og:title':title,'og:description':description,'og:url':url,'twitter:card':'summary_large_image'})){const n=new Node('meta');n.attrs[property.startsWith('twitter:')?'name':'property']=property;n.content=content;doc.head.append(n);}
 const image=safeUrl(p.guide?.media?.thumbnail?.editedSource||p.images?.[0]);if(image){const n=new Node('meta');n.attrs.property='og:image';n.content=image;doc.head.append(n);}
 const kind=classify(p),area=kind.group==='tools'?'도구':'현장용품',areaUrl=kind.group==='tools'?'/catalog/':'/supplies/';
 const breadcrumb=doc.querySelector('#breadcrumb');breadcrumb.replaceChildren();for(const [label,href] of [['홈','/'],[area,areaUrl],[b.name,'/brands/'+encodeURIComponent(b.id)+'/']]){const a=new Node('a',label);a.href=href;breadcrumb.append(a,new Node('',' / '));}breadcrumb.append(new Node('',p.name));
 const product={'@context':'https://schema.org','@type':'Product','@id':url+'#product',url,name:p.name,description:p.summary||description,brand:{'@type':'Brand',name:b.name},sku:p.id,...(p.model?{model:p.model}:{}),...(image?{image:[image]}:{})};
 const specs=(p.specs||[]).filter(x=>Array.isArray(x)&&x.length===2&&x[0]&&x[1]&&x[0]!=='등록 상품명');if(specs.length)product.additionalProperty=specs.map(([name,value])=>({'@type':'PropertyValue',name,value}));
 const crumbs={'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[['홈',origin+'/'],[area,origin+areaUrl],[p.name,url]].map(([name,item],i)=>({'@type':'ListItem',position:i+1,name,item}))};
 // Raw JSON-LD text is inserted after HTML serialization to avoid HTML entity encoding.
 let html='<!doctype html>'+doc.top.children.join('');
 html=html.replace('</head>',[product,crumbs].map(s=>'<script type="application/ld+json" data-product-schema>'+json(s)+'</script>').join('')+'</head>');
 output('products/'+p.id+'/index.html',html+'\n');
}
const manifest={schemaVersion:1,products:products.map(p=>({id:p.id,path:'/products/'+p.id+'/',name:p.name,brand:p.brand,model:p.model||''})).sort((a,b)=>a.id.localeCompare(b.id))};
// Remove only pages previously generated by this script, never arbitrary directories.
const manifestPath=path.join(root,'products/routes.json');
if(fs.existsSync(manifestPath))for(const entry of JSON.parse(fs.readFileSync(manifestPath,'utf8')).products||[]){if(/^[a-zA-Z0-9_-]+$/.test(entry.id)&&!seen.has(entry.id)){const target=path.join(root,'products',entry.id,'index.html');if(fs.existsSync(target)&&fs.readFileSync(target,'utf8').includes('data-static-id="'+entry.id+'"')){if(check)changed.push('obsolete:'+entry.id);else fs.unlinkSync(target);}}}
output('products/routes.json',JSON.stringify(manifest,null,2)+'\n');
if(changed.length){console.error('Static output differs: '+changed.join(', '));process.exitCode=1;}else console.log(`${check?'Verified':'Generated'} ${products.length} public product pages; manifest products/routes.json`);

export {documentFrom};
