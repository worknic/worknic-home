import ExcelJS from "exceljs";
import { randomUUID } from "node:crypto";
import { guardWorkbook } from "./pricing.mjs";
import { TradeError } from "./store.mjs";

const headers = [
  "상품번호",
  "옵션번호",
  "상품명",
  "모델",
  "옵션명",
  "주문가능수량",
  "주문가능",
  "수정번호",
];
const fail = (message, status = 400) => {
  throw new TradeError(message, status);
};
const key = (p, o) => JSON.stringify([p, o]);
export async function inventoryWorkbook(records) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "WORKNIC";
  const sheet = wb.addWorksheet("재고", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  sheet.addRow(headers);
  sheet.columns.forEach((c, i) => {
    c.width = [20, 20, 46, 24, 30, 20, 16, 16][i];
  });
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF343E31" },
  };
  for (const p of records) {
    const row = sheet.addRow([
      p.id,
      p.optionId,
      p.name,
      p.model || "",
      p.optionLabel || "",
      p.stock,
      p.enabled ? "예" : "아니오",
      p.revision,
    ]);
    for (const col of [1, 2, 4]) row.getCell(col).numFmt = "@";
    for (const col of [6, 7])
      row.getCell(col).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF0F4EC" },
      };
  }
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, sheet.rowCount), column: headers.length },
  };
  const notes = wb.addWorksheet("입력안내");
  notes.columns = [{ width: 105 }];
  for (const text of [
    "WORKNIC 옵션별 주문 가능 수량 일괄 관리",
    "최신 양식에서 주문가능수량과 주문가능만 수정하세요. 상품번호·옵션번호·수정번호는 변경하지 마세요.",
    "주문가능수량은 0~1,000,000의 정수, 주문가능은 예 또는 아니오입니다. 빈칸은 오류이며 0으로 간주하지 않습니다.",
    "수량은 실사한 주문 가능 잔량입니다. 주문·개별 수정 이후 내려받은 파일은 다시 확인하세요.",
    "업로드는 검증·미리보기만 수행합니다. 오류가 없을 때 별도 적용 버튼으로 저장합니다. 미리보기는 15분간 유효합니다.",
    "일괄 적용은 전체 행 검증 후 한 번에 처리합니다. 중복 상품·옵션, 오래된 수정번호, 수식·외부 링크는 거절합니다.",
    "공통 판매가, 기존 견적·주문 금액, 상품 설명·사진, 접수 설정은 변경하지 않습니다.",
    "수량 복원은 최신 양식을 다시 내려받아 실제 잔량을 확인한 뒤 등록하세요. 과거 재고 자동 복원은 지원하지 않습니다.",
  ]) {
    const row = notes.addRow([text]);
    row.alignment = { wrapText: true, vertical: "middle" };
    row.height = 42;
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function readInventoryWorkbook(buffer) {
  guardWorkbook(buffer);
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    fail("엑셀 파일을 읽지 못했습니다.");
  }
  const sheet = wb.getWorksheet("재고");
  if (!sheet || sheet.rowCount > 5001 || sheet.columnCount > 20)
    fail("재고 시트는 최대 5,000행까지 지원합니다.");
  if (headers.some((h, i) => sheet.getRow(1).getCell(i + 1).value !== h))
    fail("최신 재고 양식의 열 제목과 순서를 유지해 주세요.");
  const rows = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    if (!row.hasValues) continue;
    const record = { row: r };
    for (let c = 0; c < headers.length; c++) {
      const value = row.getCell(c + 1).value;
      if (value !== null && typeof value === "object")
        fail(`${r}행: 수식·하이퍼링크 대신 값만 입력해 주세요.`);
      record[headers[c]] = value ?? "";
    }
    rows.push(record);
  }
  return rows;
}

export function installInventoryBulk(
  api,
  db,
  { clock, transaction, audit, adminOnly },
) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS beta_inventory_imports (id TEXT PRIMARY KEY,actor TEXT NOT NULL,rows TEXT NOT NULL,expires INTEGER NOT NULL,status TEXT NOT NULL)",
  );
  const inventory = (actor) =>
    api.beta.inventory(actor).filter((p) => p.published !== false);
  const unchanged = (a, b) =>
    a &&
    b &&
    a.revision === b.revision &&
    a.stock === b.stock &&
    a.enabled === b.enabled;
  return {
    previewInventory(actor, rows) {
      adminOnly(actor);
      if (!Array.isArray(rows) || !rows.length || rows.length > 5000)
        fail("재고 목록은 1~5,000행으로 입력해 주세요.");
      const current = new Map(
          inventory(actor).map((p) => [key(p.id, p.optionId), p]),
        ),
        seen = new Set();
      const checked = rows.map((r, i) => {
        const productId = String(r.상품번호 ?? "").trim(),
          optionId = String(r.옵션번호 ?? "").trim(),
          k = key(productId, optionId);
        const p = current.get(k),
          errors = [];
        if (!p) errors.push("현재 공개된 상품·옵션번호를 확인하세요.");
        if (seen.has(k)) errors.push("동일 상품·옵션이 중복되었습니다.");
        seen.add(k);
        const stock =
          typeof r.주문가능수량 === "number"
            ? r.주문가능수량
            : /^\d+$/.test(String(r.주문가능수량 ?? "").trim())
              ? Number(r.주문가능수량)
              : NaN;
        if (!Number.isSafeInteger(stock) || stock < 0 || stock > 1000000)
          errors.push("수량은 0~1,000,000의 정수로 입력하세요.");
        const enabledText = String(r.주문가능 ?? "").trim();
        if (!["예", "아니오"].includes(enabledText))
          errors.push("주문가능은 예 또는 아니오로 입력하세요.");
        const revisionText = String(r.수정번호 ?? "").trim();
        if (
          !/^\d+$/.test(revisionText) ||
          !p ||
          Number(revisionText) !== p.revision
        )
          errors.push("수정번호가 다릅니다. 최신 양식을 내려받으세요.");
        const before = p
          ? {
              productId,
              optionId,
              stock: p.stock,
              enabled: p.enabled,
              revision: p.revision,
            }
          : null;
        return {
          row: r.row || i + 2,
          name: p?.name || "",
          before,
          after: { productId, optionId, stock, enabled: enabledText === "예" },
          errors,
        };
      });
      const id = randomUUID(),
        expiresAt = clock() + 15 * 60000;
      db.prepare("INSERT INTO beta_inventory_imports VALUES(?,?,?,?,?)").run(
        id,
        actor.id,
        JSON.stringify(checked),
        expiresAt,
        "preview",
      );
      return {
        id,
        rows: checked,
        valid: checked.filter((x) => !x.errors.length).length,
        invalid: checked.filter((x) => x.errors.length).length,
        expiresAt,
      };
    },
    applyInventory(actor, id) {
      adminOnly(actor);
      return transaction(() => {
        const batch = db
          .prepare("SELECT * FROM beta_inventory_imports WHERE id=?")
          .get(id);
        if (
          !batch ||
          batch.actor !== actor.id ||
          batch.status !== "preview" ||
          batch.expires <= clock()
        )
          fail("미리보기가 만료됐습니다. 다시 업로드해 주세요.", 409);
        const rows = JSON.parse(batch.rows);
        if (rows.some((x) => x.errors.length))
          fail("오류 행을 수정한 뒤 다시 업로드해 주세요.");
        const current = new Map(
          inventory(actor).map((p) => [key(p.id, p.optionId), p]),
        );
        for (const x of rows)
          if (
            !unchanged(
              current.get(key(x.after.productId, x.after.optionId)),
              x.before,
            )
          )
            fail(
              "주문이나 수정으로 수량이 변경됐습니다. 최신 양식으로 다시 확인해 주세요.",
              409,
            );
        for (const x of rows)
          api.beta.updateInventory(actor, x.after.productId, {
            ...x.after,
            revision: x.before.revision,
          });
        db.prepare(
          "UPDATE beta_inventory_imports SET status='applied' WHERE id=?",
        ).run(id);
        audit(actor, "inventory.batch_applied", id, { count: rows.length });
        return { id, applied: rows.length };
      });
    },
    inventoryHistory(actor) {
      adminOnly(actor);
      return db
        .prepare(
          "SELECT id,rows FROM beta_inventory_imports WHERE status='applied' ORDER BY rowid DESC LIMIT 20",
        )
        .all()
        .map((r) => ({ id: r.id, count: JSON.parse(r.rows).length }));
    },
  };
}
