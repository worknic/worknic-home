
(() => {
  'use strict';
  const root = document.querySelector('.wn-stage-carousel');
  if (!root) return;
  const slides = [...root.querySelectorAll('.wn-stage-image')];
  const dots = [...root.querySelectorAll('.wn-stage-dot')];
  const controls = root.querySelector('.wn-stage-controls');
  const toggle = root.querySelector('.wn-stage-pause');
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  let active = 0, timer, playing = !media.matches, hovering = false;
  const stopTimer = () => { clearInterval(timer); timer = undefined; };
  const show = index => {
    const next = (index + slides.length) % slides.length;
    // Keep the current photograph up if the next visible image is still loading or unavailable.
    const visible = [...slides[next].querySelectorAll('img')].filter(img => img.getClientRects().length);
    if (visible.some(img => !img.complete || img.naturalWidth === 0)) return false;
    active = next;
    slides.forEach((s,i) => { s.classList.toggle('is-current',i===active); s.setAttribute('aria-hidden',String(i!==active)); });
    dots.forEach((d,i) => d.setAttribute('aria-pressed',String(i===active)));
  };
  const refresh = () => {
    stopTimer();
    if (playing && !hovering && !document.hidden && !media.matches)
      timer = setInterval(() => show(active + 1), 6200);
    toggle.disabled = media.matches;
    toggle.setAttribute('aria-label', media.matches ? '자동 전환 꺼짐, 모션 감소 설정 적용' : playing ? '자동 전환 멈춤' : '자동 전환 재생');
    toggle.firstElementChild.textContent = playing && !media.matches ? 'Ⅱ' : '▶';
  };
  dots.forEach((d,i) => d.addEventListener('click', () => { playing=false; show(i); refresh(); }));
  root.addEventListener('keydown', e => {
    const delta = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!delta || !controls.contains(e.target)) return;
    e.preventDefault(); playing=false; show(active+delta); refresh(); dots[active].focus();
  });
  root.addEventListener('focusin', e => {
    if (e.target.matches(':focus-visible') && playing) { playing=false; refresh(); }
  });
  root.addEventListener('pointerenter', e => { if (e.pointerType==='mouse') { hovering=true; refresh(); } });
  root.addEventListener('pointerleave', e => { if (e.pointerType==='mouse') { hovering=false; refresh(); } });
  toggle.addEventListener('click', () => { playing=!playing; refresh(); });
  document.addEventListener('visibilitychange',refresh);
  media.addEventListener('change', () => { if(media.matches) playing=false; refresh(); });
  controls.hidden=false;
  root.classList.add('is-enhanced');
  refresh();
})();
