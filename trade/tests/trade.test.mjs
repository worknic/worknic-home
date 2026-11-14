import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  openStore,
  DEFAULT_SETTINGS,
  validBusinessNumber,
  verifyTotp,
} from "../server/store.mjs";
import { createTradeServer } from "../server/http.mjs";
import { statement } from "../server/statement.mjs";
import { syncCatalog } from "../server/catalog-sync.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const registration = (name) => ({
  username: name,
  password: "simple test phrase",
  companyName: "테스트 사업장",
  businessNumber: "1234567891",
  contactName: "테스트 담당자",
  phone: "010-0000-0000",
  email: "tester@example.invalid",
  postalCode: "11111",
  address: "테스트용 주소",
  addressDetail: "테스트",
  consent: true,
});
function fixture() {
  const dir = mkdtempSync(resolve(tmpdir(), "worknic-trade-test-"));
  let now = Date.now();
  const filename = resolve(dir, "db.sqlite"),
    store = openStore(filename, { clock: () => now });
  store.createAdmin("staff", "staff test passphrase");
  const admin = store.login("staff", "staff test passphrase");
  store.register(registration("buyer"));
  store.register(registration("other"));
  for (const member of store.members(admin))
    store.updateMember(admin, member.id, {
      status: "approved",
      revision: member.revision,
      businessChecked: true,
    });
  const buyer = store.login("buyer", "simple test phrase"),
    other = store.login("other", "simple test phrase");
  const catalog = resolve(dir, "catalog.json");
  writeFileSync(
    catalog,
    JSON.stringify({
      brands: [{ id: "test", name: "테스트" }],
      products: [
        {
          id: "p1",
          name: "<script>상품</script>",
          model: "T-1",
          brand: "test",
          published: true,
          images: [],
        },
        {
          id: "p2",
          name: "고가 상품",
          model: "T-2",
          brand: "test",
          published: true,
        },
      ],
    }),
  );
  store.seedCatalog(catalog);
  for (const p of store.products(admin))
    store.updateProduct(admin, p.id, {
      price: p.id === "p1" ? 50000 : 500000,
      stock: 20,
      enabled: true,
      specialShipping: false,
      revision: p.revision,
    });
  store.updateSettings(admin, { ...store.settings(), ordersEnabled: true });
  const order = (overrides = {}) => ({
    requestKey: "request_unique_key_001",
    items: [{ productId: "p1", quantity: 1, expectedPrice: 50000 }],
    expectedSubtotal: 50000,
    expectedShippingFee: 5000,
    acceptTerms: true,
    shippingConfirmed: true,
    ...overrides,
  });
  return {
    store,
    admin,
    buyer,
    other,
    order,
    filename,
    clock: () => now,
    advance: (ms) => (now += ms),
    cleanup: () => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test("가입 검증·승인·권한·세션 만료·일회용 비밀번호 재설정", () => {
  const f = fixture();
  try {
    const { store, admin, buyer } = f;
    assert.ok(validBusinessNumber("363-86-03519"));
    assert.equal(validBusinessNumber("0000000000"), false);
    assert.throws(
      () => store.register({ ...registration("short"), password: "123" }),
      /10/,
    );
    assert.throws(() => store.register(registration("buyer")), /이미 사용/);
    store.register(registration("pending"));
    const pending = store.login("pending", "simple test phrase");
    assert.throws(() => store.createOrder(pending, f.order()), /승인/);
    assert.throws(() => store.members(buyer), /관리자/);
    assert.throws(
      () =>
        store.updateMember(admin, pending.id, {
          status: "approved",
          revision: pending.revision,
        }),
      /확인/,
    );
    const session = store.session(buyer);
    assert.equal(store.authenticate(session.token).id, buyer.id);
    const reset = store.resetToken(admin, buyer.id);
    store.resetPassword(reset.token, "new simple passphrase");
    assert.equal(store.authenticate(session.token), null);
    assert.throws(
      () => store.resetPassword(reset.token, "another passphrase"),
      /만료/,
    );
    assert.throws(() => store.login("buyer", "simple test phrase"), /확인/);
    assert.equal(store.login("buyer", "new simple passphrase").id, buyer.id);
    const second = store.session(buyer);
    f.advance(13 * 3600_000);
    assert.equal(store.authenticate(second.token), null);
  } finally {
    f.cleanup();
  }
});

test("금액 위변조 차단·중복 주문 방지·배송비 경계·예약 수량", () => {
  const f = fixture();
  try {
    const { store, buyer, admin } = f;
    assert.throws(
      () =>
        store.createOrder(
          buyer,
          f.order({
            items: [{ productId: "p1", quantity: 1, expectedPrice: 1 }],
          }),
        ),
      /가격/,
    );
    assert.throws(
      () => store.createOrder(buyer, f.order({ expectedShippingFee: 0 })),
      /배송비/,
    );
    assert.throws(
      () =>
        store.createOrder(
          buyer,
          f.order({
            items: [{ productId: "p1", quantity: -1, expectedPrice: 50000 }],
          }),
        ),
      /수량/,
    );
    const o = store.createOrder(buyer, f.order());
    assert.equal(o.total, 55000);
    assert.equal(o.shippingFee, 5000);
    assert.equal(o.total, o.supplyAmount + o.vat);
    assert.equal(o.bank.account, "556-910020-91004");
    assert.equal(store.createOrder(buyer, f.order()).id, o.id);
    assert.equal(store.products(admin).find((p) => p.id === "p1").stock, 19);
    const free = store.createOrder(
      buyer,
      f.order({
        requestKey: "request_unique_key_002",
        items: [{ productId: "p1", quantity: 10, expectedPrice: 50000 }],
        expectedSubtotal: 500000,
        expectedShippingFee: 0,
      }),
    );
    assert.equal(free.shippingFee, 0);
    assert.equal(free.total, 500000);
    assert.throws(
      () =>
        store.createOrder(
          buyer,
          f.order({
            requestKey: "request_unique_key_003",
            items: [{ productId: "p1", quantity: 10, expectedPrice: 50000 }],
            expectedSubtotal: 500000,
            expectedShippingFee: 0,
          }),
        ),
      /수량/,
    );
  } finally {
    f.cleanup();
  }
});

test("입금 확인 전 발송 차단·고객 간 주문 격리·배송 추적·스냅샷 불변", () => {
  const f = fixture();
  try {
    const { store, buyer, admin, other } = f;
    const o = store.createOrder(buyer, f.order());
    assert.throws(() => store.order(other, o.id), /찾을 수/);
    assert.throws(
      () =>
        store.updateOrder(buyer, o.id, {
          action: "confirm_payment",
          revision: 1,
        }),
      /관리자/,
    );
    assert.throws(
      () =>
        store.updateOrder(admin, o.id, {
          action: "ship",
          revision: 1,
          carrier: "택배",
          tracking: "1234567",
        }),
      /배송 준비/,
    );
    assert.throws(
      () =>
        store.updateOrder(admin, o.id, {
          action: "confirm_payment",
          revision: 1,
          amount: 1,
          reference: "입금",
          bankChecked: true,
        }),
      /실제 입금액/,
    );
    const paid = store.updateOrder(admin, o.id, {
      action: "confirm_payment",
      revision: 1,
      amount: 55000,
      reference: "테스트 입금",
      bankChecked: true,
    });
    assert.equal(paid.status, "paid");
    assert.equal(paid.payment.confirmedBy, "staff");
    assert.throws(
      () =>
        store.updateOrder(buyer, o.id, {
          action: "cancel",
          revision: paid.revision,
        }),
      /입금 확인 이후/,
    );
    assert.throws(
      () => store.updateOrder(admin, o.id, { action: "prepare", revision: 1 }),
      /변경/,
    );
    const preparing = store.updateOrder(admin, o.id, {
      action: "prepare",
      revision: paid.revision,
    });
    const shipped = store.updateOrder(admin, o.id, {
      action: "ship",
      revision: preparing.revision,
      carrier: "테스트 택배",
      tracking: "123456789",
    });
    assert.equal(shipped.status, "shipped");
    assert.equal(shipped.shipment.tracking, "123456789");
    const p = store.products(admin).find((p) => p.id === "p1");
    store.updateProduct(admin, "p1", {
      price: 90000,
      stock: 9,
      enabled: true,
      specialShipping: false,
      revision: p.revision,
    });
    const s = store.settings();
    store.updateSettings(admin, {
      ...s,
      bank: { ...s.bank, account: "TEST-NEW" },
    });
    const old = store.order(buyer, o.id);
    assert.equal(old.items[0].unitPrice, 50000);
    assert.equal(old.bank.account, DEFAULT_SETTINGS.bank.account);
    const html = statement(old);
    assert.ok(html.includes("&lt;script&gt;상품&lt;/script&gt;"));
    assert.ok(!html.includes("<script>상품</script>"));
    assert.ok(html.includes("배송·포장비"));
  } finally {
    f.cleanup();
  }
});

test("취소·기한 만료 시 수량 한 번만 복원·지연 입금 차단", () => {
  const f = fixture();
  try {
    const { store, buyer, admin } = f;
    const o = store.createOrder(buyer, f.order());
    store.updateOrder(buyer, o.id, { action: "cancel", revision: o.revision });
    assert.equal(store.products(admin).find((p) => p.id === "p1").stock, 20);
    const next = store.createOrder(
      buyer,
      f.order({ requestKey: "request_unique_key_002" }),
    );
    f.advance(4 * 86400_000);
    store.expireOrders();
    store.expireOrders();
    assert.equal(store.order(buyer, next.id).status, "expired");
    assert.equal(store.products(admin).find((p) => p.id === "p1").stock, 20);
    assert.throws(
      () =>
        store.updateOrder(admin, next.id, {
          action: "confirm_payment",
          revision: 2,
          amount: 55000,
          bankChecked: true,
          reference: "늦은 입금",
        }),
      /입금 대기/,
    );
  } finally {
    f.cleanup();
  }
});

test("운영 닫힘·특수 배송·판매 미설정 상품은 접수 차단", () => {
  const f = fixture();
  try {
    const { store, buyer, admin } = f;
    store.updateSettings(admin, { ...store.settings(), ordersEnabled: false });
    assert.throws(() => store.createOrder(buyer, f.order()), /준비/);
    store.updateSettings(admin, { ...store.settings(), ordersEnabled: true });
    const p = store.products(admin).find((p) => p.id === "p1");
    store.updateProduct(admin, p.id, { ...p, specialShipping: true });
    assert.throws(() => store.createOrder(buyer, f.order()), /주문할 수 없는/);
    assert.throws(
      () => store.createOrder(buyer, f.order({ shippingConfirmed: false })),
      /배송/,
    );
  } finally {
    f.cleanup();
  }
});

test("HTTP 인증·CSRF·HttpOnly 쿠키·관리자 격리·비공개 파일 차단", async () => {
  const f = fixture(),
    origin = "http://localhost:18085";
  const server = createTradeServer({
    store: f.store,
    root,
    origin,
    secure: false,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const post = (path, value, headers = {}) =>
    fetch(base + "/api/trade" + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        ...headers,
      },
      body: JSON.stringify(value),
    });
  try {
    assert.equal((await fetch(base + "/api/trade/orders")).status, 401);
    assert.equal(
      (
        await post(
          "/login",
          { username: "buyer", password: "simple test phrase" },
          { Origin: "https://evil.invalid" },
        )
      ).status,
      403,
    );
    const login = await post("/login", {
      username: "buyer",
      password: "simple test phrase",
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get("set-cookie");
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
    const headers = { Cookie: cookie.split(";")[0] };
    assert.equal(
      (await fetch(base + "/api/trade/admin/members", { headers })).status,
      403,
    );
    const orderResponse = await post("/orders", f.order(), headers);
    assert.equal(orderResponse.status, 201);
    const o = (await orderResponse.json()).order;
    const s = await fetch(base + `/api/trade/orders/${o.id}/statement`, {
      headers,
    });
    assert.equal(s.status, 200);
    assert.match(s.headers.get("cache-control"), /no-store/);
    assert.equal((await fetch(base + "/trade/server/store.mjs")).status, 404);
    assert.equal(
      (await fetch(base + "/trade/.runtime/trade.sqlite")).status,
      404,
    );
    assert.equal((await fetch(base + "/trade/")).status, 200);
    assert.equal((await fetch(base + "/trade/admin")).status, 200);
    const missingStatement = await fetch(
      base + "/api/trade/orders/00000000-0000-0000-0000-000000000000/statement",
      { headers },
    );
    assert.equal(missingStatement.status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    f.cleanup();
  }
});

test("인증 앱 OTP는 RFC 6238 시간 검증을 따름", () => {
  assert.equal(
    verifyTotp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "287082", 59000),
    true,
  );
  assert.equal(
    verifyTotp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "000000", 59000),
    false,
  );
});

test("카탈로그 관리 동기화는 가격·예약 수량 보존, 신규 비활성, 삭제 비활성, 실패 시 유지", async () => {
  const f = fixture();
  try {
    const { store, admin, buyer } = f;
    store.createOrder(buyer, f.order());
    const data = {
      brands: [{ id: "test", name: "수정 브랜드" }],
      products: [
        {
          id: "p1",
          name: "수정 상품",
          model: "NEW",
          brand: "test",
          published: true,
          images: [],
        },
        {
          id: "p3",
          name: "새 상품",
          model: "N-3",
          brand: "test",
          published: true,
          images: [],
        },
      ],
    };
    const fetcher = async () =>
      new Response(JSON.stringify({ ok: true, data }));
    assert.equal((await syncCatalog(store, admin, fetcher)).imported, 2);
    const products = store.products(admin),
      p1 = products.find((p) => p.id === "p1"),
      p2 = products.find((p) => p.id === "p2"),
      p3 = products.find((p) => p.id === "p3");
    assert.equal(p1.price, 50000);
    assert.equal(p1.stock, 19);
    assert.equal(p1.name, "수정 상품");
    assert.equal(p2.enabled, false);
    assert.equal(p3.enabled, false);
    assert.equal(p3.price, null);
    await assert.rejects(syncCatalog(store, buyer, fetcher), /관리자/);
    await assert.rejects(
      syncCatalog(store, admin, async () => new Response("bad")),
      /유지/,
    );
    assert.equal(store.products(admin).find((p) => p.id === "p1").stock, 19);
    assert.equal(store.orders(buyer)[0].items[0].name, "<script>상품</script>");
    const reopen = openStore(f.filename, {
      catalogPath: resolve(root, "data/catalog.json"),
    });
    assert.equal(
      reopen.products(admin).find((p) => p.id === "p1").name,
      "수정 상품",
    );
    reopen.close();
  } finally {
    f.cleanup();
  }
});
