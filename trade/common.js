export const $ = s => document.querySelector(s);
export function el(tag, text, cls) { const e = document.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; }
export const money = n => new Intl.NumberFormat('ko-KR').format(n) + '원';
export const date = n => new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' }).format(n);
export const statusNames = { pending_payment: '입금 대기', paid: '입금 확인', preparing: '배송 준비', shipped: '발송 완료', cancelled: '주문 취소', expired: '입금기한 만료' };
export function say(message, error = false) { $('#status').textContent = message; $('#status').className = 'notice' + (error ? ' error' : ''); }
export async function api(path, input) {
  let response;
  try { response = await fetch('/api/trade' + path, { method: input === undefined ? 'GET' : 'POST', credentials: 'same-origin', headers: input === undefined ? {} : { 'Content-Type': 'application/json' }, body: input === undefined ? undefined : JSON.stringify(input), signal: AbortSignal.timeout(25000) }); }
  catch { throw Error('연결을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.'); }
  let result;
  try { result = await response.json(); } catch { throw Error('주문 서비스가 아직 연결되지 않았습니다. 기존 가입 신청은 공식 홈페이지에서 이용해 주세요.'); }
  if (!response.ok) { const error = Error(result.error || '요청을 처리하지 못했습니다.'); error.status = response.status; throw error; }
  return result;
}
export function button(label, onClick, cls = 'button') { const b = el('button', label, cls); b.type = 'button'; b.onclick = onClick; return b; }
export function link(label, href, cls = 'button') { const a = el('a', label, cls); a.href = href; return a; }
export function totals(data) {
  const root = el('dl', null, 'totals');
  for (const [label, value] of [['상품금액', data.subtotal], ['배송·포장비', data.shippingFee], ['합계 입금액', data.total]]) { const row = el('div'); row.append(el('dt', label), el('dd', money(value))); root.append(row); }
  return root;
}
export async function run(form, task) {
  if (form.dataset.busy) return;
  form.dataset.busy = 'true'; form.setAttribute('aria-busy', 'true');
  const controls = [...form.querySelectorAll('button')]; controls.forEach(b => b.disabled = true);
  try { await task(); } catch (e) { say(e.message, true); $('#status').scrollIntoView({ block: 'nearest' }); }
  finally { delete form.dataset.busy; form.removeAttribute('aria-busy'); controls.forEach(b => b.disabled = false); }
}
export function orderCard(order, extra) {
  const card = el('article', null, 'card order-card'), heading = el('div', null, 'section-heading');
  heading.append(el('h3', order.number), el('span', statusNames[order.status] || order.status, 'badge'));
  card.append(heading, el('p', date(order.createdAt) + ' · ' + order.buyer.companyName, 'muted'));
  for (const line of order.items) card.append(el('p', `${line.brand} · ${line.name} ${line.model || ''} / ${line.quantity}개 / ${money(line.amount)}`));
  card.append(totals(order));
  if (order.status === 'pending_payment') card.append(el('p', `${order.bank.name} ${order.bank.account} · ${order.bank.holder}`), el('p', `입금자명 ${order.depositor} · 기한 ${date(order.dueAt)}`, 'muted'));
  if (order.shipment) card.append(el('p', `${order.shipment.carrier} · 운송장 ${order.shipment.tracking}`));
  const actions = el('div', null, 'actions');
  const a = link('거래명세서·인쇄', `/api/trade/orders/${order.id}/statement`); a.target = '_blank'; a.rel = 'noopener'; actions.append(a);
  if (extra) extra(actions, card);
  card.append(actions); return card;
}
