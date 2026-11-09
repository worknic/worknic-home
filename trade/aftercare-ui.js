import {
  el,
  card,
  field,
  formTask,
  call,
  say,
  money,
  date,
  link,
  button,
  labels,
} from "./beta-common.js";
const states = {
  requested: "환불 검토 중",
  approved: "환불 승인·송금 대기",
  rejected: "환불 요청 반려",
  completed: "환불 완료 기록",
};
export function orderAftercare(root, o, refunds, refresh, admin = false) {
  if (o.defectShippingText) root.append(el("p", o.defectShippingText, "muted"));
  if (o.outboundShippingText)
    root.append(el("p", o.outboundShippingText, "muted"));
  if (o.returnShippingText) root.append(el("p", o.returnShippingText, "muted"));
  if (o.returnConditionText)
    root.append(el("p", o.returnConditionText, "muted"));
  if (o.status === "collected" && !o.specialOrder && o.returnWindow) {
    const w = o.returnWindow;
    root.append(
      el(
        "p",
        w.legacy
          ? "이전 주문은 당시 반품 약정과 실제 수령일을 담당자가 별도로 확인합니다."
          : w.deadlineExclusive
            ? "단순 변심 반품 신청 마감: " +
              date(w.deadlineExclusive - 1) +
              " · 접수 시점을 기준으로 검토합니다."
            : "단순 변심 반품은 수령 다음날부터 7일 이내입니다. 실제 수령일은 담당자가 확인합니다.",
      ),
    );
    if (admin) {
      const rf = el("form");
      field(rf, "receivedOn", "확인한 실제 수령일", w.receivedOn || "", "date");
      field(
        rf,
        "verified",
        "실제 수령일을 고객·현장 기록으로 확인했습니다.",
        false,
        "checkbox",
      ).required = true;
      rf.append(el("button", "실제 수령일 확인 저장", "button secondary"));
      formTask(rf, async (d) => {
        await call("/admin/orders/receipt-date", {
          id: o.id,
          orderRevision: o.revision,
          receiptRevision: w.receiptRevision || 0,
          receivedOn: d.receivedOn,
          actualReceiptVerified: true,
        });
        say("확인된 실제 수령일과 반품 신청 마감일을 저장했습니다.");
        refresh();
      });
      root.append(rf);
    }
  }
  const rows = (refunds || []).filter((r) => r.orderId === o.id),
    open = rows.some((r) => ["requested", "approved"].includes(r.status));
  const completed = rows
    .filter((r) => r.status === "completed")
    .reduce((sum, r) => sum + r.amount, 0);
  if (o.status === "pending_payment") {
    const f = el("form");
    f.append(
      el("h3", "미입금 주문 취소"),
      el(
        "p",
        admin
          ? "실제 은행 내역에 입금이 없는지 확인한 뒤 취소합니다."
          : "이미 입금했다면 취소하지 말고 담당자에게 입금 확인을 요청해 주세요.",
      ),
    );
    field(
      f,
      "checked",
      admin
        ? "실제 은행 내역에서 입금이 없음을 확인했습니다."
        : "이 주문에 아직 입금하지 않았습니다.",
      false,
      "checkbox",
    ).required = true;
    f.append(el("button", "미입금 주문 취소", "button secondary"));
    formTask(f, async () => {
      await call("/orders/" + o.id + "/cancel", {
        revision: o.revision,
        noPaymentSent: !admin,
        bankChecked: admin,
      });
      say("미입금 주문을 취소했습니다. 예약 수량을 반환했습니다.");
      refresh();
    });
    root.append(f);
  }
  if (rows.length) {
    root.append(
      el("h3", "취소·환불 진행"),
      el(
        "p",
        "완료 기록된 환불 합계 " +
          money(completed) +
          " · 원주문 금액 " +
          money(o.total),
      ),
    );
    for (const r of rows) {
      const box = el("div");
      box.append(
        el("strong", states[r.status] || r.status),
        el("p", "요청 사유: " + r.reason),
      );
      if (r.amount) box.append(el("p", "검토 금액 " + money(r.amount)));
      if (r.returnWindow)
        box.append(
          el(
            "p",
            "접수기간 확인: " +
              ({
                within_period: "기간 내 접수",
                period_elapsed: "7일 접수기간 경과 · 담당자 확인",
                receipt_unknown: "실제 수령일 확인 필요",
              }[r.returnWindow.status] || "담당자 확인"),
          ),
        );
      if (r.reviewNote) box.append(el("p", "담당자 안내: " + r.reviewNote));
      if (r.completedAt)
        box.append(el("p", "완료 기록 " + date(r.completedAt)));
      root.append(box);
    }
  }
  if (open)
    root.append(
      el(
        "p",
        "환불 검토 중에는 수령 준비와 비밀번호 열람이 중단됩니다. 실제 잠금장치는 담당자가 별도로 조치합니다.",
        "muted",
      ),
    );
  if (admin && open) root.append(link("환불 검토·처리 열기", "#refunds"));
  if (
    o.payment &&
    !open &&
    !["refunded", "cancelled", "expired", "cancelled_settled"].includes(
      o.status,
    ) &&
    completed < o.payment.amount
  ) {
    const f = el("form");
    f.append(
      el("h3", "취소·환불 검토 요청"),
      el(
        "p",
        "요청만으로 환불이 확정되지는 않습니다. 계좌 전체 번호는 입력하지 마세요.",
      ),
    );
    field(f, "reason", "취소·반품 요청 사유");
    const reasonLabel = el("label", "요청 구분"),
      reasonType = el("select");
    reasonType.name = "reasonType";
    reasonType.required = true;
    for (const [value, label] of [
      ["", "선택해 주세요"],
      ["change_of_mind", "단순 변심"],
      ["defect_or_wrong", "불량·오배송"],
      ["other", "기타 문의"],
    ]) {
      const option = el("option", label);
      option.value = value;
      reasonType.append(option);
    }
    reasonLabel.append(reasonType);
    f.append(reasonLabel);
    f.append(el("button", "환불 검토 요청", "button secondary"));
    if (admin)
      field(
        f,
        "customerRequested",
        "등록 담당자의 취소·환불 요청을 확인했습니다.",
        false,
        "checkbox",
      ).required = true;
    const requestKey = crypto.randomUUID();
    formTask(f, async (d) => {
      await call(admin ? "/admin/refunds/request" : "/refunds", {
        orderId: o.id,
        requestKey,
        reason: d.reason,
        reasonType: d.reasonType,
        customerRequested: admin,
      });
      say("환불 검토 요청을 접수했습니다. 담당자가 확인합니다.");
      refresh();
    });
    root.append(f);
  }
  if (
    ["cancelled", "expired", "refunded", "cancelled_settled"].includes(o.status)
  )
    root.append(
      el(
        "p",
        "종료된 주문입니다. 추가 입금하지 말고 문의가 있으면 담당자에게 연락해 주세요.",
      ),
    );
}
export function recoveryForm(root) {
  const c = card("비밀번호를 잊으셨나요?"),
    f = el("form");
  c.append(
    el(
      "p",
      "등록한 아이디·이메일로 복구를 요청하세요. 담당자가 등록 연락처로 본인 확인 후 30분 일회용 링크를 직접 안내합니다. 자동 메일은 발송되지 않습니다.",
    ),
  );
  field(f, "username", "등록한 아이디");
  field(f, "email", "등록한 이메일", "", "email");
  f.append(el("button", "비밀번호 복구 요청", "button secondary"));
  formTask(f, async (d) => {
    const r = await call("/password/forgot", d);
    say(r.message);
    f.reset();
  });
  c.append(f, link("담당자 문의", "https://worknic.co.kr/contact/"));
  root.append(c);
}
export function resetForm(root, token, done) {
  const c = card("비밀번호 재설정"),
    f = el("form");
  c.append(
    el(
      "p",
      "등록 담당자 확인 후 발급된 링크입니다. 30분 안에 한 번만 사용할 수 있습니다. 변경 후 기존 로그인은 모두 종료됩니다.",
    ),
  );
  const password = field(
      f,
      "password",
      "새 비밀번호 · 10~128자",
      "",
      "password",
    ),
    confirmation = field(f, "confirmation", "새 비밀번호 확인", "", "password");
  for (const p of [password, confirmation]) {
    p.minLength = 10;
    p.maxLength = 128;
    p.autocomplete = "new-password";
  }
  f.append(el("button", "새 비밀번호 저장", "button"));
  formTask(f, async (d) => {
    if (d.password !== d.confirmation)
      throw Error("비밀번호 확인이 일치하지 않습니다.");
    await call("/password/reset", { token, password: d.password });
    f.reset();
    done();
  });
  c.append(f);
  root.append(c);
}
export async function adminRecovery(root, refresh) {
  root.append(
    el("h2", "비밀번호 복구 요청"),
    el(
      "p",
      "신청자가 적은 연락처가 아니라 OS에 등록된 연락처로 직접 본인 확인합니다. 복구는 사업자 승인 상태를 변경하지 않습니다.",
    ),
  );
  const { requests } = await call("/admin/recovery");
  if (!requests.length) root.append(el("p", "접수된 복구 요청이 없습니다."));
  for (const r of requests) {
    const c = card(r.profile.companyName);
    c.append(
      el("p", r.username + " · " + r.profile.businessNumber),
      el(
        "p",
        "등록 이메일: " +
          r.profile.email +
          " · 등록 연락처: " +
          r.profile.phone,
      ),
      el(
        "p",
        "접수 " +
          date(r.created_at) +
          " · " +
          ({
            requested: "확인 대기",
            issued: "링크 발급됨",
            resolved: "재설정 완료",
          }[r.status] || r.status),
      ),
    );
    if (r.status !== "resolved") {
      const f = el("form");
      field(
        f,
        "checked",
        "OS 원본과 등록 연락처로 계정 사용자 본인 확인을 완료했습니다.",
        false,
        "checkbox",
      ).required = true;
      f.append(
        el(
          "button",
          r.status === "issued"
            ? "기존 링크 폐기 후 다시 발급"
            : "30분 일회용 복구 링크 발급",
          "button",
        ),
      );
      const output = el("div");
      formTask(f, async () => {
        const result = await call("/admin/recovery/issue", {
          id: r.id,
          contactVerified: true,
        });
        const a = el("a", "등록 담당자에게 전달할 복구 링크");
        a.href =
          location.origin +
          "/trade/#account?reset=" +
          encodeURIComponent(result.token);
        output.replaceChildren(
          el(
            "p",
            "등록 담당자에게만 직접 전달하세요. 이전 링크는 무효화됐습니다. 링크를 공용 메모에 남기지 마세요.",
          ),
          a,
        );
        say("본인 확인 후 일회용 복구 링크를 발급했습니다.");
      });
      c.append(f, output);
    }
    root.append(c);
  }
}
export async function adminRefunds(root, refresh) {
  root.append(
    el("h2", "취소·환불 관리"),
    el(
      "p",
      "이 화면은 은행 송금 기능이 아닙니다. 등록 담당자에게 환불 수취 정보를 별도로 확인하고, 은행에서 실제 송금한 뒤 결과를 기록합니다.",
    ),
  );
  const [{ refunds, reviewAccess }, { orders }] = await Promise.all([
    call("/admin/refunds"),
    call("/admin/orders"),
  ]);
  const canReview = reviewAccess?.canReview !== false;
  const canComplete = reviewAccess?.canComplete !== false;
  root.append(
    el(
      "p",
      "검토·환불 승인 담당자: " +
        (reviewAccess?.reviewer || "미정") +
        " · 실제 은행 송금 담당자: " +
        (reviewAccess?.transferOperator || "미정"),
    ),
  );
  if (!canReview)
    root.append(
      el(
        "p",
        "환불 승인·반려·송금 전 승인 철회는 영우의 OS 계정에서 처리합니다.",
      ),
    );
  if (!refunds.length) root.append(el("p", "접수된 환불 요청이 없습니다."));
  for (const r of refunds) {
    const o = orders.find((o) => o.id === r.orderId),
      c = card(r.orderNumber + " · " + r.companyName);
    c.append(
      el("strong", states[r.status]),
      el("p", "요청 사유: " + r.reason),
      el(
        "p",
        "요청 구분: " +
          ({
            change_of_mind: "단순 변심",
            defect_or_wrong: "불량·오배송",
            other: "기타 문의",
          }[r.reasonType] || "기타 문의"),
      ),
      el(
        "p",
        "원주문 " +
          money(o.total) +
          " · 확인된 입금 " +
          money(o.payment.amount),
      ),
      el("p", "실제 주문 상태 " + (labels[o.status] || o.status)),
    );
    if (r.refundTransferReadyAt)
      c.append(
        el(
          "p",
          "수령 전 취소 승인·환불 계좌 확인 완료: " +
            date(r.refundTransferReadyAt) +
            " · 완료 후 3영업일 이내 송금. 공휴일을 확인해 기한을 판단하세요.",
        ),
      );
    if (r.inspectionCompletedOn)
      c.append(
        el(
          "p",
          "반품 회수·검수 완료일: " +
            r.inspectionCompletedOn +
            " · 완료 후 3영업일 이내 송금. 공휴일을 확인해 기한을 판단하세요.",
        ),
      );
    if (r.reviewNote) c.append(el("p", "고객 안내: " + r.reviewNote));
    if (r.returnWindow)
      c.append(
        el(
          "p",
          "접수기간 확인: " +
            ({
              within_period: "기간 내 접수",
              period_elapsed: "7일 접수기간 경과",
              receipt_unknown: "실제 수령일 확인 필요",
            }[r.returnWindow.status] || "담당자 확인"),
        ),
      );
    if (r.status === "requested" && canReview) {
      const f = el("form");
      f.append(
        el(
          "p",
          r.requiresAgreement
            ? "제작·발주가 시작된 특수 상품입니다. 고객과 환불액·공제액·물품 처리를 건별 협의하고 결과를 기록하세요."
            : "제작·발주 전 또는 일반 재고의 수령 전 취소는 남은 입금액 전액 환불입니다. 수령 후에는 부분 환불도 검토할 수 있습니다.",
        ),
      );
      const approvedSoFar = refunds
        .filter((x) => x.orderId === r.orderId && x.status === "completed")
        .reduce((s, x) => s + x.amount, 0);
      field(
        f,
        "amount",
        "승인할 환불 금액 · 원",
        o.payment.amount - approvedSoFar,
        "number",
      ).min = 1;
      field(f, "note", "고객에게 안내할 검토 내용");
      if (
        r.originalStatus !== "collected" &&
        !r.requiresAgreement &&
        reviewAccess?.preReceiptRefundTiming ===
          "within_3_business_days_after_approval_and_account"
      ) {
        field(
          f,
          "preReceiptAccountVerified",
          "고객이 아직 상품을 받지 않았고 환불 계좌 확인도 완료했습니다. 다른 명의 요청은 영우가 별도로 확인했습니다.",
          false,
          "checkbox",
        ).required = true;
        f.append(
          el(
            "p",
            "승인·계좌 확인 완료 시점을 기준으로 3영업일 이내 송금합니다. 공휴일은 별도 확인하세요.",
          ),
        );
      }
      if (
        r.originalStatus === "collected" &&
        reviewAccess?.returnRefundTiming ===
          "within_3_business_days_after_inspection"
      ) {
        field(
          f,
          "inspectionCompletedOn",
          "실제 반품 회수·검수 완료일",
          "",
          "date",
        );
        field(
          f,
          "inspectionVerified",
          "반품 상품의 회수와 검수가 해당 날짜에 완료된 것을 확인했습니다.",
          false,
          "checkbox",
        ).required = true;
        f.append(
          el(
            "p",
            "회수·검수 완료 후 3영업일 이내 송금합니다. 공휴일을 확인해 기한을 판단하세요.",
          ),
        );
      }
      if (
        r.reasonType === "change_of_mind" &&
        r.originalStatus === "collected" &&
        !o.specialOrder
      ) {
        c.append(
          el(
            "p",
            "반품 기간은 실제 수령일과 최초 접수 시점으로 검토합니다. 수령일 확인이 필요하면 견적·주문 화면에서 기록해 주세요.",
          ),
        );
        if (o.returnWindow?.legacy || !o.standardReturnCondition)
          field(
            f,
            "legacyTerms",
            "기존 주문의 당시 반품 약정과 실제 수령일을 별도로 확인했습니다.",
            false,
            "checkbox",
          ).required = true;
        field(
          f,
          "returnConditionVerified",
          "반품 제품의 미사용 상태와 구성품·라벨·포장 보존을 확인했습니다. 외부 박스 개봉만으로 반려하지 않습니다.",
          false,
          "checkbox",
        ).required = !!o.standardReturnCondition;
      }
      if (r.requiresAgreement)
        field(
          f,
          "agreement",
          "고객과 환불액·공제액·주문 취소 결과를 협의했습니다.",
          false,
          "checkbox",
        ).required = true;
      field(
        f,
        "stopped",
        "실제 출고·대면 전달 중단과 해당 보관함의 상품 회수·비밀번호 폐기를 확인했습니다.",
        false,
        "checkbox",
      ).required = true;
      f.append(el("button", "환불 검토 승인", "button"));
      formTask(f, async (d) => {
        await call("/admin/refunds/review", {
          id: r.id,
          revision: r.revision,
          decision: "approve",
          amount: Number(d.amount),
          note: d.note,
          fulfillmentStopped: true,
          legacyTermsConfirmed: d.legacyTerms === "on",
          returnConditionVerified: d.returnConditionVerified === "on",
          agreementConfirmed: d.agreement === "on",
          inspectionCompletedOn: d.inspectionCompletedOn,
          inspectionVerified: d.inspectionVerified === "on",
          preReceiptAccountVerified: d.preReceiptAccountVerified === "on",
        });
        say("환불을 승인했습니다. 실제 송금 후 완료를 기록해 주세요.");
        refresh();
      });
      const reject = el("form");
      field(reject, "note", "반려 사유 · 고객에게 안내");
      if (r.requiresAgreement)
        field(
          reject,
          "agreement",
          "고객과 협의한 반려·주문 지속 결과를 기록합니다.",
          false,
          "checkbox",
        ).required = true;
      reject.append(el("button", "환불 요청 반려", "button secondary"));
      formTask(reject, async (d) => {
        await call("/admin/refunds/review", {
          id: r.id,
          revision: r.revision,
          decision: "reject",
          note: d.note,
          agreementConfirmed: d.agreement === "on",
        });
        say("반려 사유를 기록했습니다. 고객에게 안내해 주세요.");
        refresh();
      });
      c.append(f, reject);
    } else if (r.status === "approved") {
      c.append(el("p", "승인 환불액 " + money(r.amount)));
      const f = el("form");
      if (
        reviewAccess?.recipientPolicy ===
        "original_payer_else_youngwoo_verified"
      ) {
        f.append(
          el(
            "p",
            "은행 송금 전 원입금자 명의를 대조하세요. 다른 명의 요청은 영우가 별도로 확인합니다.",
          ),
        );
        const label = el("label", "환불 수취계좌 명의 확인"),
          select = el("select");
        select.name = "recipientBasis";
        select.required = true;
        for (const [value, title] of [
          ["", "선택해 주세요"],
          ["original_payer", "원입금자와 동일 명의"],
          ["different_name", "다른 명의 · 영우 별도 확인"],
        ]) {
          const option = el("option", title);
          option.value = value;
          select.append(option);
        }
        label.append(select);
        f.append(label);
        field(
          f,
          "recipientVerified",
          "은행 송금 전에 원입금자와 환불 수취계좌의 명의를 확인했습니다.",
          false,
          "checkbox",
        ).required = true;
        const exception = field(
          f,
          "recipientExceptionConfirmed",
          "다른 명의 요청에 대해 영우가 별도로 확인했습니다.",
          false,
          "checkbox",
        );
        const reference = field(
          f,
          "recipientExceptionReference",
          "명의 변경 확인 기록번호 · 계좌번호 입력 금지",
        );
        reference.required = false;
        select.addEventListener("change", () => {
          exception.required = reference.required =
            select.value === "different_name";
        });
      }
      field(f, "amount", "실제로 환불 송금한 금액 · 원", "", "number");
      field(
        f,
        "bankReference",
        "송금 확인번호 또는 내부 기록번호 · 계좌 전체 입력 금지",
      );
      field(
        f,
        "bankChecked",
        "은행의 실제 환불 송금 완료와 수취인·금액을 확인했습니다.",
        false,
        "checkbox",
      ).required = true;
      field(
        f,
        "restockAll",
        "전액 환불과 함께 주문 전체 재고를 복원합니다.",
        false,
        "checkbox",
      );
      field(
        f,
        "goodsRecovered",
        "주문 전체 상품의 회수·수량·재판매 가능 상태를 확인했고 재고에 별도로 반영하지 않았습니다.",
        false,
        "checkbox",
      );
      f.append(
        el(
          "p",
          "부분 반품이나 재판매 불가 상품은 전체 복원을 체크하지 마세요. 실제 확인한 옵션별 수량만 재고 화면에서 조정합니다.",
          "muted",
        ),
        el("button", "실제 송금 후 환불 완료 기록", "button"),
      );
      formTask(f, async (d) => {
        await call("/admin/refunds/complete", {
          id: r.id,
          revision: r.revision,
          amount: Number(d.amount),
          bankReference: d.bankReference,
          bankRefundChecked: true,
          recipientBasis: d.recipientBasis,
          recipientVerified: d.recipientVerified === "on",
          recipientExceptionConfirmed: d.recipientExceptionConfirmed === "on",
          recipientExceptionReference: d.recipientExceptionReference,
          restockAll: d.restockAll === "on",
          goodsRecovered: d.goodsRecovered === "on",
        });
        say("실제 환불 완료를 기록했습니다. 원주문·견적 금액은 보존됩니다.");
        refresh();
      });
      if (canComplete) c.append(f);
      else
        c.append(
          el("p", "실제 송금 완료 기록은 영우의 OS 계정에서 처리합니다."),
        );
      const withdraw = el("form");
      if (r.requiresAgreement)
        field(
          withdraw,
          "agreement",
          "고객과 송금 전 승인 철회 결과를 협의했습니다.",
          false,
          "checkbox",
        ).required = true;
      field(withdraw, "note", "송금 전 승인 철회 사유 · 고객 안내");
      field(
        withdraw,
        "notSent",
        "은행에서 환불 송금하지 않았음을 확인했습니다.",
        false,
        "checkbox",
      ).required = true;
      withdraw.append(
        el("button", "송금 전 환불 승인 철회", "button secondary"),
      );
      formTask(withdraw, async (d) => {
        await call("/admin/refunds/review", {
          id: r.id,
          revision: r.revision,
          decision: "reject",
          note: d.note,
          bankNotSent: true,
          agreementConfirmed: d.agreement === "on",
        });
        say(
          "송금 전 환불 승인을 철회했습니다. 필요하면 수령 준비와 고객 안내를 다시 확인해 주세요.",
        );
        refresh();
      });
      if (canReview) c.append(withdraw);
    } else if (r.status === "completed")
      c.append(
        el("p", "환불 완료 " + money(r.amount) + " · " + date(r.completedAt)),
        el("p", "확인번호: " + r.bankReference),
      );
    root.append(c);
  }
}
