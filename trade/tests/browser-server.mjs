// Local end-to-end fixtures only. Never run this file in production.
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { openStore } from '../server/store.mjs';
import { createTradeServer } from '../server/http.mjs';
const dir = mkdtempSync(resolve(tmpdir(), 'worknic-browser-test-'));
const catalogPath = resolve(dir, 'catalog.json');
writeFileSync(catalogPath, JSON.stringify({ brands: [{ id: 'qa', name: '검증용 브랜드' }], products: [
  { id: 'qa-tool', name: '검증용 상품 · 실제 판매 상품 아님', brand: 'qa', model: 'QA-001', published: true, images: ['/assets/logo.png'], summary: '개발 검증 전용입니다.' },
  { id: 'qa-heavy', name: '검증용 별도 배송 상품', brand: 'qa', model: 'QA-002', published: true, images: [] }
] }));
const store = openStore(resolve(dir, 'db.sqlite'), { catalogPath });
store.createAdmin('qa_staff', 'local test passphrase');
const admin = store.login('qa_staff', 'local test passphrase');
for (const p of store.products(admin)) store.updateProduct(admin, p.id, { price: 50000, stock: 30, enabled: true, specialShipping: p.id === 'qa-heavy', revision: p.revision });
store.updateSettings(admin, { ...store.settings(), ordersEnabled: true });
const server = createTradeServer({ store, root: new URL('../../', import.meta.url).pathname, origin: 'http://localhost:8085', secure: false });
server.listen(8085, '0.0.0.0', () => console.log('Local browser fixture: http://localhost:8085/trade/'));
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => server.close(() => { store.close(); rmSync(dir, { recursive: true, force: true }); process.exit(0); }));
