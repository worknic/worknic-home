(()=>{'use strict';
const endpoint='https://script.google.com/macros/s/AKfycbzMH4qy5GOqUsmyNTPOfyk1W2giY1A_ZjUpFsMD3rLAOs4dP4uVDya7bywaIlQOVi8F9g/exec';
const $=s=>document.querySelector(s),el=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n};
const https=value=>{if(typeof value!=='string'||!value.trim())return '';try{const u=new URL(value,location.origin);return (u.protocol==='https:'||u.origin===location.origin)&&!u.username&&!u.password?u.href:''}catch{return ''}};
const routeMatch=location.pathname.match(/^\/products\/([a-zA-Z0-9_-]+)\/$/);
const productId=routeMatch?routeMatch[1]:new URLSearchParams(location.search).get('id')||'';
let fallback=null;
// Presentation-only correction: preserve stored product facts and source records.
function introductionText(value){return typeof value==='string'?value.replaceAll('판매가 미정 · 별도 문의 제품입니다.','사업자 정보 확인·워크닉 승인 후 담당자가 발행한 견적서에서 가격과 공급 조건을 확인합니다.'):value;}
function sourceLabel(s){if(s.type==='manufacturer')return '제조사 자료';try{const host=new URL(s.url).hostname;if(host==='smartstore.naver.com'||host==='m.smartstore.naver.com')return '제품 출처 확인 · 워크닉 스마트스토어';}catch{}return '제품 출처 확인 · 워크닉 원본 상품';}
function sourceLink(label,url){const a=el('a',label);a.href=https(url);a.target='_blank';a.rel='noopener noreferrer';return a;}
function render(data){
 const p=data.products?.find(p=>p.id===productId&&p.published===true),b=p&&data.brands?.find(b=>b.id===p.brand&&b.published===true);
 if(!p||!b||window.WORKNIC_CATEGORIES?.classify(p).group==='unclassified'){document.querySelectorAll('script[data-product-schema]').forEach(n=>n.remove());let robots=document.querySelector('meta[name=robots]');if(!robots){robots=document.createElement('meta');robots.name='robots';document.head.append(robots);}robots.content='noindex,follow';$('#product').hidden=true;$('#product-status').hidden=false;$('#product-status').textContent='공개 중인 상품을 찾을 수 없습니다. ';const a=el('a','상품 목록으로');a.href='/catalog/';$('#product-status').append(a);return;}
 const cached=fallback?.products?.find(x=>x.id===p.id),g=p.guide||(cached?.model===p.model?cached?.guide:null)||{};
 document.title=`${b.name} ${p.name}${p.model?' · '+p.model:''} | WORKNIC`;
 $('#product-status').hidden=true;$('#product').hidden=false;const kind=window.WORKNIC_CATEGORIES?.classify(p),area=kind&&kind.group!=='tools'?'현장용품':'도구';$('#breadcrumb').replaceChildren();const back=el('a',area);back.href=area==='현장용품'?'/supplies/':'/catalog/';const home=el('a','홈');home.href='/';const brandLink=el('a',b.name);brandLink.href='/brands/'+encodeURIComponent(b.id)+'/';$('#breadcrumb').append(home,document.createTextNode(' / '),back,document.createTextNode(' / '),brandLink,document.createTextNode(' / '+p.name));
 if($('#product-quote')){$('#product-quote').href='/business/portal/?product='+encodeURIComponent(p.id);$('#product-quote').textContent='사업자 인증·매입 상담';}$('#brand').textContent=b.english||b.name;$('#name').textContent=p.name;$('#model').textContent=p.model||'';$('#model').hidden=!p.model;$('#summary').textContent=p.summary||'';$('#overview-copy').textContent=p.summary||'';
 const img=$('#product-photo');window.WORKNIC_MEDIA?.clear(img);const thumb=g.media?.thumbnail||{},src=https(thumb.editedSource||p.images?.[0]);img.src=src;img.alt=`${b.name} ${p.name}${p.model?' '+p.model:''}`;img.hidden=!src;
 // Keep a square presentation without stretching or recolouring the source photo.
 img.style.maxWidth=Number(thumb.width)>0?Math.floor(Number(thumb.width))+'px':'100%';
 img.style.maxHeight=Number(thumb.height)>0?Math.floor(Number(thumb.height))+'px':'100%';
 window.WORKNIC_MEDIA?.frame(img,thumb);
 img.onerror=()=>{img.hidden=true;$('#photo-caption').textContent='제품 사진은 문의 시 확인해 주세요.'};
 $('#photo-caption').textContent=typeof thumb.caption==='string'&&thumb.caption.trim()?thumb.caption:[b.name,p.model].filter(Boolean).join(' · ');
 const specs=(p.specs||[]).filter(x=>Array.isArray(x)&&x.length===2&&x[0]&&x[1]&&x[0]!=='등록 상품명');
 const suppliedHighlights=Array.isArray(g.highlights)?g.highlights.filter(x=>x&&typeof x.label==='string'&&typeof x.value==='string'&&x.label.trim()&&x.value.trim()).slice(0,3).map(x=>[x.label,x.value]):[];
 const highlights=suppliedHighlights.length?suppliedHighlights:specs.filter(x=>!['모델','제품군','브랜드','등록 제품군','등록 포장 표기','제조사 기본 모델','국내 등록 모델','기본 본체 모델'].includes(x[0])).slice(0,3);
 $('#highlights').replaceChildren(...highlights.map(([k,v])=>{const n=el('div');n.append(el('strong',v),el('p',k));return n}));$('#highlights').hidden=!highlights.length;
 $('#configuration').textContent=introductionText(g.configuration?.text)||'포함품·별매품·선택 옵션과 판매 단위는 문의 시 확인해 주세요.';
 const configuration=g.configuration||{},configurationFields=[['unit','판매 단위'],['quantity','포장 수량'],['included','포함품'],['excluded','별매품'],['options','선택 옵션']];
 $('#configuration-rows').replaceChildren(...configurationFields.filter(([key])=>typeof configuration[key]==='string'&&configuration[key].trim()).map(([key,label])=>{const row=el('div');row.append(el('dt',label),el('dd',configuration[key]));return row}));
 $('#configuration-rows').hidden=!$('#configuration-rows').children.length;
 $('#feature-list').replaceChildren(...(g.features||[]).map((f,i)=>{const a=el('article'),d=el('div');d.append(el('h3',f.title),el('p',f.text));a.append(el('span',String(i+1).padStart(2,'0')),d);return a}));
 $('#extra-photos').replaceChildren(...(p.images||[]).slice(1,3).map((url,i)=>{const n=el('figure'),photo=el('img');photo.src=https(url);photo.alt=`${p.name} 상세 사진 ${i+1}`;photo.loading='lazy';n.append(photo);return n}));
 const usage=g.media?.usage,showUsage=!!(usage?.verifiedModel&&usage?.src&&usage?.sourceUrl&&usage?.width>=1000&&usage?.height>=1000);
 $('#in-use').hidden=!showUsage;$('#usage-nav').hidden=!showUsage;
 if(showUsage){const photo=$('#usage-image');photo.src=https(usage.src);photo.alt=usage.alt||`${p.name} 공식 사용 예시`;photo.width=usage.width;photo.height=usage.height;$('#usage-text').textContent=usage.text||'제조사가 공개한 해당 모델의 사용 예시입니다.';$('#usage-caption').replaceChildren(sourceLink(usage.credit||'제조사 공식 사진',usage.sourceUrl));}
 $('#spec-rows').replaceChildren(...specs.map(([k,v])=>{const r=el('tr'),h=el('th',k);h.scope='row';r.append(h,el('td',v));return r}));
 const manufacturer=(g.sources||[]).some(s=>s.type==='manufacturer');$('#spec-note').textContent=manufacturer?'제조사 공개 자료와 등록 상품 정보를 함께 확인했습니다. 국내 판매 옵션·구성은 별도로 확인해 주세요.':'워크닉 등록 상품 정보 기준입니다. 옵션·호환 조건과 자세한 수치는 제품 선택·사용 전 해당 모델 안내를 함께 확인해 주세요.';
 const checks=g.checks||[];$('#checks').replaceChildren(...checks.map((c,i)=>{const a=el('article'),n=el('span',String(i+1).padStart(2,'0'));n.className='index';const h=el('h3',c.title||'제품 선택·사용 전 확인');h.className='guide-check-title';a.append(n,h,el('p',introductionText(c.text)));return a}));$('#before').hidden=!checks.length;
 $('#note-title').textContent=g.note?.title||'내 작업에 맞는 도구를 함께 확인합니다.';$('#note-copy').textContent=g.note?.text||'모델과 작업 용도를 알려주시면 규격 확인을 돕겠습니다.';
 $('#product-enquiry').href='mailto:worknic@worknickorea.com?subject='+encodeURIComponent('[제품 정보 문의] '+b.name+' '+p.name)+'&body='+encodeURIComponent('상품번호: '+p.id+'\n모델: '+(p.model||'')+'\n보유 공구 / 작업 용도:\n문의 내용:\n');
 const reviews=(g.reviews||[]).filter(r=>r.verified===true&&r.model===p.model&&r.text&&https(r.sourceUrl)&&r.checkedOn);
 $('#reviews').hidden=!reviews.length;$('#review-items').replaceChildren(...reviews.map(r=>{const a=el('article');a.append(el('p',r.text),sourceLink('후기 출처 · '+r.checkedOn,r.sourceUrl));return a}));
 $('#sources').replaceChildren(...(g.sources||[]).filter(s=>https(s.url)).map(s=>{const item=el('div');item.append(sourceLink(sourceLabel(s),s.url));if(s.scope)item.append(el('span',s.scope));if(s.checkedOn)item.append(el('span','확인 · '+s.checkedOn));return item}));
 $('#product-enquiry').textContent='제품 정보 문의';
 $('#checked-date').textContent=g.checkedOn?'상품 정보 확인 · '+g.checkedOn:'';
}
async function init(){
 const staticPage=!!routeMatch&&$('#product').getAttribute('data-static-id')===productId;
 if(!routeMatch&&productId){
  try{const r=await fetch('/products/routes.json',{credentials:'same-origin',signal:AbortSignal.timeout(5000)});if(r.ok){const manifest=await r.json(),entry=manifest.products?.find(p=>p.id===productId);if(entry&&entry.path==='/products/'+productId+'/'&&/^[a-zA-Z0-9_-]+$/.test(productId)){location.replace(entry.path);return;}}}catch{}
 }
 if(!staticPage){$('#product').hidden=true;$('#product-status').hidden=false;$('#product-status').textContent='최신 상품 정보를 확인하고 있습니다.';}

 try{const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'catalog.get',payload:{}}),credentials:'omit',signal:AbortSignal.timeout(20000)});const j=await r.json();if(!r.ok||j.ok!==true||!j.data?.brands||!Array.isArray(j.data.products))throw Error('catalog');render(j.data);}catch{$('#product').hidden=!staticPage;$('#product-status').hidden=false;$('#product-status').textContent=staticPage?'최신 상품 정보를 확인하지 못했습니다. 아래는 마지막으로 공개 확인된 정보입니다. 현재 공개 여부·구성과 공급 조건은 문의해 주세요.':'최신 상품 정보를 확인하지 못했습니다. 잠시 후 새로고침해 주세요.';}
}
if(window.WORKNIC_BUILD){window.WORKNIC_RENDER=render;window.WORKNIC_INIT=init;}else init();})();


// Shared official channel shortcuts.
(()=>{if(document.querySelector('script[data-worknic-channels-loader]'))return;const s=document.createElement('script');s.src='/floating-channels.js?v=20261112';s.dataset.worknicChannelsLoader='';document.head.append(s);})();
