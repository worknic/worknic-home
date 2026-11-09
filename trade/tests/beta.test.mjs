import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "../server/store.mjs";
import {
  priceWorkbook,
  readPriceWorkbook,
  guardWorkbook,
} from "../server/pricing.mjs";
const registration = (name) => ({
  username: name,
  password: "test beta passphrase",
  companyName: "검증용 회사",
  businessNumber: "1234567891",
  contactName: "검증 담당자",
  phone: "010-0000-0000",
  email: name + "@example.invalid",
  postalCode: "11111",
  address: "검증 주소",
  consent: true,
});
function fixture(locationId = "pocheon_after_hours") {
  const dir = mkdtempSync(join(tmpdir(), "worknic-beta-"));
  let now = Date.UTC(2026, 10, 9, 11, 0); // Monday 20:00 KST, within the confirmed pickup window.
  const store = openStore(join(dir, "db.sqlite"), {
    clock: () => now,
    betaOptions: { pickupKey: "11".repeat(32) },
  });
  store.createAdmin("staff", "test staff passphrase");
  const admin = store.login("staff", "test staff passphrase");
  for (const name of ["buyer", "other"]) {
    store.register(registration(name));
    const m = store.members(admin).find((x) => x.username === name),
      r = store.beta.bindMember(admin, m.id, {
        id: "os-" + name,
        status: "approved",
        email: m.profile.email,
        businessNumber: m.profile.businessNumber,
        contactVerified: true,
      });
    store.beta.activate(r.token, "test beta passphrase");
  }
  const buyer = store.login("buyer", "test beta passphrase"),
    other = store.login("other", "test beta passphrase");
  store.seedCatalog({
    brands: [{ id: "test", name: "검증" }],
    products: [
      {
        id: "p1",
        name: "검증 상품",
        model: "T1",
        brand: "test",
        published: true,
        images: [],
      },
    ],
  });
  let p = store.products(admin)[0];
  store.updateStock(admin, p.id, {
    stock: 30,
    enabled: true,
    revision: p.revision,
  });
  store.beta.updateConfig(admin, {
    ...store.beta.config(),
    betaEnabled: true,
    registrationEnabled: true,
    documentsConfirmed: true,
  });
  const l = store.beta.locations().find((l) => l.id === locationId);
  store.beta.updateLocation(admin, l.id, {
    ...l,
    address: "검증 장소",
    hours: "검증 수령시간",
    noticeUrl: "https://example.invalid/notice",
    enabled: true,
    sourceVerified: true,
    fee: 0,
  });
  store.beta.saveSlot(admin, {
    id: "box1",
    locationId: l.id,
    label: "검증 보관함",
    enabled: true,
  });
  const row = {
    상품번호: "p1",
    옵션번호: "default",
    판매단위: "개",
    판매가: 11000,
    부가세기준: "포함",
    가격상태: "확정",
    적용일: new Date(now + 9 * 3600000).toISOString().slice(0, 10),
    수정번호: 0,
  };
  const price = () => store.beta.priceRows(admin)[0];
  const requested = () =>
    store.beta.createQuote(buyer, {
      requestKey: "request-key-" + now,
      items: [{ productId: "p1", optionId: "default", quantity: 2 }],
      locationId: l.id,
    });
  const issue = (q) =>
    store.beta.issueQuote(admin, q.id, {
      revision: q.revision,
      pickupFee: 0,
      conditionsConfirmed: true,
      expiresAt: now + 86400000,
    });
  const accept = (q) =>
    store.beta.acceptQuote(buyer, q.id, {
      revision: q.revision,
      acceptTerms: true,
    });
  return {
    store,
    admin,
    buyer,
    other,
    row,
    price,
    requested,
    issue,
    accept,
    now: () => now,
    advance: (ms) => (now += ms),
    filename: join(dir, "db.sqlite"),
    cleanup: () => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
test("엑셀 값·오류·중복·일괄 적용·복원·다른 수정 충돌", async () => {
  const f = fixture();
  try {
    let w = await priceWorkbook(f.store.beta.priceRows(f.admin)),
      rows = await readPriceWorkbook(w);
    assert.equal(rows[0]["상품번호"], "p1");
    assert.equal(rows[0]["판매가"], "");
    assert.throws(() => guardWorkbook(Buffer.alloc(10)), /엑셀|xlsx/);
    let bad = f.store.beta.previewPrices(f.admin, [{ ...f.row, 판매가: -1 }]);
    assert.equal(bad.invalid, 1);
    assert.throws(() => f.store.beta.applyPrices(f.admin, bad.id), /오류/);
    let dup = f.store.beta.previewPrices(f.admin, [f.row, f.row]);
    assert.equal(dup.invalid, 2);
    let p = f.store.beta.previewPrices(f.admin, [f.row]);
    assert.equal(f.price().price, null);
    f.store.beta.applyPrices(f.admin, p.id);
    assert.equal(f.price().price, 11000);
    assert.throws(() => f.store.beta.applyPrices(f.admin, p.id), /만료/);
    f.store.beta.restorePrices(f.admin, p.id);
    assert.equal(f.price().price, null);
    let p1 = f.store.beta.previewPrices(f.admin, [
      { ...f.row, 수정번호: f.price().revision },
    ]);
    let p2 = f.store.beta.previewPrices(f.admin, [
      { ...f.row, 수정번호: f.price().revision, 판매가: 22000 },
    ]);
    f.store.beta.applyPrices(f.admin, p2.id);
    assert.throws(() => f.store.beta.applyPrices(f.admin, p1.id), /변경/);
    assert.throws(() => f.store.beta.previewPrices(f.buyer, [f.row]), /관리자/);
  } finally {
    f.cleanup();
  }
});
test("승인과 계정 확인·견적 발행 전 가격 숨김·견적 수락 후 문서 금액 고정", () => {
  const f = fixture();
  try {
    f.store.register(registration("pending"));
    let pending = f.store.login("pending", "test beta passphrase");
    assert.throws(() => f.store.beta.catalog(pending), /승인/);
    const preview = f.store.beta.previewPrices(f.admin, [f.row]);
    f.store.beta.applyPrices(f.admin, preview.id);
    assert.ok(!("price" in f.store.beta.catalog(f.buyer)[0]));
    const request = f.requested();
    assert.ok(!request.total);
    assert.throws(() => f.store.beta.quote(f.other, request.id), /찾을/);
    const q = f.issue(request);
    assert.equal(q.total, 22000);
    const next = f.store.beta.previewPrices(f.admin, [
      { ...f.row, 수정번호: 1, 판매가: 33000 },
    ]);
    f.store.beta.applyPrices(f.admin, next.id);
    const order = f.accept(q);
    assert.equal(order.total, 22000);
    assert.equal(
      f.store.beta.acceptQuote(f.buyer, q.id, { acceptTerms: true }).id,
      order.id,
    );
    assert.equal(f.store.products(f.admin)[0].stock, 28);
  } finally {
    f.cleanup();
  }
});
test("픽업 입금·보관함 충돌·기간·고객 격리·암호화·실제 코드 폐기 확인", () => {
  const f = fixture();
  try {
    f.store.beta.applyPrices(
      f.admin,
      f.store.beta.previewPrices(f.admin, [f.row]).id,
    );
    const order = f.accept(f.issue(f.requested()));
    const ready = {
      revision: 1,
      slotId: "box1",
      pin: "91827364",
      availableFrom: f.now(),
      availableUntil: f.now() + 3600000,
      staged: true,
      physicalCodeConfigured: true,
    };
    assert.throws(
      () => f.store.beta.readyPickup(f.admin, order.id, ready),
      /입금/,
    );
    let paid = f.store.updateOrder(f.admin, order.id, {
      action: "confirm_payment",
      revision: 1,
      amount: 22000,
      reference: "검증 입금",
      bankChecked: true,
    });
    assert.throws(
      () =>
        f.store.beta.readyPickup(f.admin, order.id, {
          ...ready,
          revision: paid.revision,
          availableFrom: f.now(),
          availableUntil: f.now(),
        }),
      /수령 기간/,
    );
    const pickup = f.store.beta.readyPickup(f.admin, order.id, {
      ...ready,
      revision: paid.revision,
    });
    assert.throws(() => f.store.beta.revealPin(f.other, order.id), /찾을/);
    assert.equal(f.store.beta.revealPin(f.buyer, order.id).pin, "91827364");
    assert.equal(
      readFileSync(f.filename).includes(Buffer.from("91827364")),
      false,
    );
    f.store.beta.reportPickup(f.buyer, order.id, {
      revision: pickup.revision,
      received: true,
    });
    assert.throws(() => f.store.beta.revealPin(f.buyer, order.id), /준비 완료/);
    assert.throws(
      () =>
        f.store.beta.saveSlot(f.admin, {
          id: "box1",
          locationId: "pocheon_after_hours",
          label: "수정",
          enabled: true,
        }),
      /사용 중/,
    );
    assert.throws(
      () =>
        f.store.beta.closePickup(f.admin, order.id, {
          revision: 2,
          result: "collected",
          physicalCodeRevoked: false,
          compartmentChecked: true,
        }),
      /폐기/,
    );
    f.store.beta.closePickup(f.admin, order.id, {
      revision: 2,
      result: "collected",
      physicalCodeRevoked: true,
      compartmentChecked: true,
    });
    assert.equal(f.store.order(f.buyer, order.id).status, "collected");
  } finally {
    f.cleanup();
  }
});
test("공통 가격 미정에서도 업체별 견적 단가를 격리하고 기존 주문을 보존", () => {
  const f = fixture();
  try {
    const q1 = f.requested(),
      q2 = f.store.beta.createQuote(f.other, {
        requestKey: "individual-other-0001",
        locationId: "pocheon_after_hours",
        items: [{ productId: "p1", optionId: "default", quantity: 2 }],
      });
    const input = (q, amount) => ({
      revision: q.revision,
      pickupFee: 0,
      conditionsConfirmed: true,
      expiresAt: f.now() + 86400000,
      items: [
        {
          productId: "p1",
          optionId: "default",
          unitPrice: amount,
          unit: "세트",
          taxMode: "포함",
        },
      ],
    });
    assert.throws(
      () => f.store.beta.issueQuote(f.buyer, q1.id, input(q1, 11000)),
      /관리자/,
    );
    assert.throws(
      () =>
        f.store.beta.issueQuote(f.admin, q1.id, {
          ...input(q1, 11000),
          items: [],
        }),
      /단가/,
    );
    assert.throws(
      () => f.store.beta.issueQuote(f.admin, q1.id, input(q1, 0)),
      /단가/,
    );
    assert.throws(
      () =>
        f.store.beta.issueQuote(f.admin, q1.id, {
          ...input(q1, 11000),
          pickupFee: 5000,
        }),
      /무료/,
    );
    const issued1 = f.store.beta.issueQuote(f.admin, q1.id, input(q1, 11000));
    const issued2 = f.store.beta.issueQuote(f.admin, q2.id, input(q2, 16500));
    assert.equal(issued1.total, 22000);
    assert.equal(issued2.total, 33000);
    assert.equal(issued1.items[0].priceSource, "individual_quote");
    assert.equal(f.price().price, null);
    assert.throws(() => f.store.beta.quote(f.other, q1.id), /찾을/);
    const order = f.accept(issued1);
    f.store.beta.applyPrices(
      f.admin,
      f.store.beta.previewPrices(f.admin, [f.row]).id,
    );
    assert.equal(f.price().price, 11000);
    assert.throws(
      () =>
        f.store.beta.markAllPricesUndetermined(f.buyer, { confirmed: true }),
      /관리자/,
    );
    assert.throws(
      () => f.store.beta.markAllPricesUndetermined(f.admin, {}),
      /확인/,
    );
    f.store.beta.markAllPricesUndetermined(f.admin, { confirmed: true });
    assert.equal(f.price().price, null);
    assert.equal(f.store.order(f.buyer, order.id).total, 22000);
    assert.equal(f.store.beta.quote(f.other, q2.id).total, 33000);
    assert.equal(f.store.products(f.admin)[0].stock, 28);
  } finally {
    f.cleanup();
  }
});
test("진접 대면 전달은 비밀번호·보관함 없이 입금·요일·시간·수령자를 확인", () => {
  const f = fixture("jinjeop");
  try {
    const request = f.requested(),
      quote = f.store.beta.issueQuote(f.admin, request.id, {
        revision: request.revision,
        pickupFee: 0,
        conditionsConfirmed: true,
        expiresAt: f.now() + 86400000,
        items: [
          {
            productId: "p1",
            optionId: "default",
            unitPrice: 11000,
            unit: "개",
            taxMode: "포함",
          },
        ],
      });
    const order = f.accept(quote);
    assert.equal(order.fulfillment.handover, "handoff");
    const ready = {
      revision: order.revision,
      meetingPoint: "진접중학교 정문 앞 검수 지점",
      staffContact: "합성 담당자 · 010-0000-0000",
      availableFrom: f.now(),
      availableUntil: f.now() + 3600000,
      staged: true,
      staffConfirmed: true,
    };
    assert.throws(
      () => f.store.beta.readyHandoff(f.admin, order.id, ready),
      /입금/,
    );
    const paid = f.store.updateOrder(f.admin, order.id, {
      revision: order.revision,
      action: "confirm_payment",
      amount: 22000,
      reference: "합성 확인",
      bankChecked: true,
    });
    ready.revision = paid.revision;
    assert.throws(
      () =>
        f.store.beta.readyPickup(f.admin, order.id, {
          revision: paid.revision,
          slotId: "box1",
        }),
      /대면 전달/,
    );
    assert.throws(
      () =>
        f.store.beta.readyHandoff(f.admin, order.id, {
          ...ready,
          availableFrom: f.now() + 5 * 86400000,
          availableUntil: f.now() + 5 * 86400000 + 3600000,
        }),
      /월~금/,
    );
    assert.throws(
      () =>
        f.store.beta.readyHandoff(f.admin, order.id, {
          ...ready,
          staffContact: "",
        }),
      /담당자/,
    );
    f.store.beta.readyHandoff(f.admin, order.id, ready);
    const p = f.store.beta.pickup(f.buyer, order.id);
    assert.equal(p.mode, "handoff");
    assert.equal(p.slotId, undefined);
    assert.equal(p.pinDigest, undefined);
    assert.throws(() => f.store.beta.pickup(f.other, order.id), /찾을/);
    assert.throws(() => f.store.beta.revealPin(f.buyer, order.id), /비밀번호/);
    assert.throws(
      () => f.store.beta.readyHandoff(f.admin, order.id, ready),
      /입금|이미/,
    );
    assert.throws(
      () =>
        f.store.beta.closeHandoff(f.admin, order.id, {
          revision: p.revision,
          result: "collected",
        }),
      /확인/,
    );
    f.store.beta.reportPickup(f.buyer, order.id, {
      revision: p.revision,
      received: true,
    });
    assert.equal(f.store.order(f.buyer, order.id).status, "pickup_reported");
    f.store.beta.closeHandoff(f.admin, order.id, {
      revision: p.revision + 1,
      result: "collected",
      recipientChecked: true,
    });
    assert.equal(f.store.order(f.buyer, order.id).status, "collected");
    assert.equal(f.store.beta.pickup(f.buyer, order.id), null);
    assert.throws(
      () =>
        f.store.beta.closeHandoff(f.admin, order.id, {
          revision: p.revision + 1,
          result: "collected",
          recipientChecked: true,
        }),
      /확인/,
    );
  } finally {
    f.cleanup();
  }
});
test("미입금 취소는 자기 주문만 한 번 처리하고 예약 재고를 반환", () => {
  const f = fixture();
  try {
    f.store.beta.applyPrices(
      f.admin,
      f.store.beta.previewPrices(f.admin, [f.row]).id,
    );
    const o = f.accept(f.issue(f.requested()));
    assert.equal(f.store.products(f.admin)[0].stock, 28);
    assert.throws(
      () =>
        f.store.beta.cancelUnpaid(f.other, o.id, {
          revision: 1,
          noPaymentSent: true,
        }),
      /찾을/,
    );
    assert.throws(
      () => f.store.beta.cancelUnpaid(f.buyer, o.id, { revision: 1 }),
      /입금/,
    );
    assert.equal(
      f.store.beta.cancelUnpaid(f.buyer, o.id, {
        revision: 1,
        noPaymentSent: true,
      }).status,
      "cancelled",
    );
    assert.equal(f.store.products(f.admin)[0].stock, 30);
    assert.throws(
      () =>
        f.store.beta.cancelUnpaid(f.buyer, o.id, {
          revision: 1,
          noPaymentSent: true,
        }),
      /변경/,
    );
    assert.equal(f.store.products(f.admin)[0].stock, 30);
  } finally {
    f.cleanup();
  }
});
test("전액 환불은 수령·코드 열람을 보류하고 실제 송금·실물 확인 후 한 번만 재고 복원", () => {
  const f = fixture();
  try {
    f.store.beta.applyPrices(
      f.admin,
      f.store.beta.previewPrices(f.admin, [f.row]).id,
    );
    const o = f.accept(f.issue(f.requested()));
    const paid = f.store.updateOrder(f.admin, o.id, {
      revision: 1,
      action: "confirm_payment",
      amount: 22000,
      reference: "합성 입금",
      bankChecked: true,
    });
    assert.throws(
      () =>
        f.store.beta.cancelUnpaid(f.buyer, o.id, {
          revision: paid.revision,
          noPaymentSent: true,
        }),
      /환불/,
    );
    f.store.beta.readyPickup(f.admin, o.id, {
      revision: paid.revision,
      slotId: "box1",
      pin: "1122334455",
      availableFrom: f.now(),
      availableUntil: f.now() + 3600000,
      staged: true,
      physicalCodeConfigured: true,
    });
    const input = {
      requestKey: "refund-test-0000001",
      reason: "합성 취소 요청",
    };
    const r = f.store.beta.requestRefund(f.buyer, o.id, input);
    assert.equal(f.store.beta.requestRefund(f.buyer, o.id, input).id, r.id);
    assert.throws(
      () =>
        f.store.beta.requestRefund(f.other, o.id, {
          ...input,
          requestKey: "refund-test-0000002",
        }),
      /찾을/,
    );
    assert.equal(f.store.beta.refunds(f.other).length, 0);
    assert.throws(() => f.store.beta.revealPin(f.buyer, o.id), /검토/);
    assert.throws(
      () =>
        f.store.beta.reportPickup(f.buyer, o.id, {
          revision: 1,
          received: true,
        }),
      /검토/,
    );
    assert.throws(
      () =>
        f.store.beta.reviewRefund(f.buyer, r.id, {
          revision: 1,
          decision: "approve",
        }),
      /관리자/,
    );
    const review = {
      revision: r.revision,
      decision: "approve",
      amount: 22000,
      note: "취소 검토 승인",
      fulfillmentStopped: true,
    };
    assert.throws(
      () =>
        f.store.beta.reviewRefund(f.admin, r.id, { ...review, amount: 11000 }),
      /전액/,
    );
    assert.throws(
      () =>
        f.store.beta.reviewRefund(f.admin, r.id, {
          ...review,
          fulfillmentStopped: false,
        }),
      /중단/,
    );
    const approved = f.store.beta.reviewRefund(f.admin, r.id, review);
    assert.equal(f.store.beta.pickup(f.buyer, o.id), null);
    assert.equal(f.store.products(f.admin)[0].stock, 28);
    const complete = {
      revision: approved.revision,
      amount: 22000,
      bankReference: "합성 환불 확인",
      bankRefundChecked: true,
      restockAll: true,
      goodsRecovered: true,
    };
    assert.throws(
      () =>
        f.store.beta.completeRefund(f.admin, r.id, {
          ...complete,
          bankRefundChecked: false,
        }),
      /송금/,
    );
    assert.throws(
      () =>
        f.store.beta.completeRefund(f.admin, r.id, { ...complete, amount: 1 }),
      /송금/,
    );
    assert.throws(
      () =>
        f.store.beta.completeRefund(f.admin, r.id, {
          ...complete,
          goodsRecovered: false,
        }),
      /회수/,
    );
    f.store.beta.completeRefund(f.admin, r.id, complete);
    f.store.beta.completeRefund(f.admin, r.id, complete);
    assert.equal(f.store.products(f.admin)[0].stock, 30);
    assert.equal(f.store.order(f.buyer, o.id).status, "refunded");
    assert.equal(f.store.order(f.buyer, o.id).total, 22000);
    assert.equal(f.store.beta.refunds(f.buyer)[0].bankReference, undefined);
  } finally {
    f.cleanup();
  }
});
test("수령 후 부분 환불은 누적 입금액을 넘지 않으며 자동 재고 복원 없이 기록", () => {
  const f = fixture();
  try {
    f.store.beta.applyPrices(
      f.admin,
      f.store.beta.previewPrices(f.admin, [f.row]).id,
    );
    const o = f.accept(f.issue(f.requested())),
      paid = f.store.updateOrder(f.admin, o.id, {
        revision: 1,
        action: "confirm_payment",
        amount: 22000,
        reference: "합성",
        bankChecked: true,
      });
    f.store.beta.readyPickup(f.admin, o.id, {
      revision: paid.revision,
      slotId: "box1",
      pin: "9933445511",
      availableFrom: f.now(),
      availableUntil: f.now() + 3600000,
      staged: true,
      physicalCodeConfigured: true,
    });
    f.store.beta.closePickup(f.admin, o.id, {
      revision: 1,
      result: "collected",
      physicalCodeRevoked: true,
      compartmentChecked: true,
    });
    let r = f.store.beta.requestRefund(f.admin, o.id, {
      requestKey: "partial-refund-00001",
      reason: "전화 접수 합성",
      customerRequested: true,
    });
    r = f.store.beta.reviewRefund(f.admin, r.id, {
      revision: r.revision,
      decision: "reject",
      note: "합성 반려",
    });
    assert.equal(f.store.beta.hasRefundHold(o.id), false);
    r = f.store.beta.requestRefund(f.buyer, o.id, {
      requestKey: "partial-refund-00002",
      reason: "부분 반품",
    });
    r = f.store.beta.reviewRefund(f.admin, r.id, {
      revision: r.revision,
      decision: "approve",
      note: "부분 반품 확인",
      amount: 5000,
      fulfillmentStopped: true,
    });
    assert.throws(
      () =>
        f.store.beta.completeRefund(f.admin, r.id, {
          revision: r.revision,
          amount: 5000,
          bankReference: "합성",
          bankRefundChecked: true,
          restockAll: true,
          goodsRecovered: true,
        }),
      /전액/,
    );
    f.store.beta.completeRefund(f.admin, r.id, {
      revision: r.revision,
      amount: 5000,
      bankReference: "합성",
      bankRefundChecked: true,
    });
    assert.equal(f.store.products(f.admin)[0].stock, 28);
    assert.equal(f.store.order(f.buyer, o.id).status, "collected");
    r = f.store.beta.requestRefund(f.buyer, o.id, {
      requestKey: "partial-refund-00003",
      reason: "잔액 검수",
    });
    assert.throws(
      () =>
        f.store.beta.reviewRefund(f.admin, r.id, {
          revision: r.revision,
          decision: "approve",
          note: "초과 검수",
          amount: 18000,
          fulfillmentStopped: true,
        }),
      /잔액/,
    );
    r = f.store.beta.reviewRefund(f.admin, r.id, {
      revision: r.revision,
      decision: "approve",
      note: "잔액 확인",
      amount: 17000,
      fulfillmentStopped: true,
    });
    f.store.beta.completeRefund(f.admin, r.id, {
      revision: r.revision,
      amount: 17000,
      bankReference: "합성",
      bankRefundChecked: true,
    });
    assert.equal(f.store.order(f.buyer, o.id).status, "refunded");
    assert.equal(f.store.products(f.admin)[0].stock, 28);
  } finally {
    f.cleanup();
  }
});
test("분실 복구는 계정 존재 비노출·관리자 본인 확인·일회용 만료·기존 세션 폐기", () => {
  const f = fixture();
  try {
    const known = f.store.beta.requestRecovery({
        username: "buyer",
        email: "buyer@example.invalid",
      }),
      unknown = f.store.beta.requestRecovery({
        username: "missing",
        email: "nobody@example.invalid",
      });
    assert.deepEqual(known, unknown);
    assert.throws(() => f.store.beta.recoveryRequests(f.buyer), /관리자/);
    const request = f.store.beta.recoveryRequests(f.admin)[0];
    assert.throws(
      () => f.store.beta.issueRecovery(f.admin, request.id, {}),
      /본인 확인/,
    );
    assert.throws(
      () =>
        f.store.beta.issueRecovery(f.admin, request.id, {
          contactVerified: true,
          osRequestId: "wrong",
        }),
      /대조/,
    );
    const first = f.store.beta.issueRecovery(f.admin, request.id, {
      contactVerified: true,
      osRequestId: "os-buyer",
    });
    const second = f.store.beta.issueRecovery(f.admin, request.id, {
      contactVerified: true,
      osRequestId: "os-buyer",
    });
    assert.throws(
      () => f.store.beta.resetPassword(first.token, "new synthetic password"),
      /만료|올바르/,
    );
    const session = f.store.session(f.buyer);
    assert.ok(f.store.authenticate(session.token));
    f.store.beta.resetPassword(second.token, "new synthetic password");
    assert.equal(f.store.authenticate(session.token), null);
    assert.throws(
      () =>
        f.store.beta.resetPassword(second.token, "another synthetic password"),
      /만료|올바르/,
    );
    assert.equal(
      f.store.login("buyer", "new synthetic password").id,
      f.buyer.id,
    );
    assert.throws(
      () => f.store.login("buyer", "test beta passphrase"),
      /비밀번호|아이디/,
    );
    assert.equal(f.store.beta.recoveryRequests(f.admin)[0].status, "resolved");
    assert.equal(f.store.beta.binding(f.buyer).activated, 1);
    f.store.beta.requestRecovery({
      username: "buyer",
      email: "buyer@example.invalid",
    });
    const next = f.store.beta
      .recoveryRequests(f.admin)
      .find((r) => r.status === "requested");
    const expired = f.store.beta.issueRecovery(f.admin, next.id, {
      contactVerified: true,
      osRequestId: "os-buyer",
    });
    f.advance(30 * 60000 + 1);
    assert.throws(
      () =>
        f.store.beta.resetPassword(expired.token, "final synthetic password"),
      /만료|올바르/,
    );
  } finally {
    f.cleanup();
  }
});
test("송금 전 승인 철회 후 진접 대면 전달을 새로 준비할 수 있음", () => {
  const f = fixture("jinjeop");
  try {
    f.store.beta.applyPrices(
      f.admin,
      f.store.beta.previewPrices(f.admin, [f.row]).id,
    );
    const o = f.accept(f.issue(f.requested())),
      paid = f.store.updateOrder(f.admin, o.id, {
        revision: 1,
        action: "confirm_payment",
        amount: 22000,
        reference: "합성",
        bankChecked: true,
      });
    const ready = {
      revision: paid.revision,
      meetingPoint: "합성 지점",
      staffContact: "합성 연락처",
      availableFrom: f.now(),
      availableUntil: f.now() + 3600000,
      staged: true,
      staffConfirmed: true,
    };
    f.store.beta.readyHandoff(f.admin, o.id, ready);
    let r = f.store.beta.requestRefund(f.buyer, o.id, {
      requestKey: "withdraw-refund-0001",
      reason: "검토 요청",
    });
    r = f.store.beta.reviewRefund(f.admin, r.id, {
      revision: r.revision,
      decision: "approve",
      amount: 22000,
      note: "합성 승인",
      fulfillmentStopped: true,
    });
    assert.throws(
      () =>
        f.store.beta.reviewRefund(f.admin, r.id, {
          revision: r.revision,
          decision: "reject",
          note: "철회",
        }),
      /상태/,
    );
    f.store.beta.reviewRefund(f.admin, r.id, {
      revision: r.revision,
      decision: "reject",
      note: "송금 전 철회",
      bankNotSent: true,
    });
    assert.equal(f.store.beta.hasRefundHold(o.id), false);
    const resumed = f.store.order(f.admin, o.id);
    assert.equal(resumed.status, "preparing");
    f.store.beta.readyHandoff(f.admin, o.id, {
      ...ready,
      revision: resumed.revision,
    });
    assert.equal(f.store.beta.pickup(f.buyer, o.id).mode, "handoff");
  } finally {
    f.cleanup();
  }
});
test("취소 기준 확정은 접수·가격·재고를 변경하지 않고 일반 설정 저장에도 보존", () => {
  const f = fixture();
  try {
    const before = f.store.beta.config(),
      stock = f.store.products(f.admin)[0].stock;
    assert.equal(
      f.store.beta.runtime().policies.standardPreReceiptCancellation,
      null,
    );
    assert.throws(
      () =>
        f.store.beta.confirmStandardCancellation(f.buyer, {
          revision: before.revision,
          value: "full_refund",
          confirmed: true,
        }),
      /관리자/,
    );
    assert.throws(
      () =>
        f.store.beta.confirmStandardCancellation(f.admin, {
          revision: before.revision,
          value: "other",
          confirmed: true,
        }),
      /확인/,
    );
    const saved = f.store.beta.confirmStandardCancellation(f.admin, {
      revision: before.revision,
      value: "full_refund",
      confirmed: true,
    });
    assert.equal(saved.standardPreReceiptCancellation.scope, "standard_stock");
    assert.equal(saved.betaEnabled, before.betaEnabled);
    assert.equal(saved.registrationEnabled, before.registrationEnabled);
    assert.equal(saved.documentsConfirmed, before.documentsConfirmed);
    assert.equal(f.price().price, null);
    assert.equal(f.store.products(f.admin)[0].stock, stock);
    assert.throws(
      () =>
        f.store.beta.confirmStandardCancellation(f.admin, {
          revision: before.revision,
          value: "full_refund",
          confirmed: true,
        }),
      /변경/,
    );
    f.store.beta.updateConfig(f.admin, {
      ...saved,
      betaEnabled: false,
      registrationEnabled: false,
    });
    assert.equal(
      f.store.beta.config().standardPreReceiptCancellation.value,
      "full_refund",
    );
    assert.match(
      f.store.beta.runtime().policies.standardPreReceiptCancellation,
      /일반 재고 상품/,
    );
    assert.equal(
      f.store.beta
        .runtime()
        .policies.standardPreReceiptCancellation.includes("confirmedBy"),
      false,
    );
  } finally {
    f.cleanup();
  }
});
test("견적 유효기간·미정 가격 차단", () => {
  const f = fixture();
  try {
    assert.throws(() => f.issue(f.requested()), /확정/);
    f.advance(1);
    f.store.beta.applyPrices(
      f.admin,
      f.store.beta.previewPrices(f.admin, [f.row]).id,
    );
    const q = f.issue(f.requested());
    f.advance(86400001);
    assert.throws(() => f.accept(q), /만료/);
  } finally {
    f.cleanup();
  }
});
test("옵션 수량을 분리하고 기한 만료 시 해당 옵션에 한 번만 복원", () => {
  const f = fixture();
  try {
    f.store.seedCatalog({
      brands: [{ id: "test", name: "검증" }],
      products: [
        {
          id: "v1",
          name: "옵션 검증",
          brand: "test",
          published: true,
          images: [],
          variants: [
            { sourceId: "small", name: "소형" },
            { sourceId: "large", name: "대형" },
          ],
        },
      ],
    });
    for (const o of ["small", "large"])
      f.store.beta.updateInventory(f.admin, "v1", {
        optionId: o,
        stock: o === "small" ? 2 : 9,
        enabled: true,
        revision: 0,
      });
    const row = { ...f.row, 상품번호: "v1", 옵션번호: "small" };
    f.store.beta.applyPrices(
      f.admin,
      f.store.beta.previewPrices(f.admin, [row]).id,
    );
    let q = f.store.beta.createQuote(f.buyer, {
      requestKey: "variant-request-0001",
      locationId: "pocheon_after_hours",
      items: [{ productId: "v1", optionId: "small", quantity: 2 }],
    });
    q = f.issue(q);
    const order = f.accept(q);
    let inventory = f.store.beta.inventory(f.admin);
    assert.equal(inventory.find((p) => p.optionId === "small").stock, 0);
    assert.equal(inventory.find((p) => p.optionId === "large").stock, 9);
    f.advance(4 * 86400000);
    f.store.expireOrders();
    f.store.expireOrders();
    inventory = f.store.beta.inventory(f.admin);
    assert.equal(inventory.find((p) => p.optionId === "small").stock, 2);
    assert.equal(f.store.order(f.buyer, order.id).status, "expired");
    const second = f.issue(
      f.store.beta.createQuote(f.buyer, {
        requestKey: "variant-request-0002",
        locationId: "pocheon_after_hours",
        items: [{ productId: "v1", optionId: "small", quantity: 1 }],
      }),
    );
    f.store.seedCatalog({
      brands: [{ id: "test", name: "검증" }],
      products: [],
    });
    assert.throws(() => f.accept(second), /공개/);
    assert.equal(f.store.beta.priceRows(f.admin).length, 0);
  } finally {
    f.cleanup();
  }
});
test("픽업 비밀번호 기간 밖 접근·만료 보관함 재사용 차단·WAL 평문 비노출", () => {
  const f = fixture();
  try {
    f.store.beta.applyPrices(
      f.admin,
      f.store.beta.previewPrices(f.admin, [f.row]).id,
    );
    const o = f.accept(f.issue(f.requested())),
      paid = f.store.updateOrder(f.admin, o.id, {
        action: "confirm_payment",
        revision: 1,
        amount: 22000,
        reference: "검증",
        bankChecked: true,
      });
    f.store.beta.readyPickup(f.admin, o.id, {
      revision: paid.revision,
      slotId: "box1",
      pin: "7755331199",
      availableFrom: f.now() + 10000,
      availableUntil: f.now() + 60000,
      staged: true,
      physicalCodeConfigured: true,
    });
    assert.throws(() => f.store.beta.revealPin(f.buyer, o.id), /수령 기간/);
    for (const path of [f.filename, f.filename + "-wal"])
      assert.equal(
        readFileSync(path).includes(Buffer.from("7755331199")),
        false,
      );
    f.advance(60001);
    assert.equal(
      f.store.beta.pickup(f.buyer, o.id).status,
      "expired_reset_required",
    );
    assert.throws(() => f.store.beta.revealPin(f.buyer, o.id), /수령 기간/);
    assert.throws(
      () =>
        f.store.beta.saveSlot(f.admin, {
          id: "box1",
          locationId: "pocheon_after_hours",
          label: "다른 주문",
          enabled: true,
        }),
      /사용 중/,
    );
    f.store.beta.closePickup(f.admin, o.id, {
      revision: 1,
      result: "not_collected",
      physicalCodeRevoked: true,
      compartmentChecked: true,
    });
    assert.equal(f.store.order(f.buyer, o.id).status, "pickup_exception");
  } finally {
    f.cleanup();
  }
});

