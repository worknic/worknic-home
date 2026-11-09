import { randomUUID, createHash } from "node:crypto";
import { TradeError } from "./store.mjs";
const fail = (message, status = 400) => {
  throw new TradeError(message, status);
};
const text = (value, max = 500) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
export function installAftercare(
  api,
  db,
  { clock, transaction, audit, adminOnly, customerOnly, release },
) {
  db.exec(`CREATE TABLE IF NOT EXISTS beta_refunds(id TEXT PRIMARY KEY,order_id TEXT NOT NULL,member_id TEXT NOT NULL,request_key TEXT NOT NULL,status TEXT NOT NULL,value TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,UNIQUE(member_id,request_key));
    CREATE UNIQUE INDEX IF NOT EXISTS beta_refund_open ON beta_refunds(order_id) WHERE status IN ('requested','approved');
    CREATE TABLE IF NOT EXISTS beta_refund_stock(order_id TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS beta_recovery_requests(id TEXT PRIMARY KEY,member_id TEXT NOT NULL,status TEXT NOT NULL,created_at INTEGER NOT NULL,reviewed_at INTEGER);
    CREATE TABLE IF NOT EXISTS beta_procurement(order_id TEXT PRIMARY KEY,value TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS beta_receipts(order_id TEXT PRIMARY KEY,received_on TEXT NOT NULL,verified_at INTEGER NOT NULL,verified_by TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1);
    CREATE UNIQUE INDEX IF NOT EXISTS beta_recovery_open ON beta_recovery_requests(member_id) WHERE status='requested';`);
  const own = (actor, member) => {
    if (actor.role !== "admin" && actor.id !== member)
      fail("해당 내역을 찾을 수 없습니다.", 404);
  };
  const order = (actor, id) => {
    const r = db.prepare("SELECT * FROM orders WHERE id=?").get(id);
    if (!r) fail("주문을 찾을 수 없습니다.", 404);
    own(actor, r.member_id);
    return {
      ...r,
      snapshot: JSON.parse(r.snapshot),
      payment: r.payment ? JSON.parse(r.payment) : null,
    };
  };
  const refund = (actor, id) => {
    const r = db.prepare("SELECT * FROM beta_refunds WHERE id=?").get(id);
    if (!r) fail("환불 요청을 찾을 수 없습니다.", 404);
    own(actor, r.member_id);
    const value = JSON.parse(r.value);
    if (
      r.status === "requested" &&
      value.reasonType === "change_of_mind" &&
      value.originalStatus === "collected"
    )
      value.returnWindow = returnWindow(actor, r.order_id, value.requestedAt);
    if (actor.role !== "admin") {
      delete value.bankReference;
      delete value.recipientCheck;
    }
    return {
      ...value,
      id: r.id,
      orderId: r.order_id,
      memberId: r.member_id,
      status: r.status,
      revision: r.revision,
    };
  };
  const refunded = (id) =>
    db
      .prepare(
        "SELECT value FROM beta_refunds WHERE order_id=? AND status='completed'",
      )
      .all(id)
      .reduce((sum, r) => sum + JSON.parse(r.value).amount, 0);
  const generic = {
    ok: true,
    message:
      "입력 정보가 등록 정보와 일치하면 담당자가 본인 확인 후 안내합니다.",
  };
  const returnWindow = (actor, id, at = clock()) => {
    const o = order(actor, id);
    if (o.snapshot.specialOrder) return null;
    const config = JSON.parse(
      db.prepare("SELECT value FROM beta_config WHERE id=1").get().value,
    );
    const days =
      o.snapshot.standardReturnDays || config.standardReturnPeriod?.days;
    if (days !== 7) return null;
    const r = db
        .prepare("SELECT * FROM beta_receipts WHERE order_id=?")
        .get(id),
      legacy = !o.snapshot.standardReturnDays;
    if (!r)
      return { days: 7, status: "receipt_unknown", legacy, receiptRevision: 0 };
    if (legacy)
      return {
        days: null,
        status: "legacy_terms_review",
        legacy: true,
        receivedOn: r.received_on,
        receiptRevision: r.revision,
      };
    const deadlineExclusive =
      Date.parse(r.received_on + "T00:00:00+09:00") + 8 * 86400000;
    return {
      days: 7,
      status: at < deadlineExclusive ? "within_period" : "period_elapsed",
      legacy,
      receivedOn: r.received_on,
      deadlineExclusive,
      receiptRevision: r.revision,
    };
  };
  return {
    returnWindow,
    confirmReceiptDate(actor, id, input) {
      adminOnly(actor);
      return transaction(() => {
        const o = order(actor, id),
          old = db
            .prepare("SELECT * FROM beta_receipts WHERE order_id=?")
            .get(id),
          day = text(input.receivedOn, 10);
        if (
          o.status !== "collected" ||
          input.actualReceiptVerified !== true ||
          input.orderRevision !== o.revision ||
          (old?.revision || 0) !== input.receiptRevision
        )
          fail(
            "실제 수령 완료 주문과 수령일 확인 상태를 다시 확인해 주세요.",
            409,
          );
        const n = Date.parse(day + "T00:00:00Z");
        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
          !Number.isFinite(n) ||
          new Date(n).toISOString().slice(0, 10) !== day ||
          day > new Date(clock() + 9 * 3600000).toISOString().slice(0, 10) ||
          day < new Date(o.created_at + 9 * 3600000).toISOString().slice(0, 10)
        )
          fail(
            "주문일 이후의 실제 수령일을 입력해 주세요. 미래 날짜는 사용할 수 없습니다.",
          );
        db.prepare(
          "INSERT INTO beta_receipts VALUES(?,?,?,?,1) ON CONFLICT(order_id) DO UPDATE SET received_on=excluded.received_on,verified_at=excluded.verified_at,verified_by=excluded.verified_by,revision=beta_receipts.revision+1",
        ).run(id, day, clock(), actor.username);
        audit(actor, "receipt.date_confirmed", id, {
          receivedOn: day,
          previous: old?.received_on || null,
        });
        return returnWindow(actor, id);
      });
    },
    procurementStage(actor, id) {
      const o = order(actor, id);
      if (!o.snapshot.specialOrder) return null;
      const r = db
        .prepare("SELECT * FROM beta_procurement WHERE order_id=?")
        .get(id);
      if (!r) return { state: "not_started", revision: 0 };
      const value = JSON.parse(r.value);
      return actor.role === "admin"
        ? { ...value, revision: r.revision }
        : {
            state: value.state,
            startedAt: value.startedAt,
            revision: r.revision,
          };
    },
    markSpecialStarted(actor, id, input) {
      adminOnly(actor);
      return transaction(() => {
        const o = order(actor, id),
          r = db
            .prepare("SELECT * FROM beta_procurement WHERE order_id=?")
            .get(id);
        if (
          !o.snapshot.specialOrder ||
          !["paid", "preparing"].includes(o.status) ||
          o.revision !== input.orderRevision ||
          r
        )
          fail(
            "입금 확인된 특수 상품의 제작·발주 전 주문 상태를 확인해 주세요.",
            409,
          );
        if (
          db
            .prepare(
              "SELECT id FROM beta_refunds WHERE order_id=? AND status IN ('requested','approved')",
            )
            .get(id)
        )
          fail("취소·환불 검토 중에는 제작·발주를 시작할 수 없습니다.", 409);
        if (input.actualStartConfirmed !== true || !text(input.reference, 100))
          fail("실제 제작·발주 시작과 내부 확인번호를 입력해 주세요.");
        db.prepare("INSERT INTO beta_procurement VALUES(?,?,1)").run(
          id,
          JSON.stringify({
            state: "started",
            startedAt: clock(),
            startedBy: actor.username,
            reference: text(input.reference, 100),
          }),
        );
        db.prepare("UPDATE orders SET revision=revision+1 WHERE id=?").run(id);
        audit(actor, "procurement.started", id);
        return { ok: true };
      });
    },
    hasRefundHold(id) {
      return !!db
        .prepare(
          "SELECT id FROM beta_refunds WHERE order_id=? AND status IN ('requested','approved')",
        )
        .get(id);
    },
    assertFulfillmentAllowed(id) {
      if (
        db
          .prepare(
            "SELECT id FROM beta_refunds WHERE order_id=? AND status IN ('requested','approved')",
          )
          .get(id)
      )
        fail(
          "취소·환불 검토 중에는 수령 준비와 비밀번호 열람을 진행할 수 없습니다.",
          409,
        );
    },
    cancelUnpaid(actor, id, input) {
      if (actor.role !== "admin") customerOnly(actor);
      else adminOnly(actor);
      if (
        actor.role === "admin"
          ? input.bankChecked !== true
          : input.noPaymentSent !== true
      )
        fail(
          "이미 입금한 경우 담당자에게 입금 확인을 요청해 주세요. 미입금 여부를 확인해야 취소할 수 있습니다.",
        );
      const o = order(actor, id);
      if (o.payment) fail("입금 확인 주문은 환불 요청으로 처리해 주세요.", 409);
      return api.updateOrder(actor, id, {
        action: "cancel",
        revision: input.revision,
      });
    },
    requestRefund(actor, id, input) {
      if (actor.role === "admin") {
        adminOnly(actor);
        if (input.customerRequested !== true)
          fail("고객의 취소·환불 요청을 확인해 주세요.");
      } else customerOnly(actor);
      if (
        !/^[A-Za-z0-9_-]{16,100}$/.test(input.requestKey || "") ||
        !text(input.reason)
      )
        fail("환불 요청 사유를 입력해 주세요.");
      return transaction(() => {
        const memberId =
          actor.role === "admin" ? order(actor, id).member_id : actor.id;
        const previous = db
          .prepare(
            "SELECT id FROM beta_refunds WHERE member_id=? AND request_key=?",
          )
          .get(memberId, input.requestKey);
        if (previous) {
          const old = refund(actor, previous.id);
          if (old.orderId !== id)
            fail("요청번호가 다른 주문에 사용됐습니다.", 409);
          return old;
        }
        const o = order(actor, id);
        if (
          !o.payment ||
          ![
            "paid",
            "preparing",
            "pickup_ready",
            "pickup_reported",
            "pickup_exception",
            "collected",
            "shipped",
          ].includes(o.status)
        )
          fail(
            "입금 확인된 주문만 환불을 요청할 수 있습니다. 미확인 입금은 담당자에게 문의해 주세요.",
            409,
          );
        if (refunded(id) >= o.payment.amount)
          fail("이미 전액 환불된 주문입니다.", 409);
        if (
          db
            .prepare(
              "SELECT id FROM beta_refunds WHERE order_id=? AND status IN ('requested','approved')",
            )
            .get(id)
        )
          fail("이미 검토 중인 환불 요청이 있습니다.", 409);
        const key = randomUUID(),
          value = {
            reason: text(input.reason),
            requestedAt: clock(),
            orderNumber: o.number,
            companyName: o.snapshot.buyer.companyName,
            originalStatus: o.status,
            returnWindow:
              input.reasonType === "change_of_mind" && o.status === "collected"
                ? returnWindow(actor, id)
                : null,
            reasonType: ["change_of_mind", "defect_or_wrong", "other"].includes(
              input.reasonType,
            )
              ? input.reasonType
              : "other",
            requiresAgreement:
              input.reasonType === "change_of_mind" &&
              o.snapshot.specialOrder === true &&
              !!db
                .prepare(
                  "SELECT order_id FROM beta_procurement WHERE order_id=?",
                )
                .get(id),
          };
        db.prepare(
          "INSERT INTO beta_refunds VALUES(?,?,?,?,'requested',?,1)",
        ).run(key, id, memberId, input.requestKey, JSON.stringify(value));
        audit(actor, "refund.requested", id, { refundId: key });
        return refund(actor, key);
      });
    },
    refunds(actor) {
      if (actor.role === "admin") adminOnly(actor);
      else customerOnly(actor);
      const rows =
        actor.role === "admin"
          ? db.prepare("SELECT id FROM beta_refunds ORDER BY rowid DESC").all()
          : db
              .prepare(
                "SELECT id FROM beta_refunds WHERE member_id=? ORDER BY rowid DESC",
              )
              .all(actor.id);
      return rows.map((r) => refund(actor, r.id));
    },
    refundReviewAccess(actor) {
      adminOnly(actor);
      const reviewer = api.beta.config().refundReviewer?.value || null;
      const member = db
        .prepare("SELECT profile FROM members WHERE id=? AND role='admin'")
        .get(actor.id);
      const profile = member ? JSON.parse(member.profile) : {};
      const canReview =
        !reviewer ||
        (profile.authSource === "worknic_os" && profile.osUser === reviewer);
      const transferOperator =
        api.beta.config().refundTransferOperator?.value || null;
      const canComplete =
        !transferOperator ||
        (profile.authSource === "worknic_os" &&
          profile.osUser === transferOperator);
      return {
        reviewer,
        canReview,
        transferOperator,
        canComplete,
        transferOperatorConfirmed: !!transferOperator,
        recipientPolicy: api.beta.config().refundRecipient?.value || null,
        returnRefundTiming: api.beta.config().returnRefundTiming?.value || null,
        preReceiptRefundTiming:
          api.beta.config().preReceiptRefundTiming?.value || null,
      };
    },
    reviewRefund(actor, id, input) {
      adminOnly(actor);
      const access = api.beta.refundReviewAccess(actor);
      if (!access.canReview)
        fail(
          "취소·반품 검토 및 환불 승인은 지정 담당자 영우의 OS 계정으로 처리해 주세요.",
          403,
        );
      return transaction(() => {
        const r = refund(actor, id),
          o = order(actor, r.orderId);
        if (
          !(
            r.status === "requested" ||
            (r.status === "approved" &&
              input.decision === "reject" &&
              input.bankNotSent === true)
          ) ||
          r.revision !== input.revision ||
          !text(input.note) ||
          !["approve", "reject"].includes(input.decision)
        )
          fail("환불 검토 상태·사유를 확인해 주세요.", 409);
        const value = {
          ...r,
          reviewNote: text(input.note),
          reviewedBy: actor.username,
          reviewedAt: clock(),
        };
        if (r.requiresAgreement && input.agreementConfirmed !== true)
          fail(
            "제작·발주 시작 후에는 고객과 협의한 결과를 확인하고 기록해 주세요.",
          );
        if (r.requiresAgreement) value.agreementConfirmed = true;
        if (input.decision === "approve") {
          if (
            r.originalStatus !== "collected" &&
            !r.requiresAgreement &&
            api.beta.config().preReceiptRefundTiming?.value ===
              "within_3_business_days_after_approval_and_account"
          ) {
            if (input.preReceiptAccountVerified !== true)
              fail("고객의 미수령과 환불 계좌 확인 완료를 확인해 주세요.");
            value.preReceiptRefundTiming =
              "within_3_business_days_after_approval_and_account";
            value.refundTransferReadyAt = clock();
          }
          if (
            r.originalStatus === "collected" &&
            api.beta.config().returnRefundTiming?.value ===
              "within_3_business_days_after_inspection"
          ) {
            const day = text(input.inspectionCompletedOn, 10);
            const parsed = new Date(day + "T00:00:00.000Z");
            if (
              input.inspectionVerified !== true ||
              !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
              !Number.isFinite(parsed.getTime()) ||
              parsed.toISOString().slice(0, 10) !== day ||
              day >
                new Date(clock() + 9 * 3600000).toISOString().slice(0, 10) ||
              day <
                new Date(o.created_at + 9 * 3600000).toISOString().slice(0, 10)
            )
              fail("실제 반품 회수·검수 완료일과 확인 여부를 확인해 주세요.");
            value.inspectionCompletedOn = day;
            value.inspectionVerifiedAt = clock();
            value.returnRefundTiming =
              "within_3_business_days_after_inspection";
          }
          if (
            r.reasonType === "change_of_mind" &&
            r.originalStatus === "collected" &&
            !o.snapshot.specialOrder
          ) {
            const config = JSON.parse(
              db.prepare("SELECT value FROM beta_config WHERE id=1").get()
                .value,
            );
            const condition =
              o.snapshot.standardReturnCondition ||
              config.standardReturnCondition?.value;
            if (condition === "unused_complete_outer_box_open_allowed") {
              if (
                o.snapshot.standardReturnCondition &&
                input.returnConditionVerified !== true
              )
                fail(
                  "반품 제품의 미사용 상태와 구성품·라벨·포장 보존을 확인해 주세요. 외부 박스 개봉만으로 반려하지 않습니다.",
                );
              if (
                !o.snapshot.standardReturnCondition &&
                input.legacyTermsConfirmed !== true
              )
                fail("기존 주문의 당시 반품 상태 조건도 확인해 주세요.");
              if (input.returnConditionVerified === true) {
                value.returnConditionVerified = true;
                value.returnCondition = condition;
              }
              if (!o.snapshot.standardReturnCondition)
                value.legacyConditionReviewed = true;
            }
          }
          if (
            r.reasonType === "change_of_mind" &&
            r.originalStatus === "collected" &&
            !o.snapshot.specialOrder
          ) {
            const w = returnWindow(actor, o.id, r.requestedAt);
            if (w?.status === "receipt_unknown")
              fail(
                "실제 수령일을 확인·저장한 뒤 반품 접수기간을 검토해 주세요.",
              );
            if (w?.status === "period_elapsed")
              fail(
                "수령 다음날부터 7일 접수기간이 지난 단순 변심 요청입니다. 정상 반품 승인 대신 담당자가 별도 문의로 확인해 주세요.",
              );
            if (w?.legacy && input.legacyTermsConfirmed !== true)
              fail("기존 주문의 당시 반품 약정과 실제 수령일을 확인해 주세요.");
            if (w) {
              value.returnWindow = w;
              value.legacyTermsConfirmed = input.legacyTermsConfirmed === true;
            }
          }
          const remaining = o.payment.amount - refunded(o.id),
            amount = input.amount;
          if (!Number.isSafeInteger(amount) || amount < 1 || amount > remaining)
            fail("확인된 입금 잔액 이내의 환불액을 입력해 주세요.");
          if (
            !["collected", "shipped"].includes(r.originalStatus) &&
            !r.requiresAgreement &&
            amount !== remaining
          )
            fail(
              "수령 전 취소는 남은 입금액 전액을 환불합니다. 부분 반품은 실제 수령 후 검토해 주세요.",
            );
          const locker = db
            .prepare("SELECT * FROM beta_pickups WHERE order_id=?")
            .get(o.id);
          const handoff = db
            .prepare(
              "SELECT * FROM beta_handoffs WHERE order_id=? AND status IN ('ready','reported')",
            )
            .get(o.id);
          if (input.fulfillmentStopped !== true)
            fail(
              "실제 출고·전달 중단과 잠금 비밀번호 폐기 여부를 확인해 주세요.",
            );
          if (locker) {
            db.prepare("DELETE FROM beta_pickups WHERE order_id=?").run(o.id);
            audit(actor, "pickup.refund_stopped", o.id, {
              slotId: locker.slot_id,
              physicalCodeRevoked: true,
            });
          }
          if (handoff) {
            db.prepare(
              "UPDATE beta_handoffs SET status='cancelled',revision=revision+1 WHERE order_id=?",
            ).run(o.id);
            audit(actor, "handoff.refund_stopped", o.id);
          }
          if (!["collected", "shipped"].includes(o.status))
            db.prepare(
              "UPDATE orders SET status='preparing',revision=revision+1 WHERE id=?",
            ).run(o.id);
          value.amount = amount;
          value.fulfillmentStopped = true;
        }
        db.prepare(
          "UPDATE beta_refunds SET status=?,value=?,revision=revision+1 WHERE id=?",
        ).run(
          input.decision === "approve" ? "approved" : "rejected",
          JSON.stringify(value),
          id,
        );
        audit(
          actor,
          "refund." + (input.decision === "approve" ? "approved" : "rejected"),
          o.id,
          { refundId: id, amount: value.amount },
        );
        return refund(actor, id);
      });
    },
    completeRefund(actor, id, input) {
      adminOnly(actor);
      if (!api.beta.refundReviewAccess(actor).canComplete)
        fail(
          "실제 환불 송금 완료 기록은 지정 담당자 영우의 OS 계정으로 처리해 주세요.",
          403,
        );
      return transaction(() => {
        const r = refund(actor, id),
          o = order(actor, r.orderId);
        if (r.status === "completed") return r;
        if (
          r.status !== "approved" ||
          r.revision !== input.revision ||
          input.bankRefundChecked !== true ||
          input.amount !== r.amount ||
          !text(input.bankReference, 100)
        )
          fail("실제 은행 환불 송금·승인 금액·확인번호를 대조해 주세요.", 409);
        let recipientCheck;
        if (
          api.beta.config().refundRecipient?.value ===
          "original_payer_else_youngwoo_verified"
        ) {
          if (
            input.recipientVerified !== true ||
            !["original_payer", "different_name"].includes(input.recipientBasis)
          )
            fail("원입금자 명의와 환불 수취계좌 확인 결과를 기록해 주세요.");
          if (input.recipientBasis === "different_name") {
            const member = db
              .prepare(
                "SELECT profile FROM members WHERE id=? AND role='admin'",
              )
              .get(actor.id);
            const profile = member ? JSON.parse(member.profile) : {};
            if (
              profile.authSource !== "worknic_os" ||
              profile.osUser !== "영우"
            )
              fail(
                "다른 명의 환불 계좌는 영우의 OS 계정에서 별도로 확인해 주세요.",
                403,
              );
            if (
              input.recipientExceptionConfirmed !== true ||
              !text(input.recipientExceptionReference, 100)
            )
              fail(
                "명의 변경 요청의 영우 별도 확인과 내부 기록번호를 확인해 주세요.",
              );
          }
          recipientCheck = {
            basis: input.recipientBasis,
            verifiedAt: clock(),
            verifiedBy: actor.username,
            ...(input.recipientBasis === "different_name"
              ? {
                  exceptionReference: text(
                    input.recipientExceptionReference,
                    100,
                  ),
                  exceptionVerifiedBy: "영우",
                }
              : {}),
          };
        }
        const totalRefunded = refunded(o.id) + r.amount;
        if (totalRefunded > o.payment.amount)
          fail("확인된 입금액을 초과하여 환불할 수 없습니다.", 409);
        if (
          db
            .prepare("SELECT order_id FROM beta_pickups WHERE order_id=?")
            .get(o.id) ||
          db
            .prepare(
              "SELECT order_id FROM beta_handoffs WHERE order_id=? AND status IN ('ready','reported')",
            )
            .get(o.id)
        )
          fail("수령 준비를 먼저 중단해 주세요.", 409);
        if (input.restockAll === true) {
          if (refunded(o.id) > 0)
            fail(
              "부분 환불 이력이 있는 주문은 전체 자동 복원 대신 확인된 옵션별 반품 수량만 재고 화면에 반영해 주세요.",
            );
          if (
            totalRefunded !== o.payment.amount ||
            input.goodsRecovered !== true
          )
            fail(
              "전액 환불과 주문 전체 상품의 회수·재판매 가능 여부를 확인해야 전체 재고를 복원할 수 있습니다.",
            );
          if (
            !db
              .prepare(
                "SELECT order_id FROM beta_refund_stock WHERE order_id=?",
              )
              .get(o.id)
          ) {
            release({ ...o, snapshot: JSON.stringify(o.snapshot) });
            db.prepare("INSERT INTO beta_refund_stock VALUES(?,?)").run(
              o.id,
              JSON.stringify({ at: clock(), by: actor.username }),
            );
            audit(actor, "refund.stock_restored", o.id);
          }
        }
        const value = {
          ...r,
          bankReference: text(input.bankReference, 100),
          ...(recipientCheck ? { recipientCheck } : {}),
          completedAt: clock(),
          completedBy: actor.username,
          restockedAll: input.restockAll === true,
        };
        db.prepare(
          "UPDATE beta_refunds SET status='completed',value=?,revision=revision+1 WHERE id=?",
        ).run(JSON.stringify(value), id);
        db.prepare(
          "UPDATE orders SET status=?,revision=revision+1 WHERE id=?",
        ).run(
          totalRefunded === o.payment.amount
            ? "refunded"
            : r.requiresAgreement &&
                !["collected", "shipped"].includes(r.originalStatus)
              ? "cancelled_settled"
              : o.status,
          o.id,
        );
        audit(actor, "refund.completed", o.id, {
          refundId: id,
          amount: r.amount,
          totalRefunded,
        });
        return refund(actor, id);
      });
    },
    requestRecovery(input) {
      const username = text(input.username, 80).toLowerCase(),
        email = text(input.email, 200).toLowerCase();
      const m = db
        .prepare(
          "SELECT id,profile FROM members WHERE username=? AND role='customer'",
        )
        .get(username);
      if (
        !m ||
        JSON.parse(m.profile).email.toLowerCase() !== email ||
        !db
          .prepare(
            "SELECT member_id FROM beta_bindings WHERE member_id=? AND activated=1",
          )
          .get(m.id)
      )
        return generic;
      db.prepare(
        "INSERT OR IGNORE INTO beta_recovery_requests VALUES(?,?,'requested',?,NULL)",
      ).run(randomUUID(), m.id, clock());
      return generic;
    },
    recoveryRequests(actor) {
      adminOnly(actor);
      return db
        .prepare(
          "SELECT r.*,m.username,m.profile FROM beta_recovery_requests r JOIN members m ON m.id=r.member_id ORDER BY r.created_at DESC",
        )
        .all()
        .map((r) => ({ ...r, profile: JSON.parse(r.profile) }));
    },
    recoveryAccess(actor) {
      adminOnly(actor);
      const operator = api.beta.config().recoveryOperator?.value || null;
      const row = db
        .prepare("SELECT profile FROM members WHERE id=? AND role='admin'")
        .get(actor.id);
      const p = row ? JSON.parse(row.profile) : {};
      return {
        operator,
        canIssue:
          !operator || (p.authSource === "worknic_os" && p.osUser === operator),
      };
    },
    issueRecovery(actor, id, input) {
      adminOnly(actor);
      if (!api.beta.recoveryAccess(actor).canIssue)
        fail(
          "계정 복구 링크는 지정 담당자 영우의 OS 계정에서 발급해 주세요.",
          403,
        );
      if (input.contactVerified !== true)
        fail("등록 담당자에게 직접 연락하여 본인 확인을 완료해 주세요.");
      const r = db
        .prepare(
          "SELECT * FROM beta_recovery_requests WHERE id=? AND status IN ('requested','issued')",
        )
        .get(id);
      if (!r) fail("복구 요청을 확인해 주세요.", 404);
      const m = db
        .prepare(
          "SELECT id,role,status,profile FROM members WHERE id=? AND role='customer'",
        )
        .get(r.member_id);
      const binding = db
        .prepare(
          "SELECT * FROM beta_bindings WHERE member_id=? AND activated=1",
        )
        .get(r.member_id);
      if (!m || !binding || input.osRequestId !== binding.request_id)
        fail("OS의 기존 거래 계정 연결을 대조해 주세요.", 409);
      const token = api.resetToken(actor, m.id);
      db.prepare("DELETE FROM beta_activations WHERE member_id=?").run(m.id);
      db.prepare(
        "UPDATE beta_recovery_requests SET status='issued',reviewed_at=? WHERE id=?",
      ).run(clock(), id);
      audit(actor, "recovery.verified", m.id, { requestId: id });
      return token;
    },
    resetPassword(token, password) {
      const hash = createHash("sha256").update(text(token, 100)).digest("hex"),
        r = db.prepare("SELECT member_id FROM resets WHERE hash=?").get(hash);
      const result = api.resetPassword(token, password);
      if (r)
        db.prepare(
          "UPDATE beta_recovery_requests SET status='resolved',reviewed_at=? WHERE member_id=? AND status IN ('requested','issued')",
        ).run(clock(), r.member_id);
      return result;
    },
  };
}
