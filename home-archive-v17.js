/* Public WordPress feed only. No visitor information, cookies or credentials. */
(() => {
  'use strict';
  const endpoint = 'https://public-api.wordpress.com/wp/v2/sites/worknic.work/posts?per_page=6&_embed=wp:featuredmedia';
  const interval = 300000;
  function safeURL(value, image = false) {
    try {
      const u = new URL(value);
      if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return null;
      if (u.hostname === 'worknic.work') return u.href;
      if (image && /^i[012]\.wp\.com$/.test(u.hostname) && u.pathname.startsWith('/worknic.work/')) return u.href;
    } catch (_) { /* fail closed */ }
    return null;
  }
  function plain(value) {
    const doc = new DOMParser().parseFromString(String(value || ''), 'text/html');
    doc.querySelectorAll('script,style,template').forEach(n => n.remove());
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  }
  function imageCandidates(post) {
    const media = post._embedded?.['wp:featuredmedia']?.[0];
    const candidates = [];
    const add = (src, width = 0) => { const url = safeURL(src, true); if (url && !candidates.some(x => x.url === url)) candidates.push({url, width: Number(width) || 0}); };
    add(media?.source_url, media?.media_details?.width);
    add(post.jetpack_featured_media_url);
    const doc = new DOMParser().parseFromString(String(post.content?.rendered || ''), 'text/html');
    const first = doc.querySelector('img');
    if (first) add(first.getAttribute('src'), first.getAttribute('width'));
    return candidates;
  }
  function loadImage(candidate) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      let done = false;
      const finish = (ok) => { if (done) return; done = true; clearTimeout(timer); image.onload = image.onerror = null; ok ? resolve(image) : reject(Error('image unavailable')); };
      const timer = setTimeout(() => finish(false), 10000);
      image.referrerPolicy = 'no-referrer';
      image.onload = () => finish(image.naturalWidth >= 300 && image.naturalHeight > 0);
      image.onerror = () => finish(false);
      image.src = candidate.url;
    });
  }
  async function prepare(post) {
    const href = safeURL(post.link), title = plain(post.title?.rendered);
    if (!href || !title || title.length > 500) throw Error('invalid post');
    for (const candidate of imageCandidates(post)) {
      try {
        const image = await loadImage(candidate);
        return {href, title, src: candidate.url, width: image.naturalWidth, height: image.naturalHeight};
      } catch (_) { /* try first body image if featured image cannot load */ }
    }
    throw Error('no usable photo');
  }
  const section = document.querySelector('#latest');
  const strip = section?.querySelector('.archive-strip');
  if (!strip || strip.querySelectorAll('.archive-card').length !== 6) return;
  let pending = false;
  async function refresh() {
    if (pending || document.hidden) return;
    pending = true;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(endpoint, {credentials:'omit', referrerPolicy:'no-referrer', cache:'no-store', signal:controller.signal});
      if (!response.ok) throw Error('feed unavailable');
      const posts = await response.json();
      if (!Array.isArray(posts) || posts.length < 6) throw Error('incomplete feed');
      const prepared = await Promise.all(posts.slice(0, 6).map(prepare));
      if (new Set(prepared.map(x => x.href)).size !== 6) throw Error('duplicate posts');
      // Commit all six together only after all photographs load. Any failure preserves the existing strip.
      const fragment = document.createDocumentFragment();
      for (const item of prepared) {
        const card = document.createElement('article'); card.className = 'archive-card';
        const link = document.createElement('a'); link.href = item.href; link.title = item.title;
        const img = document.createElement('img'); img.src = item.src; img.alt = item.title;
        img.width = item.width; img.height = item.height; img.loading = 'lazy'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
        // Original source only: never inherit WP's 150px thumbnail srcset.
        const title = document.createElement('h3'); title.textContent = item.title;
        link.append(img, title); card.append(link); fragment.append(card);
      }
      strip.replaceChildren(fragment);
      section.dataset.live = 'true';
      section.dispatchEvent(new CustomEvent('worknic:archive-updated', {bubbles:true}));
    } catch (_) { section.dataset.live = 'false'; }
    finally { clearTimeout(timer); pending = false; }
  }
  refresh();
  setInterval(refresh, interval);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
})();
