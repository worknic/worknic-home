// 공개된 글만 읽습니다. 이메일·로그인 정보는 이 페이지에서 수집하지 않습니다.
for(const section of document.querySelectorAll('[data-journal]')){
 let pending=false,lastSignature='';
 const limit=Number(section.dataset.limit)||4;
 const status=section.querySelector('[data-journal-status]');
 const plain=html=>new DOMParser().parseFromString(String(html||''),'text/html').body.textContent.replace(/\s+/g,' ').trim();
 function record(post){
  let url;try{url=new URL(post.link)}catch{return null}
  if(url.protocol!=='https:'||url.hostname!=='worknic.work')return null;
  const date=new Date(post.date_gmt+'Z');if(!Number.isFinite(date.getTime()))return null;
  const title=plain(post.title?.rendered);if(!title)return null;
  const article=document.createElement('article');article.className='journal-record';
  const time=document.createElement('time');time.dateTime=date.toISOString();time.textContent=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
  const h3=document.createElement('h3');const link=document.createElement('a');link.href=url.href;link.textContent=title;h3.append(link);
  const excerpt=document.createElement('p');excerpt.textContent=plain(post.excerpt?.rendered).slice(0,180);
  const more=document.createElement('a');more.className='text-link';more.href=url.href;more.textContent='더보기';more.setAttribute('aria-label',title+' 더보기');
  article.append(time,h3,excerpt,more);return article;
 }
 async function refresh(){
  if(pending||document.hidden)return;pending=true;
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
  try{
   const response=await fetch(section.dataset.postsUrl,{signal:controller.signal,credentials:'omit',cache:'no-store'});
   if(!response.ok)throw new Error('feed');const posts=await response.json();if(!Array.isArray(posts))throw new Error('format');
   const articles=posts.map(record).filter(Boolean).slice(0,limit);if(!articles.length)throw new Error('empty');
   const signature=articles.map(article=>article.outerHTML).join('');
   if(signature!==lastSignature){section.querySelector('[data-journal-records]').replaceChildren(...articles);lastSignature=signature;}
   section.dataset.live='true';section.dataset.updatedAt=new Date().toISOString();status.textContent='';
  }catch{section.dataset.live='false';status.textContent='새 글을 불러오지 못해 마지막으로 확인한 기록을 보여드립니다. 기록 전체 보기에서 최신 글을 확인해 주세요.';}
  finally{clearTimeout(timeout);pending=false;}
 }
 refresh();setInterval(refresh,Number(section.dataset.refreshMs)||60000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh()});
}
