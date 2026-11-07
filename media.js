(()=>{'use strict';
const active=new WeakMap();
function valid(t){const f=t?.framing,W=Number(t?.width),H=Number(t?.height);return !!(f&&[W,H,f.left,f.top,f.width,f.height].every(Number.isFinite)&&W>0&&H>0&&W<=20000&&H<=20000&&f.left>=0&&f.top>=0&&f.width>0&&f.height>0&&f.left+f.width<=W&&f.top+f.height<=H);}
function geometry(t,width,height,padding=0){if(!valid(t)||!Number.isFinite(width)||!Number.isFinite(height)||width<=2*padding||height<=2*padding)return null;const f=t.framing,scale=Math.min((width-2*padding)/f.width,(height-2*padding)/f.height,1);return{width:t.width*scale,height:t.height*scale,left:(width-f.width*scale)/2-f.left*scale,top:(height-f.height*scale)/2-f.top*scale,scale};}
function clear(img){const old=active.get(img);if(!old)return;old.observer?.disconnect();img.removeEventListener('load',old.update);img.style.cssText=old.style;old.frame.removeAttribute('data-original-framing');active.delete(img);}
function frame(img,t){clear(img);if(!valid(t)||!img?.parentElement)return false;const parent=img.parentElement,style=img.style.cssText;
 const update=()=>{if(!parent.isConnected){state.observer?.disconnect();return}const s=getComputedStyle(parent),padding=Math.max(parseFloat(s.paddingLeft)||0,parseFloat(s.paddingRight)||0,parseFloat(s.paddingTop)||0,parseFloat(s.paddingBottom)||0),g=geometry(t,parent.clientWidth,parent.clientHeight,padding);if(!g)return;parent.setAttribute('data-original-framing','true');Object.assign(img.style,{position:'absolute',width:g.width+'px',height:g.height+'px',left:g.left+'px',top:g.top+'px',maxWidth:'none',maxHeight:'none',padding:'0',aspectRatio:'auto',objectFit:'contain'});};
 const state={style,frame:parent,update,observer:null};if(typeof ResizeObserver==='function'){state.observer=new ResizeObserver(update);state.observer.observe(parent)}img.addEventListener('load',update);active.set(img,state);queueMicrotask(update);return true;}
window.WORKNIC_MEDIA={valid,geometry,frame,clear};
})();
