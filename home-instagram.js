/* Public Instagram feed only. No credentials are delivered to the browser. */
(() => {
  'use strict';
  const endpoint='https://script.google.com/macros/s/AKfycbz7RunHEhYTPJtkpgAVQrfFZIm9HxNzICGffBD_-dciNPA0nTaLX4CJ2ZzqJ-iERuZZ/exec';
  const names={'worknic.korea':'공식 계정','worknic.archive':'도구기록실 계정'};
  const validUrl=(s,media=false)=>{
    try { const u=new URL(s); if(u.protocol!=='https:'||u.username||u.password)return null;
      return (media ? /\.(cdninstagram\.com|fbcdn\.net)$/.test(u.hostname) : /^(www\.)?instagram\.com$/.test(u.hostname)) ? u.href : null;
    }catch{return null;}
  };
  const date=s=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(s));
  const time=s=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(s));
  let busy=false;
  async function render(account,p) {
    const card=document.querySelector('[data-instagram-account="'+account+'"]');
    if(!card||!p||p.account!==account||!/^\d+$/.test(p.id))return;
    const href=validUrl(p.permalink),src=validUrl(p.image,true);
    if(!href||!src||!Number.isFinite(Date.parse(p.publishedAt))||!Number.isFinite(Date.parse(p.checkedAt)))return;
    const checked=Date.parse(p.checkedAt),fresh=Date.now()-checked<3*3600000;
    const caption=String(p.caption||'').replace(/#[^\s#]+/g,'').trim();
    const paragraphs=caption.split(/\n\s*\n/).map(s=>s.replace(/\s+/g,' ').trim()).filter(Boolean);
    const title=(paragraphs.shift()||names[account]+'의 새로운 이야기').slice(0,64);
    const summary=(paragraphs.join(' ')||caption.replace(/\s+/g,' ')).slice(0,180);
    await new Promise((resolve,reject)=>{const img=new Image(); const timer=setTimeout(()=>reject(new Error('image timeout')),10000);img.onload=()=>{clearTimeout(timer);resolve();};img.onerror=()=>{clearTimeout(timer);reject(new Error('image unavailable'));};img.src=src;});
    const image=card.querySelector('.social-photo img');
    image.src=src;image.alt=title;image.referrerPolicy='no-referrer';
    card.querySelector('.social-photo').href=href;
    card.querySelector('h3').textContent=title;
    card.querySelector('p').textContent=summary;
    card.querySelector('.post-meta').textContent=names[account]+' · '+date(p.publishedAt)+' 게시물';
    card.querySelector('.data-note').textContent=(fresh?'1시간마다 게시물을 확인합니다.':'최근 확인한 게시물입니다.')+' 마지막 확인 '+time(p.checkedAt)+' (한국 시간)';
    card.dataset.instagramPost=p.id;
  }
  async function update() {
    if(busy||document.hidden)return;busy=true;
    const ctl=new AbortController(),timer=setTimeout(()=>ctl.abort(),15000);
    try {
      const response=await fetch(endpoint,{mode:'cors',credentials:'omit',signal:ctl.signal});
      if(!response.ok)return;
      const data=await response.json();if(data.schema!==1||!data.feeds)return;
      await Promise.allSettled(Object.keys(names).map(a=>render(a,data.feeds[a])));
    }catch{/* Keep the verified static cards or last successfully rendered feed. */}
    finally{clearTimeout(timer);busy=false;}
  }
  update();setInterval(update,3600000);
})();
