/* WORKNIC official channel shortcuts. No tracking, cookies or external icon requests. */
(() => {
  if (document.querySelector('[data-worknic-channels]')) return;
  const svg = (body, fill = 'none') => `<svg viewBox="0 0 24 24" fill="${fill}" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
  const channels = [
    {name:'인스타그램', href:'https://www.instagram.com/worknic.korea/', icon:svg('<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.8" r=".8" fill="currentColor" stroke="none"/>')},
    {name:'온라인 스토어', href:'https://smartstore.naver.com/worknic_korea/', icon:svg('<path d="M5 8h14l1 13H4L5 8Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>')},
    {name:'도구기록실', href:'https://worknic.work/', icon:svg('<path d="M12 5.5C9 3.8 5.8 3.8 3 5v15c2.8-1.2 6-1.2 9 .5 3-1.7 6.2-1.7 9-.5V5c-2.8-1.2-6-1.2-9 .5Z"/><path d="M12 5.5v15M6 8.5l3 .5M6 12l3 .5M15 9l3-.5M15 12.5l3-.5"/>')},
    {name:'네이버 톡톡', href:'https://talk.naver.com/profile/w4qyth', icon:svg('<path d="M20.5 11c0 4.1-3.8 7.5-8.5 7.5-1.1 0-2.2-.2-3.2-.5L4 20l1.2-4.1A7.1 7.1 0 0 1 3.5 11c0-4.1 3.8-7.5 8.5-7.5s8.5 3.4 8.5 7.5Z"/><circle cx="8" cy="11" r=".8" fill="currentColor" stroke="none"/><circle cx="12" cy="11" r=".8" fill="currentColor" stroke="none"/><circle cx="16" cy="11" r=".8" fill="currentColor" stroke="none"/>')}
  ];
  const available = channels.filter(channel => channel.href);
  const style = document.createElement('style');
  style.textContent = `
    .worknic-channels{position:fixed;right:max(20px,env(safe-area-inset-right));bottom:calc(24px + env(safe-area-inset-bottom));z-index:40;display:flex;flex-direction:column;gap:9px;margin:0;padding:0;isolation:isolate}
    .worknic-channel{position:relative;display:flex;align-items:center;justify-content:center;width:48px;height:48px;min-height:48px;box-sizing:border-box;padding:0;border:1px solid #dedede;border-radius:50%;background:#f8f8f8;color:#262626;box-shadow:0 2px 7px rgb(0 0 0 / 10%);text-decoration:none;transition:background-color .18s,color .18s,box-shadow .18s}
    .worknic-channel svg{display:block;width:23px;height:23px;margin:0;flex:none}
    .worknic-channel:hover,.worknic-channel:focus-visible{background:#292929;color:#fff;box-shadow:0 3px 12px rgb(0 0 0 / 16%)}
    .worknic-channel:focus-visible{outline:2px solid #fff;outline-offset:3px}
    .worknic-channel-label{position:absolute;right:calc(100% + 10px);top:50%;transform:translateY(-50%);padding:7px 10px;border-radius:5px;background:#292929;color:#fff;font-family:inherit;font-size:12px;font-weight:500;line-height:1.5;white-space:nowrap;opacity:0;visibility:hidden;pointer-events:none;transition:opacity .18s}
    .worknic-channel:hover .worknic-channel-label,.worknic-channel:focus-visible .worknic-channel-label{opacity:1;visibility:visible}
    @media(max-width:600px){.worknic-channels{right:max(12px,env(safe-area-inset-right));bottom:calc(20px + env(safe-area-inset-bottom));gap:7px}.worknic-channel{width:44px;height:44px;min-height:44px}.worknic-channel svg{width:21px;height:21px}}
    @media(prefers-reduced-motion:reduce){.worknic-channel,.worknic-channel-label{transition:none}}
    @media print{.worknic-channels{display:none}}
  `;
  document.head.append(style);
  const nav = document.createElement('nav');
  nav.className = 'worknic-channels';
  nav.dataset.worknicChannels = '';
  nav.setAttribute('aria-label','워크닉 공식 채널 바로가기');
  for(const channel of available){
    const link = document.createElement('a');
    link.className = 'worknic-channel';
    link.href = channel.href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label',`${channel.name} (새 창)`);
    link.innerHTML = channel.icon;
    const label = document.createElement('span');
    label.className = 'worknic-channel-label';
    label.textContent = channel.name;
    link.append(label);
    nav.append(link);
  }
  document.body.append(nav);
})();
