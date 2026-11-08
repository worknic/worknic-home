import { createHmac, randomUUID } from "node:crypto";
import { TradeError } from "./store.mjs";
export const OS_ENDPOINT =
  "https://script.google.com/macros/s/AKfycbzMH4qy5GOqUsmyNTPOfyk1W2giY1A_ZjUpFsMD3rLAOs4dP4uVDya7bywaIlQOVi8F9g/exec";
export function createOSAdapter({
  endpoint = OS_ENDPOINT,
  sharedSecret = "",
  fetcher = fetch,
} = {}) {
  if (
    !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(
      endpoint,
    )
  )
    throw Error("Invalid OS endpoint");
  async function call(action, payload = {}, token = "") {
    let r;
    try {
      r = await fetcher(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ action, payload, token }),
        redirect: "follow",
        signal: AbortSignal.timeout(25000),
      });
    } catch {
      throw new TradeError(
        "OS 연결을 확인할 수 없습니다. 다시 시도해 주세요.",
        503,
      );
    }
    let j;
    try {
      j = await r.json();
    } catch {
      throw new TradeError("OS 연결 응답을 확인해 주세요.", 503);
    }
    if (!r.ok || j.ok !== true)
      throw new TradeError(
        j.error || "OS 권한 또는 연결을 확인해 주세요.",
        j.code === "UNAUTHORIZED" ? 401 : 503,
      );
    return j.data;
  }
  return {
    configured: () => sharedSecret.length >= 32,
    publicCatalog: () => call("catalog.get"),
    async authorize(token) {
      if (typeof token !== "string" || token.length > 512 || !token)
        throw new TradeError("OS 관리자 로그인이 필요합니다.", 401);
      const actor = await call("catalog.authorize", {}, token);
      if (actor?.role !== "admin" || !actor.actor)
        throw new TradeError("OS 관리자 권한이 필요합니다.", 403);
      return actor;
    },
    async find(token, profile) {
      const d = await call(
          "business.list",
          { query: profile.businessNumber, page: 1 },
          token,
        ),
        matches = d.rows.filter(
          (x) =>
            String(x.businessNumber).replace(/[^0-9]/g, "") ===
              profile.businessNumber &&
            String(x.email).toLowerCase() === profile.email.toLowerCase(),
        );
      if (matches.length !== 1)
        throw new TradeError(
          "OS의 사업자번호·담당자 이메일을 대조해 주세요.",
          409,
        );
      const row = matches[0];
      return {
        id: row.id,
        status: row.status,
        businessNumber: String(row.businessNumber).replace(/[^0-9]/g, ""),
        email: String(row.email).toLowerCase(),
        revision: Number(row.revision),
      };
    },
    async status(profile, requestId) {
      if (sharedSecret.length < 32)
        throw new TradeError("OS 승인 연동을 준비하고 있습니다.", 503);
      const payload = {
          requestId,
          businessNumber: profile.businessNumber,
          email: profile.email,
        },
        timestamp = Date.now(),
        nonce = randomUUID(),
        message = JSON.stringify({ timestamp, nonce, payload }),
        signature = createHmac("sha256", sharedSecret)
          .update(message)
          .digest("hex");
      return call("trade.bridge.status", {
        timestamp,
        nonce,
        payload,
        signature,
      });
    },
    async apply(profile) {
      const challenge = await call("business.challenge");
      const fields = Object.fromEntries(
        ["companyName", "businessNumber", "contactName", "phone", "email"].map(
          (k) => [k, String(profile[k] || "")],
        ),
      );
      return call("business.apply", {
        ...fields,
        consent: true,
        consentVersion: "business-2026-11-07",
        website: "",
        challenge: challenge.token,
      });
    },
    review: (token, input) => call("business.review", input, token),
  };
}
