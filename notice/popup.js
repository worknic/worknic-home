export const koreanDay=(time=Date.now())=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date(time));
const validId=config=>typeof config?.id==='string'&&/^[A-Za-z0-9_-]+$/.test(config.id);
export function active(config,time=Date.now()){const end=Date.parse(config?.expiresAt);return config?.enabled===true&&Number.isFinite(end)&&time<end&&/^\/assets\/notices\/[A-Za-z0-9_-]+\.(?:png|jpg|webp)$/.test(config.image)&&validId(config);}
export function businessActive(config){return config?.enabled===true&&config.kind==='business'&&validId(config)&&config.joinPath==='/business/'&&config.portalPath==='/business/portal/';}
export function hiddenReason(read,key,day=koreanDay()){if(read('localStorage',key)===day)return 'hidden-today';if(read('sessionStorage',key)==='closed')return 'closed-session';return '';}
export async function showNotice(){
 if(location.pathname!=='/'&&location.pathname!=='/index.html')return;
 const main=document.querySelector('main');if(!main||main.dataset.worknicNoticesInitialized==='true')return;main.dataset.worknicNoticesInitialized='true';
 const make=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
 const read=(store,key)=>{try{return window[store].getItem(key)}catch{return null}},write=(store,key,value)=>{try{window[store].setItem(key,value)}catch{}};
 let board=null,previous=null;const notices=[];
 const visible=()=>notices.filter(n=>n.card?.isConnected);
 function ensureBoard(){
  if(board?.isConnected)return board;
  board=make('dialog');board.className='notice-board';board.setAttribute('aria-label','워크닉 공지');
  const dismissFocused=()=>{const focused=document.activeElement?.closest('[data-notice-card]');const notice=visible().find(n=>n.card===focused)||visible()[0];if(notice)closeNotice(notice,true);};let escapeDown=false;
  board.addEventListener('keydown',event=>{if(event.key!=='Escape')return;event.preventDefault();event.stopPropagation();if(!escapeDown){escapeDown=true;dismissFocused();}});board.addEventListener('keyup',event=>{if(event.key==='Escape')escapeDown=false;});
  board.addEventListener('cancel',event=>{event.preventDefault();if(!escapeDown)dismissFocused();});
  const created=board;created.addEventListener('close',()=>{if(created.isConnected&&created.children.length){created.showModal();document.documentElement.classList.add('event-notice-open');return;}created.remove();if(board===created){board=null;document.documentElement.classList.remove('event-notice-open');if(previous?.isConnected&&typeof previous.focus==='function')previous.focus({preventScroll:true});}});
  document.body.append(board);return board;
 }
 function closeNotice(notice,session=false){
  if(session)write('sessionStorage',notice.key,'closed');const hadFocus=notice.card?.contains(document.activeElement);notice.card?.remove();notice.card=null;
  const remaining=visible();if(!remaining.length){if(board?.open)board.close();board?.remove();board=null;document.documentElement.classList.remove('event-notice-open');if(previous?.isConnected&&typeof previous.focus==='function')previous.focus({preventScroll:true});return;}board.dataset.count=String(remaining.length);if(hadFocus)remaining[0].close.focus();
 }
 async function openNotice(notice){
  if(notice.opening||notice.card?.isConnected||!notice.isActive())return;notice.opening=true;
  try{
   const card=make('section');card.className='notice-card '+(notice.kind==='event'?'event-notice':'business-notice');card.dataset.noticeCard=notice.config.id;card.dataset.kind=notice.kind;card.setAttribute('role','region');card.setAttribute('aria-label',notice.config.title);
   const head=make('div');head.className='event-notice-head';const close=make('button','닫기');close.type='button';close.setAttribute('aria-label',notice.kind==='event'?'행사 안내 닫기':'사업자회원 안내 닫기');head.append(close);
   const body=make('div');body.className='event-notice-body';
   if(notice.kind==='event'){
    const image=make('img');image.src=notice.config.image;image.alt=notice.config.alt||notice.config.title;image.width=2160;image.height=3800;body.append(image);
    if(Array.isArray(notice.config.text)){const details=make('details'),summary=make('summary','행사 안내 글로 보기');details.append(summary);for(const line of notice.config.text)details.append(make('p',line));body.append(details);}
    await image.decode();
   }else{
    const logo=make('img');logo.className='notice-business-logo';logo.src='/assets/logo.png';logo.alt='WORKNIC';logo.width=900;logo.height=313;
    const eyebrow=make('p','WORKNIC BUSINESS');eyebrow.className='notice-business-eyebrow';const title=make('h2');title.append(make('span','사업자회원'),make('span','가입 안내'));
    const list=make('ul');list.className='notice-business-benefits';for(const item of notice.config.items||[])list.append(make('li',item));const description=make('p',notice.config.description);description.className='notice-business-description';body.append(logo,eyebrow,title,list,description);
    const links=make('div');links.className='notice-business-links';const join=make('a','사업자회원 가입 신청');join.href=notice.config.joinPath;const portal=make('a','로그인·견적·픽업 안내');portal.href=notice.config.portalPath;links.append(join,portal);const note=make('p',notice.config.note);note.className='notice-business-note';body.append(links,note);
   }
   if(!notice.isActive())return;
   const foot=make('div');foot.className='event-notice-foot';const today=make('button','오늘 하루 보지 않기');today.type='button';foot.append(today);card.append(head,body,foot);close.onclick=()=>closeNotice(notice,true);today.onclick=()=>{write('localStorage',notice.key,koreanDay());closeNotice(notice);};
   const container=ensureBoard();notice.card=card;notice.close=close;container.append(card);container.dataset.count=String(visible().length);
   if(!container.open){previous=document.activeElement;document.documentElement.classList.add('event-notice-open');container.showModal();close.focus();}
  }catch{/* Keep the homepage usable if this notice cannot load. */}
  finally{notice.opening=false;}
 }
 async function load(path,kind,isActive){
  try{
   const response=await fetch(path,{credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)return;const config=await response.json();if(!isActive(config))return;
   const notice={config,kind,key:'worknic-notice-'+config.id,isActive:()=>isActive(config),card:null,opening:false};notices.push(notice);
   const hidden=hiddenReason(read,notice.key);
   if(kind==='event'){
    let timer;const expire=()=>{if(notice.isActive())return;clearTimeout(timer);closeNotice(notice);document.removeEventListener('visibilitychange',expire);};
    timer=setTimeout(expire,Math.min(2147483647,Math.max(0,Date.parse(config.expiresAt)-Date.now())));document.addEventListener('visibilitychange',expire);
   }
   if(!hidden)await openNotice(notice);
  }catch{/* Each notice remains independent if the other cannot load. */}
 }
 await Promise.allSettled([load('/notice/event.json','event',active),load('/notice/business.json','business',businessActive)]);
}
if(typeof document!=='undefined')showNotice();
