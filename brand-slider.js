(()=>{'use strict';
const root=document.querySelector('[data-brand-slider]');if(!root)return;
const head=root.closest('.brand-directory-section')?.querySelector('.brand-directory-head');if(!head)return;
const button=document.createElement('button');button.type='button';button.className='brand-slider-toggle';button.setAttribute('aria-controls',root.id||'home-brand-slider');root.id=root.id||'home-brand-slider';head.append(button);
root.tabIndex=0;root.setAttribute('role','region');root.setAttribute('aria-label','함께하는 브랜드 · 좌우로 넘겨보기');
const motion=matchMedia('(prefers-reduced-motion: reduce)');let userPaused=motion.matches,hover=false,focused=false,drag=null,visible=true,frame=0,last=0,autoLeft=0,cycle=0,resumeTimer=0,interacting=false,track=null,main=null,suppressClick=false;
const gap=()=>parseFloat(getComputedStyle(track).columnGap)||0;
function measure(){if(!main)return;const old=cycle,offset=old?(root.scrollLeft-old)%old:0;cycle=main.getBoundingClientRect().width+gap();if(cycle>0)root.scrollLeft=cycle+(old?offset/old*cycle:0);sync();}
function normalize(){if(!cycle)return;if(root.scrollLeft>=cycle*2)root.scrollLeft-=cycle;else if(root.scrollLeft<cycle)root.scrollLeft+=cycle;}
function tick(now){frame=0;if(!canMove())return;if(last)autoLeft+=Math.min(now-last,50)*.018;else autoLeft=root.scrollLeft;if(autoLeft>=cycle*2)autoLeft-=cycle;else if(autoLeft<cycle)autoLeft+=cycle;root.scrollLeft=autoLeft;last=now;frame=requestAnimationFrame(tick);}
function canMove(){return !!(cycle&&root.scrollWidth>root.clientWidth&&!userPaused&&!hover&&!focused&&!drag&&!interacting&&visible&&!document.hidden);}
function sync(){button.textContent=userPaused?'자동 이동':'이동 멈추기';button.setAttribute('aria-label',userPaused?'브랜드 자동 이동 재생':'브랜드 자동 이동 멈추기');button.setAttribute('aria-pressed',String(!userPaused));if(canMove()){if(!frame){last=0;frame=requestAnimationFrame(tick)}}else{cancelAnimationFrame(frame);frame=0;last=0;}}
function rest(){interacting=true;clearTimeout(resumeTimer);sync();resumeTimer=setTimeout(()=>{interacting=false;normalize();sync()},3500);}
button.addEventListener('click',()=>{userPaused=!userPaused;sync()});
root.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse'){hover=true;sync()}});
root.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'){hover=false;sync()}});
root.addEventListener('focusin',()=>{focused=true;sync()});root.addEventListener('focusout',()=>{queueMicrotask(()=>{focused=root.contains(document.activeElement);sync()})});
root.addEventListener('wheel',rest,{passive:true});
root.addEventListener('keydown',e=>{if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;e.preventDefault();rest();root.scrollBy({left:(e.key==='ArrowRight'?1:-1)*(main?.firstElementChild?.getBoundingClientRect().width||156),behavior:motion.matches?'instant':'smooth'})});
root.addEventListener('pointerdown',e=>{if(e.button!==0)return;rest();drag={id:e.pointerId,x:e.clientX,y:e.clientY,scroll:root.scrollLeft,moved:false,type:e.pointerType};});
root.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId||drag.type!=='mouse')return;const dx=e.clientX-drag.x;if(Math.abs(dx)>6&&!drag.moved){drag.moved=true;root.setPointerCapture(e.pointerId)}if(drag.moved){e.preventDefault();root.scrollLeft=drag.scroll-dx;}});
function end(e){if(!drag||drag.id!==e.pointerId)return;suppressClick=drag.moved;drag=null;rest();if(suppressClick)setTimeout(()=>{suppressClick=false},0);}
root.addEventListener('pointerup',end);root.addEventListener('pointercancel',end);root.addEventListener('lostpointercapture',end);window.addEventListener('pointerup',end);
root.addEventListener('click',e=>{if(suppressClick){e.preventDefault();e.stopPropagation()}},true);root.addEventListener('dragstart',e=>e.preventDefault());
document.addEventListener('visibilitychange',sync);motion.addEventListener('change',e=>{userPaused=e.matches;sync()});
if(typeof IntersectionObserver==='function')new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync()},{threshold:0}).observe(root);
if(typeof ResizeObserver==='function')new ResizeObserver(measure).observe(root);else window.addEventListener('resize',measure);
function build(){const cards=[...root.children].filter(x=>x.matches('.brand-tile'));if(!cards.length)return;cancelAnimationFrame(frame);frame=0;cycle=0;track=document.createElement('div');track.className='brand-slider-track';main=document.createElement('div');main.className='brand-slider-set';main.append(...cards);while(main.children.length%3){const all=document.createElement('a');all.href='/brands/';all.className='brand-tile brand-slider-all';all.textContent='브랜드 전체 보기';main.append(all)}const copy=()=>{const set=main.cloneNode(true);set.setAttribute('aria-hidden','true');for(const link of set.querySelectorAll('a')){link.tabIndex=-1;link.removeAttribute('id')}for(const img of set.querySelectorAll('img'))img.loading='eager';return set};track.append(copy(),main,copy());root.replaceChildren(track);focused=root.contains(document.activeElement);drag=null;requestAnimationFrame(measure);}
new MutationObserver(build).observe(root,{childList:true});build();
})();
