import { $, el, money, api, say, button, totals, run, orderCard } from './common.js';
let member = null, products = [], settings = null, cart = [], requestKey = null;
const cartKey = () => 'worknic_trade_cart_' + member.id;
const requestStorageKey = () => cartKey() + '_request';
function saveCart() { try { sessionStorage.setItem(cartKey(), JSON.stringify(cart)); sessionStorage.removeItem(requestStorageKey()); } catch {} requestKey = null; renderCart(); }
function loadCart() { try { cart = JSON.parse(sessionStorage.getItem(cartKey()) || '[]'); if (!Array.isArray(cart)) cart = []; cart = cart.filter(x => typeof x.productId === 'string' && Number.isInteger(x.quantity) && x.quantity > 0 && x.quantity <= 999); requestKey = sessionStorage.getItem(requestStorageKey()); } catch { cart = []; } }
function route() {
  const view = ['catalog', 'cart', 'orders'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'catalog';
  for (const name of ['catalog', 'cart', 'orders']) { $('#' + name + '-view').hidden = name !== view; document.querySelector(`.trade-nav a[href="#${name}"]`).setAttribute('aria-current', name === view ? 'page' : 'false'); }
  if (view === 'cart') renderCart(); if (view === 'orders' && member?.status === 'approved') loadOrders().catch(e => say(e.message, true));
}
function renderProducts() {
  $('#shipping-note').textContent = `표시 단가는 부가세 포함입니다. 상품금액 ${money(settings.shipping.freeOver)} 이상 무료배송, 미만은 배송·포장비 ${money(settings.shipping.fee)}입니다.`;
  const q = $('#product-search').value.toLowerCase().trim();
  const list = products.filter(p => [p.name, p.brand, p.model].join(' ').toLowerCase().includes(q));
  $('#products').replaceChildren(...list.map(p => {
    const card = el('article', null, 'trade-product');
    const placeholder = () => el('div', '사진 준비 중', 'trade-photo-placeholder');
    if (p.images[0] && /^(https:\/\/|\/assets\/)/.test(p.images[0])) { const image = el('img'); image.src = p.images[0]; image.alt = p.name; image.loading = 'lazy'; image.onerror = () => image.replaceWith(placeholder()); card.append(image); }
    else card.append(placeholder());
    card.append(el('p', p.brand, 'eyebrow'), el('h3', p.name), el('p', p.model, 'muted'));
    if (p.summary) card.append(el('p', p.summary));
    if (p.specs?.length) {
      const detail = el('details'), list = el('dl', null, 'product-specs'); detail.append(el('summary', '규격·상품 설명'));
      for (const pair of p.specs) if (Array.isArray(pair) && pair.length === 2) { list.append(el('dt', String(pair[0])), el('dd', String(pair[1]))); }
      detail.append(list); card.append(detail);
    }
    const available = p.enabled && !p.specialShipping && p.stock > 0 && p.price > 0;
    card.append(el('p', p.price > 0 ? money(p.price) + ' · 부가세 포함' : '가격 준비 중', 'product-price'));
    const b = button(available ? '장바구니 담기' : p.specialShipping ? '배송비 별도 확인' : '주문 준비 중', () => {
      const entry = cart.find(l => l.productId === p.id);
      if (entry && entry.quantity >= Math.min(p.stock, 999)) return say('주문 가능 수량을 확인해 주세요.', true);
      if (entry) entry.quantity++; else cart.push({ productId: p.id, quantity: 1 });
      saveCart(); say(p.name + ' 상품을 장바구니에 담았습니다.');
    }); b.disabled = !available || !settings.ordersEnabled; card.append(b); return card;
  }));
  if (!list.length) $('#products').append(el('p', '조건에 맞는 상품이 없습니다.'));
}
function renderCart() {
  if (!member) return;
  const root = $('#cart-items'); root.replaceChildren(); let subtotal = 0, invalid = false;
  for (const line of cart) {
    const p = products.find(p => p.id === line.productId), row = el('article', null, 'cart-row');
    row.append(el('h3', p?.name || '판매 종료 상품'));
    const available = p?.enabled && !p.specialShipping && p.stock >= line.quantity && p.price > 0;
    invalid ||= !available;
    row.append(el('p', p?.price > 0 ? money(p.price) : '가격 확인 필요'));
    const label = el('label', '수량'), quantity = el('input'); quantity.type = 'number'; quantity.min = 1; quantity.max = Math.min(999, p?.stock || 999); quantity.value = line.quantity; quantity.setAttribute('aria-label', (p?.name || '상품') + ' 수량');
    quantity.onchange = () => { const v = Number(quantity.value); if (!Number.isInteger(v) || v < 1 || v > Math.min(999, p?.stock || 999)) { quantity.value = line.quantity; return say('주문 가능 수량을 확인해 주세요.', true); } line.quantity = v; saveCart(); }; label.append(quantity); row.append(label);
    row.append(button('삭제', () => { cart = cart.filter(l => l !== line); saveCart(); }, 'button secondary'));
    if (!available) row.append(el('p', '가격·판매 상태·수량이 변경되었습니다. 삭제하거나 수량을 조정해 주세요.', 'error-text'));
    if (p?.price) subtotal += p.price * line.quantity; root.append(row);
  }
  $('#cart-count').textContent = cart.reduce((s, l) => s + l.quantity, 0);
  $('#checkout').hidden = !cart.length;
  if (!cart.length) root.append(el('p', '장바구니가 비어 있습니다. 상품을 담아 주세요.', 'empty'));
  const shippingFee = subtotal >= settings.shipping.freeOver ? 0 : settings.shipping.fee;
  $('#cart-totals').replaceChildren(...totals({ subtotal, shippingFee, total: subtotal + shippingFee }).children);
  const p = member.profile; $('#checkout-address').textContent = `(${p.postalCode}) ${p.address} ${p.addressDetail} · ${p.contactName} · ${p.phone}`;
  $('#place-order').disabled = invalid || !settings.ordersEnabled;
  $('#payment-deadline-note').textContent = `입금기한은 주문 후 ${settings.paymentDays}일입니다. 기한 내 입금하지 않은 주문은 자동 만료됩니다. 늦게 입금하셨다면 담당자에게 확인해 주세요.`;
}
async function loadOrders() {
  const { orders } = await api('/orders');
  $('#orders').replaceChildren(...orders.map(o => orderCard(o, actions => {
    if (o.status === 'pending_payment') actions.append(button('주문 취소', async () => {
      if (!confirm('입금 전 주문을 취소할까요? 이미 입금하셨다면 취소하지 말고 담당자에게 문의해 주세요.')) return;
      try { await api('/orders/' + o.id, { action: 'cancel', revision: o.revision }); await loadOrders(); await refreshProducts(); say('주문을 취소했습니다.'); } catch (e) { say(e.message, true); }
    }, 'button secondary'));
  })));
  if (!orders.length) $('#orders').append(el('p', '아직 주문 내역이 없습니다.', 'empty'));
}
async function refreshProducts() { products = (await api('/catalog')).products; renderProducts(); renderCart(); }
async function signedIn(value) {
  member = value; $('#auth').hidden = true; $('#account').hidden = false;
  $('#account-name').textContent = (member.profile.companyName || member.username) + ' · ' + (member.profile.contactName || '담당자');
  if (member.role === 'admin') { location.replace('/trade/admin'); return; }
  $('#pending').hidden = member.status === 'approved'; $('#approved').hidden = member.status !== 'approved';
  if (member.status === 'approved') { loadCart(); $('#order-form').elements.depositor.value = member.profile.companyName; await refreshProducts(); route(); say(settings.ordersEnabled ? '사업자 주문을 이용하실 수 있습니다.' : '주문 접수를 준비하고 있습니다. 상품 정보를 먼저 확인해 주세요.'); }
  else say('가입 신청이 접수되었습니다. 워크닉 담당자의 승인을 기다려 주세요.');
}
$('#login-form').onsubmit = e => { e.preventDefault(); run(e.target, async () => { const data = Object.fromEntries(new FormData(e.target)); const result = await api('/login', data); e.target.reset(); await signedIn(result.member); }); };
$('#signup-form').onsubmit = e => { e.preventDefault(); run(e.target, async () => { const data = Object.fromEntries(new FormData(e.target)); await api('/register', { ...data, consent: data.consent === 'on' }); e.target.reset(); document.querySelector('.signup').open = false; say('사업자 가입을 접수했습니다. 로그인하면 승인 상태를 확인할 수 있습니다.'); }); };
$('#logout').onclick = async () => { try { await api('/logout', {}); cart = []; requestKey = null; member = null; location.reload(); } catch (e) { say(e.message, true); } };
$('#product-search').oninput = renderProducts;
$('#refresh-orders').onclick = () => run($('#orders-view'), loadOrders);
$('#order-form').onsubmit = e => {
  e.preventDefault(); run(e.target, async () => {
    // Keep the same key after an uncertain response or reload: retries cannot duplicate orders.
    requestKey ||= crypto.randomUUID(); try { sessionStorage.setItem(requestStorageKey(), requestKey); } catch {}
    const data = Object.fromEntries(new FormData(e.target));
    const items = cart.map(l => ({ ...l, expectedPrice: products.find(p => p.id === l.productId)?.price }));
    const subtotal = items.reduce((sum, l) => sum + l.expectedPrice * l.quantity, 0);
    const shippingFee = subtotal >= settings.shipping.freeOver ? 0 : settings.shipping.fee;
    let order;
    try {
      ({ order } = await api('/orders', { requestKey, items, expectedSubtotal: subtotal, expectedShippingFee: shippingFee, depositor: data.depositor, note: data.note, acceptTerms: data.acceptTerms === 'on', shippingConfirmed: data.shippingConfirmed === 'on' }));
    } catch (e) {
      if (e.status === 409) { settings = await api('/settings'); await refreshProducts(); }
      throw e;
    }
    cart = []; saveCart(); e.target.reset(); e.target.elements.depositor.value = member.profile.companyName;
    location.hash = 'orders'; await loadOrders(); await refreshProducts(); say(order.number + ' 주문을 접수하고 거래명세서를 발행했습니다. 계좌와 입금기한을 확인해 주세요.');
  }).finally(renderCart);
};
window.addEventListener('hashchange', route);
$('#reset-form').onsubmit = e => { e.preventDefault(); run(e.target, async () => { await api('/reset-password', { token: new URLSearchParams(location.hash.slice(1)).get('reset'), password: e.target.elements.password.value }); e.target.reset(); history.replaceState(null, '', '/trade/'); location.reload(); }); };
async function init() {
  try {
    settings = await api('/settings');
    if (new URLSearchParams(location.hash.slice(1)).has('reset')) { $('#reset-panel').hidden = false; say('담당자에게 받은 재설정 정보로 비밀번호를 변경해 주세요.'); return; }
    try { await signedIn((await api('/me')).member); }
    catch (e) { if (e.status !== 401) throw e; $('#auth').hidden = false; say('사업자 계정으로 로그인하거나 가입을 신청해 주세요.'); }
  } catch (e) { $('#auth').hidden = true; say(e.message, true); }
}
init();
