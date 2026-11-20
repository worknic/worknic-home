(() => {
  'use strict';
  const root=document.querySelector('.wn-stage-carousel');
  if(!root)return;
  const frames=[...root.querySelectorAll('.wn-stage-frame')],dots=[...root.querySelectorAll('.wn-stage-dot')];
  const controls=root.querySelector('.wn-stage-controls'),toggle=root.querySelector('.wn-stage-pause'),caption=root.querySelector('.wn-stage-kicker');
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  let active=0, userPaused=false, keyboardMode=false, focusHold=false, timer=0;
  const delay=6200;
  const ready=i=>[...frames[i].querySelectorAll('img')].filter(img=>img.getClientRects().length).every(img=>img.complete&&img.naturalWidth>0);
  function updateCaption(text){
    caption.getAnimations().forEach(a=>a.cancel());
    caption.hidden=!text;
    caption.textContent=text;
    if(text&&!motion.matches)caption.animate([{opacity:0,transform:'translateY(13px)'},{opacity:1,transform:'translateY(0)'}],{duration:900,delay:220,easing:'ease-out',fill:'both'});
  }
  function show(index){
    const next=(index+frames.length)%frames.length;
    if(next===active||!ready(next))return;
    active=next;
    frames.forEach((s,i)=>{s.classList.toggle('is-current',i===active);s.setAttribute('aria-hidden',String(i!==active));});
    dots.forEach((d,i)=>d.setAttribute('aria-pressed',String(i===active)));
    updateCaption(frames[active].dataset.caption||'');
  }
  function refresh(){
    clearTimeout(timer);
    if(!userPaused&&!focusHold&&!document.hidden&&!motion.matches)timer=setTimeout(()=>{show(active+1);refresh();},delay);
    toggle.disabled=motion.matches;
    toggle.setAttribute('aria-label',motion.matches?'자동 전환 꺼짐, 모션 감소 설정 적용':userPaused?'자동 전환 재생':'자동 전환 멈춤');
    toggle.firstElementChild.textContent=userPaused||motion.matches?'▶':'Ⅱ';
  }
  // Pointer hover no longer blocks autoplay. A manual dot restarts the normal countdown.
  root.addEventListener('pointerdown',()=>{keyboardMode=false;focusHold=false;refresh();});
  document.addEventListener('keydown',()=>{keyboardMode=true;},true);
  controls.addEventListener('focusin',e=>{focusHold=keyboardMode&&e.target.matches(':focus-visible');refresh();});
  controls.addEventListener('focusout',e=>{if(!controls.contains(e.relatedTarget)){focusHold=false;refresh();}});
  controls.addEventListener('keydown',e=>{
    const delta=e.key==='ArrowRight'?1:e.key==='ArrowLeft'?-1:0;
    if(!delta)return;
    e.preventDefault();show(active+delta);focusHold=true;refresh();dots[active].focus();
  });
  dots.forEach((d,i)=>d.addEventListener('click',()=>{show(i);refresh();}));
  toggle.addEventListener('click',()=>{userPaused=!userPaused;if(!userPaused)focusHold=false;refresh();});
  document.addEventListener('visibilitychange',refresh);
  motion.addEventListener('change',()=>{if(motion.matches)caption.getAnimations().forEach(a=>a.cancel());refresh();});
  controls.hidden=false;
  root.classList.add('is-enhanced');
  updateCaption(frames[0].dataset.caption||'');
  refresh();
})();
