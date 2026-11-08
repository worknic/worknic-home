import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { openStore } from "./store.mjs";
import { createTradeServer } from "./http.mjs";
import { createOSAdapter } from "./os-adapter.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const port = Number(process.env.PORT || 8080);
const production = process.env.NODE_ENV === "production";
const origin =
  process.env.TRADE_ORIGIN ||
  process.env.RENDER_EXTERNAL_URL ||
  `http://localhost:${port}`;
if (
  production &&
  (!process.env.TRADE_DATA_DIR ||
    !origin.startsWith("https://") ||
    !/^[A-Z2-7]{32,}$/i.test(process.env.TRADE_ADMIN_TOTP_SECRET || "") ||
    !/^\w{32,}$/.test(process.env.TRADE_OS_BRIDGE_SECRET || "") ||
    !/^[a-f0-9]{64}$/i.test(process.env.TRADE_PICKUP_KEY || ""))
) {
  throw Error(
    "Production requires persistent data, HTTPS, administrator OTP, OS approval bridge secret and a 32-byte pickup encryption key.",
  );
}
const store = openStore(
  resolve(
    process.env.TRADE_DATA_DIR ||
      fileURLToPath(new URL("../.runtime/", import.meta.url)),
    "trade.sqlite",
  ),
  {
    catalogPath: resolve(root, "data/catalog.json"),
    betaOptions: { pickupKey: process.env.TRADE_PICKUP_KEY || "" },
  },
);
const server = createTradeServer({
  store,
  root,
  origin,
  secure: production,
  adminTotpSecret: process.env.TRADE_ADMIN_TOTP_SECRET || "",
  trustProxy: process.env.TRADE_TRUST_PROXY === "1",
  betaMode: true,
  os: createOSAdapter({
    sharedSecret: process.env.TRADE_OS_BRIDGE_SECRET || "",
  }),
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
const timer = setInterval(() => {
  try {
    store.expireOrders();
  } catch {
    console.error("Order expiry failed.");
  }
}, 60_000);
timer.unref();
server.listen(port, process.env.HOST || "127.0.0.1", () =>
  console.log(`WORKNIC trade ready on ${origin}/trade/`),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    clearInterval(timer);
    server.close(() => {
      store.close();
      process.exit(0);
    });
  });
