import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { openStore } from "./store.mjs";
import { createTradeServer } from "./http.mjs";
import { createOSAdapter } from "./os-adapter.mjs";
import { createBackupService, s3Transport } from "./backup-service.mjs";

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
let backupTransport = null;
try {
  backupTransport = s3Transport(process.env);
} catch {
  console.error(
    "외부 백업 설정을 확인해 주세요. 외부 전송은 시작하지 않았습니다.",
  );
}
const backups = createBackupService({
  dataDir:
    process.env.TRADE_DATA_DIR ||
    fileURLToPath(new URL("../.runtime/", import.meta.url)),
  masterKey: process.env.TRADE_PICKUP_KEY || "",
  transport: backupTransport,
});
const stopBackups = backups.start();
const server = createTradeServer({
  store,
  backups,
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
    stopBackups();
    clearInterval(timer);
    server.close(() => {
      store.close();
      process.exit(0);
    });
  });
