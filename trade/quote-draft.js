// Account IDs come from the authenticated /me response. Never a business number.
export function itemsOnly(items) {
  if (!Array.isArray(items) || items.length > 100) throw Error('품목 목록을 확인해 주세요.');
  const seen = new Set();
  return items.map(item => {
    if (!item || typeof item.productId !== 'string' || !item.productId || item.productId.length > 200 || typeof item.optionId !== 'string' || !item.optionId || item.optionId.length > 200 || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 999) throw Error('품목·옵션·수량을 확인해 주세요.');
    const key = JSON.stringify([item.productId, item.optionId]);
    if (seen.has(key)) throw Error('중복 품목을 확인해 주세요.');
    seen.add(key);
    return {productId:item.productId, optionId:item.optionId, quantity:item.quantity};
  });
}
export function createDraftSession(storage, uuid = () => crypto.randomUUID()) {
  let owner = 'guest';
  const key = kind => 'worknic_quote_v2:' + encodeURIComponent(owner) + ':' + kind;
  return {
    select(memberId) {
      owner = memberId == null ? 'guest' : 'member:' + memberId;
      if (memberId != null && (typeof memberId !== 'string' || !memberId || memberId.length > 200)) throw Error('계정 확인이 필요합니다.');
      try { return itemsOnly(JSON.parse(storage.getItem(key('cart')) || '[]')); } catch { return []; }
    },
    save(items) { storage.setItem(key('cart'), JSON.stringify(itemsOnly(items))); },
    requestKey(payload) {
      if (owner === 'guest') throw Error('로그인이 필요합니다.');
      const fingerprint = JSON.stringify({items:itemsOnly(payload.items),locationId:payload.locationId,note:payload.note || ''});
      let previous;
      try { previous = JSON.parse(storage.getItem(key('request')) || 'null'); } catch {}
      if (previous?.fingerprint === fingerprint && typeof previous.key === 'string' && previous.key.length >= 16) return previous.key;
      const next = {fingerprint,key:uuid()};
      storage.setItem(key('request'),JSON.stringify(next)); // persist BEFORE sending, including reload after unknown result
      return next.key;
    },
    confirmed() { storage.removeItem(key('request')); storage.removeItem(key('cart')); },
  };
}
export function mayRefresh(view, activeElement) {
  return !view.querySelector('form[data-draft-dirty="true"],form[data-draft-pending="true"],form[data-busy="true"],dialog[open]') && !(activeElement && view.contains(activeElement) && activeElement.matches('input,textarea,select,[contenteditable="true"]'));
}
