import {
  el,
  card,
  link,
  field,
  formTask,
  button,
  call,
  say,
  dl,
  date,
} from "./beta-common.js";

export async function inventoryBulk(root, reload) {
  const c = card("재고 엑셀 일괄 관리");
  c.append(
    el(
      "p",
      "옵션별 주문 가능 수량을 최신 양식으로 관리합니다. 업로드 후 변경 내용을 확인하고 별도 적용합니다. 가격·상품자료·기존 주문·접수 상태는 유지됩니다.",
    ),
    link("재고 엑셀 내려받기", "/api/beta/admin/inventory/template"),
  );
  const form = el("form"),
    file = field(form, "inventoryFile", "재고 엑셀 파일", "", "file"),
    preview = el("div");
  file.accept = ".xlsx";
  form.append(el("button", "재고 변경 미리보기", "button"));
  formTask(form, async () => {
    preview.replaceChildren();
    const upload = file.files[0];
    if (
      !upload ||
      !/\.xlsx$/i.test(upload.name) ||
      upload.size > 5 * 1024 * 1024
    )
      throw Error("5MB 이하의 .xlsx 파일을 선택해 주세요.");
    const response = await fetch("/api/beta/admin/inventory/file", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/octet-stream" },
      body: upload,
      signal: AbortSignal.timeout(45000),
    });
    const result = await response.json();
    if (!response.ok) throw Error(result.error || "재고 파일을 확인해 주세요.");
    preview.append(
      el(
        "p",
        `적용 가능 ${result.valid}개 · 오류 ${result.invalid}개 · 유효 기한 ${date(result.expiresAt)}`,
      ),
    );
    const wrap = el("div", null, "table-wrap"),
      table = el("table"),
      head = el("tr");
    for (const h of [
      "행",
      "상품·옵션",
      "이전 수량",
      "새 수량",
      "주문 가능",
      "검증 결과",
    ])
      head.append(el("th", h));
    table.append(head);
    for (const item of result.rows) {
      const row = el("tr");
      for (const text of [
        item.row,
        item.name + " · " + item.after.productId + " / " + item.after.optionId,
        item.before?.stock ?? "확인 필요",
        item.after.stock ?? "확인 필요",
        item.after.enabled ? "예" : "아니오",
        item.errors.join(" / ") || "적용 가능",
      ])
        row.append(el("td", text));
      table.append(row);
    }
    wrap.append(table);
    preview.append(wrap);
    if (!result.invalid)
      preview.append(
        button("확인한 재고 일괄 적용", async () => {
          const saved = await call("/admin/inventory/apply", { id: result.id });
          say(
            saved.applied +
              "개 상품·옵션 수량을 저장했습니다. 가격과 기존 주문은 유지됩니다.",
          );
          await reload();
        }),
      );
  });
  c.append(form, preview);
  const { history } = await call("/admin/inventory/history");
  if (history.length)
    c.append(
      el(
        "p",
        `최근 적용 ${history.length}건 · 마지막 적용 ${history[0].count}개. 수정은 최신 양식을 다시 내려받아 진행하세요.`,
      ),
    );
  root.append(c);
}

export async function operationsReadiness(root) {
  const r = await call("/admin/readiness"),
    c = card("운영 준비 현황");
  c.append(
    el(
      "p",
      "현재 저장된 상태를 조회합니다. 이 화면을 열거나 점검 목록을 읽어도 접수가 시작되지 않습니다.",
    ),
    dl(
      Object.entries({
        "확인 시각": date(r.checkedAt),
        "회원 가입 접수": r.intake.registration ? "열림" : "닫힘",
        "견적·주문 접수": r.intake.quotes ? "열림" : "닫힘",
        "거래 문서 확인": r.intake.documentsConfirmed
          ? "확인됨"
          : "운영 전 확인 필요",
        "공통 판매가": `전체 ${r.prices.total}개 중 미정 ${r.prices.undetermined}개 · 업체별 단가는 견적에서 입력`,
        "옵션별 재고": `전체 ${r.inventory.total}개 · 주문 가능 ${r.inventory.enabled}개 · 수량 0 ${r.inventory.zero}개`,
        "환불 검토 / 송금 / 계정 복구": [
          r.operators.refund,
          r.operators.transfer,
          r.operators.recovery,
        ]
          .map((x) => x || "미확정")
          .join(" / "),
      }),
    ),
  );
  for (const l of r.locations)
    c.append(
      el(
        "p",
        `${l.name} · ${l.enabled ? "신청 열림" : "신청 닫힘"} · 픽업비 ${l.fee === 0 ? "무료" : l.fee + "원"} · 현장 정보 ${l.sourceVerified ? "확인됨" : "확인 필요"}`,
      ),
    );
  c.append(el("h3", "실물·운영 기준 확인"));
  for (const text of r.manualChecks) c.append(el("p", text));
  c.append(
    el(
      "p",
      "외부 백업·휴대폰·실제 보관함 검증과 공휴일 자동 계산은 위 상태만으로 완료된 것으로 판단하지 않습니다.",
    ),
  );
  root.append(c);
}
