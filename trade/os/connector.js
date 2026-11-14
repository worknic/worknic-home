(() => {
  "use strict";
  const expected = window.WORKNIC_TRADE_ORIGIN;
  if (!expected || !/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(expected)) return;
  document.querySelector("[data-trade-status]").textContent =
    "OS 관리자 로그인으로 거래 관리 화면을 엽니다.";
  let child = null;
  document.querySelector("[data-open-trade]")?.addEventListener("click", () => {
    const token = localStorage.getItem("worknic_session_token");
    if (!token) {
      document.querySelector("[data-trade-status]").textContent =
        "OS 홈에서 관리자 로그인 후 다시 열어 주세요.";
      return;
    }
    child = window.open(
      expected + "/trade/admin#os-connect",
      "worknic-trade-manager",
    );
  });
  window.addEventListener("message", (e) => {
    if (
      e.origin !== expected ||
      e.source !== child ||
      e.data?.type !== "WORKNIC_TRADE_READY"
    )
      return;
    const token = localStorage.getItem("worknic_session_token");
    if (token)
      child.postMessage({ type: "WORKNIC_OS_SESSION", token }, expected);
  });
  window.addEventListener("storage", (e) => {
    if (
      e.key === "worknic_session_token" &&
      e.oldValue !== e.newValue &&
      child &&
      !child.closed
    )
      child.postMessage({ type: "WORKNIC_OS_LOGOUT" }, expected);
  });
})();
