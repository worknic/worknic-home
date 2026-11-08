(() => {
  "use strict";
  if ("serviceWorker" in navigator)
    navigator.serviceWorker
      .register("/trade/sw.js", { scope: "/trade/" })
      .catch(() => {});
  let install = null;
  const b = document.querySelector("#install-app");
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    install = e;
    if (b) b.hidden = false;
  });
  b?.addEventListener("click", async () => {
    if (!install) return;
    await install.prompt();
    install = null;
    b.hidden = true;
  });
  if (
    /iPhone|iPad/.test(navigator.userAgent) &&
    !matchMedia("(display-mode: standalone)").matches
  ) {
    const n = document.querySelector("#install-note");
    if (n)
      n.textContent =
        "iPhone에서는 Safari의 공유 메뉴에서 홈 화면에 추가를 선택해 앱처럼 이용할 수 있습니다.";
  }
})();
