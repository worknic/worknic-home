(() => {
  'use strict';
  const header = document.querySelector('.wn-launch-header');
  if (!header) return;
  const link = header.querySelector('.wn-find');
  const search = document.getElementById('home-tool-search');
  const hiddenTrigger = header.querySelector('.home-tools > button');
  // Reuse existing live search behavior, preserving the assortment query and existing modal design.
  if (link && search && hiddenTrigger && typeof search.showModal === 'function') {
    link.setAttribute('aria-controls', search.id);
    link.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      hiddenTrigger.click();
    });
    search.addEventListener('close', () => link.focus());
  }
  const languages = header.querySelector('.preview-language');
  const menu = header.querySelector('.home-menu nav');
  const positionLanguage = () => {
    if (languages && menu && languages.parentElement !== menu) menu.append(languages);
  };
  positionLanguage();
  const media = matchMedia('(max-width:800px)');
  media.addEventListener('change', positionLanguage);
})();
