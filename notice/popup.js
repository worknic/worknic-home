export const koreanDay=(time=Date.now())=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(time));
export function active(config,time=Date.now()){const end=Date.parse(config?.expiresAt);return config?.enabled===true&&Number.isFinite(end)&&time<end&&/^\/assets\/notices\/[A-Za-z0-9_-]+\.(?:png|jpg|webp)$/.test(config.image)&&typeof config.id==='string'&&/^[A-Za-z0-9_-]+$/.test(config.id);}
export function hiddenReason(read,key,day=koreanDay()){if(read('localStorage',key)===day)return 'hidden-today';if(read('sessionStorage',key)==='closed')return 'closed-session';return '';}
export async function showNotice(){
 if(location.pathname!=='/'&&location.pathname!=='/index.html')return;
 const read=(store,key)=>{try{return window[store].getItem(key)}catch{return null}},write=(store,key,value)=>{try{window[store].setItem(key,value)}catch{}};
 try{
  const response=await fetch('/notice/event.json',{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(10000)});
  if(!response.ok)return;const config=await response.json();if(!active(config))return;
  const key='worknic-notice-'+config.id,main=document.querySelector('main');if(!main||main.querySelector('.event-notice-launcher'))return;
  const launcher=document.createElement('aside');launcher.className='event-notice-launcher';launcher.setAttribute('aria-label','행사 공지');
  const label=document.createElement('span');label.textContent=config.title||'워크닉 행사 안내';
  const reopen=document.createElement('button');reopen.type='button';reopen.textContent='행사 포스터 보기';launcher.append(label,reopen);main.prepend(launcher);
  let dialog=null,opening=false,timer;
  const expire=()=>{if(active(config))return;clearTimeout(timer);dialog?.close();launcher.remove();document.removeEventListener('visibilitychange',expire);};
  timer=setTimeout(expire,Math.min(2147483647,Math.max(0,Date.parse(config.expiresAt)-Date.now())));document.addEventListener('visibilitychange',expire);
  const open=async()=>{
   if(opening||dialog?.open||!active(config)){expire();return;}opening=true;reopen.disabled=true;
   try{
    const candidate=document.createElement('dialog');candidate.className='event-notice';candidate.setAttribute('aria-labelledby','event-notice-title');
    const head=document.createElement('div');head.className='event-notice-head';const title=document.createElement('h2');title.id='event-notice-title';title.textContent=config.title||'워크닉 행사 안내';
    const close=document.createElement('button');close.type='button';close.textContent='닫기';close.setAttribute('aria-label','행사 안내 닫기');head.append(title,close);
    const body=document.createElement('div');body.className='event-notice-body';const image=document.createElement('img');image.src=config.image;image.alt=config.alt||config.title||'워크닉 행사 안내';image.width=2160;image.height=3800;body.append(image);
    if(Array.isArray(config.text)){const details=document.createElement('details'),summary=document.createElement('summary');summary.textContent='행사 안내 글로 보기';details.append(summary);for(const line of config.text){const p=document.createElement('p');p.textContent=line;details.append(p);}body.append(details);}
    const foot=document.createElement('div');foot.className='event-notice-foot';const today=document.createElement('button');today.type='button';today.textContent='오늘 하루 보지 않기';foot.append(today);candidate.append(head,body,foot);
    await image.decode();if(!active(config)){expire();return;}const previous=document.activeElement;dialog=candidate;document.body.append(dialog);document.documentElement.classList.add('event-notice-open');
    candidate.addEventListener('close',()=>{document.documentElement.classList.remove('event-notice-open');candidate.remove();dialog=null;launcher.dataset.noticeState=hiddenReason(read,key)||'ready';if(previous?.isConnected&&typeof previous.focus==='function')previous.focus({preventScroll:true});},{once:true});
    const closeForSession=()=>write('sessionStorage',key,'closed');candidate.addEventListener('cancel',closeForSession);close.onclick=()=>{closeForSession();candidate.close();};today.onclick=()=>{write('localStorage',key,koreanDay());candidate.close();};
    candidate.showModal();launcher.dataset.noticeState='shown';close.focus();
   }catch{launcher.dataset.noticeState='image-error';reopen.textContent='행사 포스터 다시 불러오기';}
   finally{opening=false;reopen.disabled=false;}
  };
  reopen.onclick=open;const hidden=hiddenReason(read,key);launcher.dataset.noticeState=hidden||'ready';if(!hidden)await open();
 }catch{/* Keep the original homepage usable if notice loading fails. */}
}
if(typeof document!=='undefined')showNotice();
