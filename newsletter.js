// 실제 사용자 제출 시에만 기존 Jetpack 구독 연결을 호출합니다.
const newsletterForm=document.querySelector('[data-newsletter-form]');
if(newsletterForm){
 const input=newsletterForm.querySelector('input[type=email]');
 const button=newsletterForm.querySelector('button[type=submit]');
 const status=newsletterForm.querySelector('[role=status]');
 const endpoint='https://worknic.work/wp-json/worknic/v1/newsletter';
 input.disabled=false;button.disabled=false;
 newsletterForm.addEventListener('submit',async event=>{
  event.preventDefault();input.value=input.value.trim();
  if(button.disabled||!newsletterForm.reportValidity())return;
  const email=input.value;
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),35000);
  button.disabled=true;input.readOnly=true;button.textContent='신청 중';
  newsletterForm.setAttribute('aria-busy','true');status.dataset.state='pending';
  status.textContent='구독 신청을 처리하고 있습니다.';
  let submitted=false;
  try{
   const options={credentials:'omit',cache:'no-store',signal:controller.signal};
   const challengeResponse=await fetch(endpoint,options);
   const challenge=await challengeResponse.json();
   if(!challengeResponse.ok||challenge.status!=='ready'||typeof challenge.token!=='string')throw Error('connection');
   submitted=true;
   const response=await fetch(endpoint,{...options,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,token:challenge.token,website:newsletterForm.querySelector('[data-newsletter-trap]').value})});
   const result=await response.json();
   if(response.ok&&result.status==='check_email'){
    status.dataset.state='success';status.textContent=result.message;newsletterForm.reset();
   }else{
    status.dataset.state='error';
    const known=['invalid_email','expired','rate_limited','unavailable','unconfirmed'];
    status.textContent=known.includes(result.status)&&typeof result.message==='string'?result.message.slice(0,500):'신청 결과를 확인하지 못했습니다. 받은편지함을 확인한 뒤 잠시 후 다시 시도해 주세요.';
   }
  }catch{
   status.dataset.state='error';
   status.textContent=submitted?'접수 여부를 확인하지 못했습니다. 중복 신청을 피하기 위해 받은편지함을 확인한 뒤 잠시 후 다시 시도해 주세요.':'구독 서비스에 연결하지 못했습니다. 인터넷 연결을 확인하고 다시 시도해 주세요.';
  }finally{
   clearTimeout(timeout);button.disabled=false;input.readOnly=false;button.textContent='구독하기';newsletterForm.removeAttribute('aria-busy');
  }
 });
}
