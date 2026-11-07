(()=>{'use strict';
const endpoint='https://script.google.com/macros/s/AKfycbzMH4qy5GOqUsmyNTPOfyk1W2giY1A_ZjUpFsMD3rLAOs4dP4uVDya7bywaIlQOVi8F9g/exec';
const $=s=>document.querySelector(s),el=(tag,text)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;return n};
const https=value=>{try{const u=new URL(value,location.origin);return (u.protocol==='https:'||u.origin===location.origin)&&!u.username&&!u.password?u.href:''}catch{return ''}};
const productId=new URLSearchParams(location.search).get('id')||'';
let fallback=null;
function sourceLink(label,url){const a=el('a',label);a.href=https(url);a.target='_blank';a.rel='noopener noreferrer';return a;}
function render(data){
 const p=data.products?.find(p=>p.id===productId&&p.published!==false),b=p&&data.brands?.find(b=>b.id===p.brand&&b.published!==false);
 if(!p||!b){$('#product').hidden=true;$('#product-status').hidden=false;$('#product-status').textContent='공개 중인 상품을 찾을 수 없습니다. ';const a=el('a','상품 목록으로');a.href='/catalog/';$('#product-status').append(a);return;}
 const cached=fallback?.products?.find(x=>x.id===p.id),g=p.guide||(cached?.model===p.model?cached?.guide:null)||{};
 document.title=`${b.name} ${p.name}${p.model?' · '+p.model:''} | WORKNIC`;
 $('#product-status').hidden=true;$('#product').hidden=false;const kind=window.WORKNIC_CATEGORIES?.classify(p),area=kind&&kind.group!=='tools'?'현장용품':'도구';$('#breadcrumb').replaceChildren();const back=el('a',area);back.href=area==='현장용품'?'/supplies/':'/catalog/';$('#breadcrumb').append(back,document.createTextNode(' / '+b.name+' / '+(p.category||b.category||'')));
 $('#brand').textContent=b.english||b.name;$('#name').textContent=p.name;$('#model').textContent=p.model||'';$('#model').hidden=!p.model;$('#summary').textContent=p.summary||'';$('#overview-copy').textContent=p.summary||'';
 const img=$('#product-photo'),thumb=g.media?.thumbnail||{},src=https(thumb.editedSource||p.images?.[0]);img.src=src;img.alt=`${b.name} ${p.name}${p.model?' '+p.model:''}`;img.hidden=!src;
 // Keep a square presentation without stretching or recolouring the source photo.
 img.style.maxWidth=Number(thumb.width)>0?Math.floor(Number(thumb.width))+'px':'100%';
 img.style.maxHeight=Number(thumb.height)>0?Math.floor(Number(thumb.height))+'px':'100%';
 img.onerror=()=>{img.hidden=true;$('#photo-caption').textContent='제품 사진은 문의 시 확인해 주세요.'};
 $('#photo-caption').textContent=[b.name,p.model].filter(Boolean).join(' · ');
 const specs=(p.specs||[]).filter(x=>Array.isArray(x)&&x.length===2&&x[0]&&x[1]&&x[0]!=='등록 상품명');
 const highlights=specs.filter(x=>!['모델','제품군','브랜드','등록 제품군','등록 포장 표기'].includes(x[0])).slice(0,3);
 $('#highlights').replaceChildren(...highlights.map(([k,v])=>{const n=el('div');n.append(el('strong',v),el('p',k));return n}));$('#highlights').hidden=!highlights.length;
 $('#configuration').textContent=g.configuration?.text||'포함품·별매품·선택 옵션과 판매 단위는 문의 시 확인해 주세요.';
 const configuration=g.configuration||{},configurationFields=[['unit','판매 단위'],['quantity','포장 수량'],['included','포함품'],['excluded','별매품'],['options','선택 옵션']];
 $('#configuration-rows').replaceChildren(...configurationFields.filter(([key])=>typeof configuration[key]==='string'&&configuration[key].trim()).map(([key,label])=>{const row=el('div');row.append(el('dt',label),el('dd',configuration[key]));return row}));
 $('#configuration-rows').hidden=!$('#configuration-rows').children.length;
 $('#feature-list').replaceChildren(...(g.features||[]).map((f,i)=>{const a=el('article'),d=el('div');d.append(el('h3',f.title),el('p',f.text));a.append(el('span',String(i+1).padStart(2,'0')),d);return a}));
 $('#extra-photos').replaceChildren(...(p.images||[]).slice(1,3).map((url,i)=>{const n=el('figure'),photo=el('img');photo.src=https(url);photo.alt=`${p.name} 상세 사진 ${i+1}`;photo.loading='lazy';n.append(photo);return n}));
 const usage=g.media?.usage,showUsage=!!(usage?.verifiedModel&&usage?.src&&usage?.sourceUrl&&usage?.width>=1000&&usage?.height>=1000);
 $('#in-use').hidden=!showUsage;$('#usage-nav').hidden=!showUsage;
 if(showUsage){const photo=$('#usage-image');photo.src=https(usage.src);photo.alt=usage.alt||`${p.name} 공식 사용 예시`;photo.width=usage.width;photo.height=usage.height;$('#usage-text').textContent=usage.text||'제조사가 공개한 해당 모델의 사용 예시입니다.';$('#usage-caption').replaceChildren(sourceLink(usage.credit||'제조사 공식 사진',usage.sourceUrl));}
 $('#spec-rows').replaceChildren(...specs.map(([k,v])=>{const r=el('tr'),h=el('th',k);h.scope='row';r.append(h,el('td',v));return r}));
 const manufacturer=(g.sources||[]).some(s=>s.type==='manufacturer');$('#spec-note').textContent=manufacturer?'제조사 공개 자료와 등록 상품 정보를 함께 확인했습니다. 국내 판매 옵션·구성은 별도로 확인해 주세요.':'워크닉 등록 상품 정보 기준입니다. 옵션·호환 조건과 자세한 수치는 구매 전 해당 모델 안내를 함께 확인해 주세요.';
 const checks=g.checks||[];$('#checks').replaceChildren(...checks.map((c,i)=>{const a=el('article'),n=el('span',String(i+1).padStart(2,'0'));n.className='index';const h=el('h3',c.title||'구매 전 확인');h.className='guide-check-title';a.append(n,h,el('p',c.text));return a}));$('#before').hidden=!checks.length;
 $('#note-title').textContent=g.note?.title||'내 작업에 맞는 도구를 함께 확인합니다.';$('#note-copy').textContent=g.note?.text||'모델과 작업 용도를 알려주시면 규격 확인을 돕겠습니다.';
 $('#product-enquiry').href='mailto:worknic@worknickorea.com?subject='+encodeURIComponent('[상품 구성 문의] '+b.name+' '+p.name)+'&body='+encodeURIComponent('상품번호: '+p.id+'\n모델: '+(p.model||'')+'\n보유 공구 / 작업 용도:\n필요 수량:\n');
 const reviews=(g.reviews||[]).filter(r=>r.verified===true&&r.model===p.model&&r.text&&https(r.sourceUrl)&&r.checkedOn);
 $('#reviews').hidden=!reviews.length;$('#review-items').replaceChildren(...reviews.map(r=>{const a=el('article');a.append(el('p',r.text),sourceLink('후기 출처 · '+r.checkedOn,r.sourceUrl));return a}));
 $('#sources').replaceChildren(...(g.sources||[]).filter(s=>https(s.url)).map(s=>{const item=el('div');item.append(sourceLink(s.type==='manufacturer'?'제조사 자료':'워크닉 원본 상품',s.url));if(s.scope)item.append(el('span',s.scope));if(s.checkedOn)item.append(el('span','확인 · '+s.checkedOn));return item}));
 $('#checked-date').textContent=g.checkedOn?'상품 정보 확인 · '+g.checkedOn:'';
}
async function init(){
 try{const r=await fetch('/data/catalog.json');if(!r.ok)throw Error();fallback=await r.json();render(fallback)}catch{$('#product-status').textContent='상품 정보를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.'}
 try{const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({action:'catalog.get',payload:{}}),credentials:'omit',signal:AbortSignal.timeout(20000)});const j=await r.json();if(j.ok===true&&j.data?.brands)render(j.data);}catch{}
}
init();})();
