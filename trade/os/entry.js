(() => {
  "use strict";
  const a = document.querySelector("#tradeManagerNav");
  if (!a) return;
  function refresh() {
    a.hidden = !(
      document.body.classList.contains("is-authenticated") &&
      typeof currentRole !== "undefined" &&
      currentRole === "admin"
    );
  }
  new MutationObserver(refresh).observe(document.body, {
    attributes: true,
    attributeFilter: ["class"],
  });
  a.addEventListener("click", (e) => {
    refresh();
    if (a.hidden) e.preventDefault();
  });
  refresh();
})();
