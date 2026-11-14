import { $, el, money, date, api, say, button, link, run, orderCard } from './common.js';
let members = [], products = [], orders = [], settings = null;
function route() {
  const view = ['members', 'products', 'orders', 'settings'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'members';
  for (const name of ['members', 'products', 'orders', 'settings']) { $('#' + name + '-view').hidden = name !== view; document.querySelector(`.trade-nav a[href="#${name}"]`).setAttribute('aria-current', name === view ? 'page' : 'false'); }
}
function field(form, name, label, value, type = 'text') {
  const l = el('label', label), i = el('input'); i.name = name; i.type = type;
  if (type === 'checkbox') { l.className = 'check'; i.checked = value; l.replaceChildren(i, el('span', label)); }
  else { i.value = value ?? ''; i.required = true; if (type === 'number') { i.min = 0; i.step = 1; } l.append(i); }
  form.append(l); return i;
}
function renderMembers() {
  $('#members').replaceChildren(...members.map(m => {
    const p = m.profile, card = el('article', null, 'card');
    const names = { pending: '승인 대기', approved: '거래 승인', rejected: '가입 반려', suspended: '이용 정지' };
    card.append(el('h3', p.companyName), el('span', names[m.status], 'badge'), el('p', `사업자등록번호 ${p.businessNumber} · 아이디 ${m.username}`), el('p', `${p.contactName} · ${p.phone} · ${p.email}`), el('p', `(${p.postalCode}) ${p.address} ${p.addressDetail}`), el('p', `가입 ${date(m.createdAt)}`, 'muted'));
    const actions = el('div', null, 'actions');
    if (m.status !== 'approved') actions.append(button('사업자 확인 후 승인', async () => {
      if (!confirm(`${p.companyName}의 사업자 정보와 담당자 정보를 확인하셨나요? 확인한 회원에게 주문 권한을 부여합니다.`)) return;
      await changeMember(m, 'approved');
    }));
    if (m.status === 'pending') actions.append(button('가입 반려', () => changeMember(m, 'rejected'), 'button secondary'));
    if (m.status === 'approved') actions.append(button('거래 정지', async () => { if (confirm('이 회원의 거래를 정지할까요? 기존 주문 기록은 유지됩니다.')) await changeMember(m, 'suspended'); }, 'button secondary'));
    actions.append(button('비밀번호 재설정 안내 만들기', async () => {
      try {
        const r = await api(`/admin/members/${m.id}/reset`, {});
        const box = el('div', null, 'bank-panel'); box.append(el('h3', '담당자 본인 확인 후 전달해 주세요.'), el('p', '30분 동안 한 번 사용할 수 있습니다. 새로 만들면 이전 안내는 만료됩니다.', 'muted'));
        const a = link('비밀번호 재설정', location.origin + '/trade/#reset=' + encodeURIComponent(r.token));
        const value = el('input'); value.readOnly = true; value.value = a.href; value.setAttribute('aria-label', '비밀번호 재설정 주소'); value.onclick = () => value.select(); box.append(value, a); card.append(box);
        say('재설정 주소를 만들었습니다. 본인 확인 후 담당자에게 전달해 주세요.');
      } catch (e) { say(e.message, true); }
    }, 'button secondary')); card.append(actions); return card;
  }));
  if (!members.length) $('#members').append(el('p', '아직 가입 신청이 없습니다.', 'empty'));
}
async function changeMember(m, status) { try { await api('/admin/members/' + m.id, { status, revision: m.revision, businessChecked: status === 'approved' }); await load(); say('회원 상태를 변경했습니다.'); } catch (e) { say(e.message, true); } }
function renderProducts() {
  const q = $('#admin-product-search').value.trim().toLowerCase();
  $('#admin-products').replaceChildren(...products.filter(p => [p.name, p.brand, p.model].join(' ').toLowerCase().includes(q)).map(p => {
    const form = el('form', null, 'card'); form.append(el('h3', p.brand + ' · ' + p.name), el('p', p.model || p.id, 'muted'));
    const fields = el('div', null, 'fields');
    const price = field(fields, 'price', '판매 단가 · 부가세 포함 원', p.price, 'number'); price.min = 1; price.max = 100000000;
    const stock = field(fields, 'stock', '추가 주문 가능 수량 · 예약 수량 제외', p.stock, 'number'); stock.max = 1000000;
    form.append(fields); field(form, 'enabled', '사업자 주문 가능', p.enabled, 'checkbox'); field(form, 'specialShipping', '대형·중량 등 배송비 별도 확인 상품', p.specialShipping, 'checkbox');
    form.append(el('p', '주문 시 수량이 예약되어 차감되고, 입금 전 취소·기한 만료 시 복원됩니다. 판매 가능한 잔여 수량을 입력해 주세요.', 'muted'), el('button', '저장', 'button'));
    form.onsubmit = e => { e.preventDefault(); run(form, async () => {
      const d = new FormData(form); await api('/admin/products/' + p.id, { price: Number(d.get('price')), stock: Number(d.get('stock')), enabled: d.get('enabled') === 'on', specialShipping: d.get('specialShipping') === 'on', revision: p.revision });
      products = (await api('/catalog')).products; renderProducts(); say('상품 단가와 주문 가능 수량을 저장했습니다.');
    }); }; return form;
  }));
}
function renderOrders() {
  const filter = $('#order-filter').value;
  const selected = orders.filter(o => !filter || o.status === filter);
  $('#admin-orders').replaceChildren(...selected.map(o => orderCard(o, (actions, card) => {
    card.append(el('p', `배송지: (${o.buyer.postalCode}) ${o.buyer.address} ${o.buyer.addressDetail} · ${o.buyer.contactName} · ${o.buyer.phone}`));
    if (o.note) card.append(el('p', '요청사항: ' + o.note));
    if (o.payment) card.append(el('p', `입금 확인: ${o.payment.confirmedBy} · ${date(o.payment.confirmedAt)} · ${o.payment.reference}`, 'muted'));
    if (o.status === 'pending_payment') {
      const form = el('form', null, 'bank-panel'); form.append(el('h3', '실제 은행 입금내역 확인'));
      field(form, 'amount', '실제 입금액 · 원', o.total, 'number'); field(form, 'reference', '입금자명 또는 은행 확인번호', '');
      const checked = field(form, 'bankChecked', '은행 거래내역에서 위 금액의 입금을 확인했습니다.', false, 'checkbox'); checked.required = true;
      form.append(el('button', '입금 확인 처리', 'button'));
      form.onsubmit = e => { e.preventDefault(); run(form, async () => {
        const d = new FormData(form); await api('/orders/' + o.id, { action: 'confirm_payment', revision: o.revision, amount: Number(d.get('amount')), reference: d.get('reference'), bankChecked: d.get('bankChecked') === 'on' }); await load(); say('입금을 확인했습니다. 배송 준비를 진행해 주세요.');
      }); }; card.append(form);
      actions.append(button('미입금 주문 취소', async () => {
        if (!confirm('은행 입금내역이 없는지 확인하셨나요? 입금된 주문은 이 기능으로 취소하지 마세요.')) return;
        try { await api('/orders/' + o.id, { action: 'cancel', revision: o.revision }); await load(); say('미입금 주문을 취소했습니다.'); } catch (e) { say(e.message, true); }
      }, 'button secondary'));
    }
    if (o.status === 'paid') actions.append(button('배송 준비 시작', async () => { try { await api('/orders/' + o.id, { action: 'prepare', revision: o.revision }); await load(); say('배송 준비로 변경했습니다.'); } catch (e) { say(e.message, true); } }));
    if (o.status === 'preparing') {
      const form = el('form', null, 'bank-panel'); form.append(el('h3', '발송 정보')); field(form, 'carrier', '택배사', ''); const tracking = field(form, 'tracking', '운송장번호', ''); tracking.pattern = '[A-Za-z0-9-]{5,80}';
      form.append(el('button', '발송 완료 처리', 'button')); form.onsubmit = e => { e.preventDefault(); run(form, async () => { const d = Object.fromEntries(new FormData(form)); await api('/orders/' + o.id, { ...d, action: 'ship', revision: o.revision }); await load(); say('발송 완료로 변경했습니다.'); }); }; card.append(form);
    }
  })));
  if (!selected.length) $('#admin-orders').append(el('p', '해당 상태의 주문이 없습니다.', 'empty'));
}
function renderSettings() {
  const f = $('#settings-form').elements;
  Object.entries({ bankName: settings.bank.name, holder: settings.bank.holder, account: settings.bank.account, fee: settings.shipping.fee, freeOver: settings.shipping.freeOver, paymentDays: settings.paymentDays }).forEach(([key, value]) => f[key].value = value);
  f.ordersEnabled.checked = settings.ordersEnabled;
}
async function load() {
  const responses = await Promise.all([api('/admin/members'), api('/catalog'), api('/orders'), api('/admin/settings')]);
  members = responses[0].members; products = responses[1].products; orders = responses[2].orders; settings = responses[3];
  renderMembers(); renderProducts(); renderOrders(); renderSettings(); route();
}
async function signedIn(member) {
  if (member.role !== 'admin') { await api('/logout', {}); throw Error('워크닉 담당자 계정으로 로그인해 주세요.'); }
  $('#admin-login').hidden = true; $('#admin-app').hidden = false; $('#admin-name').textContent = member.username + ' 담당자'; await load(); say(settings.ordersEnabled ? '사업자 주문을 접수하고 있습니다.' : '주문 접수는 닫혀 있습니다. 상품과 운영 설정을 확인한 뒤 열어 주세요.');
}
$('#admin-login').onsubmit = e => { e.preventDefault(); run(e.target, async () => { const r = await api('/login', Object.fromEntries(new FormData(e.target))); e.target.reset(); await signedIn(r.member); }); };
$('#admin-refresh').onclick = () => run($('#admin-app'), load);
$('#admin-logout').onclick = async () => { try { await api('/logout', {}); location.reload(); } catch (e) { say(e.message, true); } };
$('#admin-product-search').oninput = renderProducts; $('#order-filter').onchange = renderOrders;
$('#catalog-sync').onclick = () => run($('#products-view'), async () => {
  say('기존 브랜드 관리의 공개 상품을 불러오고 있습니다.');
  const result = await api('/admin/catalog-sync', {});
  products = (await api('/catalog')).products; renderProducts();
  say(`${result.imported}개 공개 상품을 동기화했습니다. 신규 상품의 단가·수량을 확인하고 주문 가능으로 설정해 주세요.`);
});
$('#settings-form').onsubmit = e => { e.preventDefault(); run(e.target, async () => {
  const f = new FormData(e.target);
  if (f.get('ordersEnabled') === 'on' && !settings.ordersEnabled && !confirm('입금계좌, 상품 단가·수량, 배송 조건과 개인정보·이용 안내를 확인했나요? 실제 주문 접수를 시작합니다.')) return;
  settings = await api('/admin/settings', { revision: settings.revision, bank: { name: f.get('bankName'), holder: f.get('holder'), account: f.get('account') }, shipping: { fee: Number(f.get('fee')), freeOver: Number(f.get('freeOver')) }, paymentDays: Number(f.get('paymentDays')), ordersEnabled: f.get('ordersEnabled') === 'on' }); renderSettings(); say('운영 설정을 저장했습니다.');
}); };
window.addEventListener('hashchange', route);
async function init() { try { await api('/health'); try { await signedIn((await api('/me')).member); } catch (e) { if (e.status !== 401) throw e; $('#admin-login').hidden = false; say('담당자 계정으로 로그인해 주세요.'); } } catch (e) { $('#admin-login').hidden = false; say(e.message, true); } }
init();
