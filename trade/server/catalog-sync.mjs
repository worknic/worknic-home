import { TradeError } from './store.mjs';
// Existing official catalog API, public catalog.get operation only.
const ENDPOINT = 'https://script.google.com/macros/s/AKfycbzMH4qy5GOqUsmyNTPOfyk1W2giY1A_ZjUpFsMD3rLAOs4dP4uVDya7bywaIlQOVi8F9g/exec';
export async function syncCatalog(store, actor, fetcher = fetch) {
  let result;
  try {
    const response = await fetcher(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'catalog.get', payload: {} }), credentials: 'omit', signal: AbortSignal.timeout(25000) });
    if (!response.ok) throw Error();
    let length = 0; const chunks = [];
    for await (const chunk of response.body) { length += chunk.length; if (length > 20 * 1024 * 1024) throw Error(); chunks.push(chunk); }
    result = JSON.parse(Buffer.concat(chunks).toString());
    if (result.ok !== true || !result.data?.brands?.length || !Array.isArray(result.data?.products)) throw Error();
  } catch { throw new TradeError('기존 카탈로그를 불러오지 못했습니다. 저장된 상품은 유지됩니다.', 502); }
  return store.importCatalog(actor, result.data);
}
