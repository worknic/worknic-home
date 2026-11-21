import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { openStore } from './store.mjs';
import { createTradeServer } from './http.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const port = Number(process.env.PORT || 8080);
const production = process.env.NODE_ENV === 'production';
const origin = process.env.TRADE_ORIGIN || `http://localhost:${port}`;
if (production && (!process.env.TRADE_DATA_DIR || !process.env.TRADE_ORIGIN?.startsWith('https://') || !/^[A-Z2-7]{32,}$/i.test(process.env.TRADE_ADMIN_TOTP_SECRET || ''))) {
  throw Error('Production requires persistent TRADE_DATA_DIR, HTTPS TRADE_ORIGIN, and a base32 TRADE_ADMIN_TOTP_SECRET (at least 32 characters).');
}
const store = openStore(resolve(process.env.TRADE_DATA_DIR || new URL('../.runtime/', import.meta.url).pathname, 'trade.sqlite'), { catalogPath: resolve(root, 'data/catalog.json') });
const server = createTradeServer({ store, root, origin, secure: production,
  adminTotpSecret: process.env.TRADE_ADMIN_TOTP_SECRET || '', trustProxy: process.env.TRADE_TRUST_PROXY === '1' });
server.requestTimeout = 15000; server.headersTimeout = 10000;
const timer = setInterval(() => { try { store.expireOrders(); } catch { console.error('Order expiry failed.'); } }, 60_000);
timer.unref();
server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`WORKNIC trade ready on ${origin}/trade/`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  clearInterval(timer); server.close(() => { store.close(); process.exit(0); });
});
