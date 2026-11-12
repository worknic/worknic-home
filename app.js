// 미리보기에서는 문의를 자동 전송하지 않습니다. 실제 사용자 제출 시에만 호출합니다.
const form=document.querySelector('.contact-form');
if(form)form.addEventListener('submit',async event=>{
 event.preventDefault();if(!form.reportValidity())return;
 const button=form.querySelector('button'),status=form.querySelector('.form-status');
 const data=new FormData(form);const payload=Object.fromEntries(['name','org','contact','body'].map(k=>[k,String(data.get(k)||'').trim()]));
 if(!payload.name||!payload.contact||!payload.body){status.textContent='이름, 연락처와 문의 내용을 입력해 주세요.';return;}
 button.disabled=true;status.textContent='문의 창구에 연결하고 있습니다.';
 try{const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),20000);let response;
 try{response=await fetch(form.dataset.endpoint,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify({...payload,at:new Date().toISOString()}),signal:controller.signal});}finally{clearTimeout(timeout);}
 if(!response.ok)throw new Error('HTTP');const result=await response.json();
 if(result.success!==true&&result.ok!==true)throw new Error('unconfirmed');
 status.textContent='문의가 접수되었습니다. 상담시간에 확인 후 답변드립니다.';form.reset();
 }catch{status.textContent='접수 완료를 확인하지 못했습니다. 중복 전송을 피하기 위해 톡톡 또는 전화로 접수 여부를 확인해 주세요. 입력한 내용은 유지됩니다.';}
 finally{button.disabled=false;}
});
document.querySelector('.mobile-menu')?.addEventListener('keydown',event=>{if(event.key==='Escape'){const menu=event.currentTarget;menu.open=false;menu.querySelector('summary').focus();}});

// Shared official channel shortcuts.
(()=>{if(document.querySelector('script[data-worknic-channels-loader]'))return;const s=document.createElement('script');s.src='/floating-channels.js?v=20261112';s.dataset.worknicChannelsLoader='';document.head.append(s);})();
