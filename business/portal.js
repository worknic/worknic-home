(()=>{'use strict';
 const origin='https://worknic-trade-beta.onrender.com',params=new URLSearchParams(location.search),raw=params.get('product')||'',product=/^[a-zA-Z0-9_-]{1,120}$/.test(raw)?raw:'',targets=new Set(['catalog','account','orders','pickup']);
 document.querySelectorAll('[data-portal-target]').forEach(a=>{const target=a.dataset.portalTarget;if(!targets.has(target))return;const url=new URL('/trade/',origin);if(product)url.searchParams.set('product',product);url.searchParams.set('next',target==='account'?(product?'catalog':'orders'):target);url.hash=target;a.href=url.href;});
 document.querySelector('#portal-selected').hidden=!product;
 const status=document.querySelector('#portal-status');
 async function refresh(){if(document.hidden)return;try{const response=await fetch(origin+'/api/beta/health',{credentials:'omit',signal:AbortSignal.timeout(12000),cache:'no-store'});if(!response.ok)throw Error('status');const data=await response.json();if(data.ok!==true||typeof data.betaEnabled!=='boolean'||!Array.isArray(data.locations))throw Error('status');const open=data.betaEnabled&&data.locations.some(l=>l.enabled===true);status.dataset.state=open?'open':'closed';status.textContent=open?'승인된 사업자회원의 견적·픽업 베타 접수를 받고 있습니다. 상품·수량·수령 조건을 확인한 뒤 요청해 주세요.':'신규 견적·픽업 접수는 준비 중입니다. 승인회원은 로그인하여 기존 견적·주문·픽업 내역을 확인할 수 있습니다.';}catch{status.dataset.state='unknown';status.textContent='운영 상태를 확인하지 못했습니다. 로그인과 기존 내역은 아래 거래 화면에서 확인해 주세요.';}}
 refresh();setInterval(refresh,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();
