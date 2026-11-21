import ExcelJS from "exceljs";
import { inflateRawSync } from "node:zlib";
import { TradeError } from "./store.mjs";

export const PRICE_HEADERS = [
  "상품번호",
  "옵션번호",
  "브랜드",
  "상품명",
  "모델",
  "판매단위",
  "판매가",
  "부가세기준",
  "가격상태",
  "적용일",
  "수정번호",
];
const bad = (m) => {
  throw new TradeError(m);
};
export function guardWorkbook(buffer) {
  if (
    !Buffer.isBuffer(buffer) ||
    buffer.length < 22 ||
    buffer.length > 5 * 1024 * 1024 ||
    buffer.readUInt32LE(0) !== 0x04034b50
  )
    bad("5MB 이하의 .xlsx 파일을 선택해 주세요.");
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--)
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  if (end < 0) bad("엑셀 파일 구조를 확인해 주세요.");
  const entries = buffer.readUInt16LE(end + 10),
    offset = buffer.readUInt32LE(end + 16);
  if (entries > 500 || !entries)
    bad("워크시트 수 또는 파일 크기를 줄여 주세요.");
  let p = offset,
    total = 0;
  for (let i = 0; i < entries; i++) {
    if (p + 46 > end || buffer.readUInt32LE(p) !== 0x02014b50)
      bad("엑셀 압축 목록이 올바르지 않습니다.");
    const flags = buffer.readUInt16LE(p + 8),
      size = buffer.readUInt32LE(p + 24),
      nameLength = buffer.readUInt16LE(p + 28),
      extra = buffer.readUInt16LE(p + 30),
      comment = buffer.readUInt16LE(p + 32);
    const name = buffer.subarray(p + 46, p + 46 + nameLength).toString();
    total += size;
    if (
      flags & 1 ||
      total > 24 * 1024 * 1024 ||
      size > 8 * 1024 * 1024 ||
      /vbaProject|externalLinks/i.test(name) ||
      name.includes("..")
    )
      bad("암호·매크로·외부 연결이 없는 작은 .xlsx 파일을 사용해 주세요.");
    const local = buffer.readUInt32LE(p + 42),
      compressed = buffer.readUInt32LE(p + 20),
      method = buffer.readUInt16LE(p + 10);
    if (
      local + 30 > offset ||
      buffer.readUInt32LE(local) !== 0x04034b50 ||
      ![0, 8].includes(method) ||
      p + 46 + nameLength + extra + comment > end
    )
      bad("엑셀 압축 구조를 확인해 주세요.");
    const start =
      local +
      30 +
      buffer.readUInt16LE(local + 26) +
      buffer.readUInt16LE(local + 28);
    if (start + compressed > offset) bad("엑셀 압축 범위를 확인해 주세요.");
    try {
      const payload = buffer.subarray(start, start + compressed),
        actual =
          method === 8
            ? inflateRawSync(payload, { maxOutputLength: 8 * 1024 * 1024 })
            : payload;
      if (actual.length !== size) bad("엑셀 압축 크기가 올바르지 않습니다.");
    } catch {
      bad("엑셀 압축 크기가 올바르지 않습니다.");
    }
    p += 46 + nameLength + extra + comment;
  }
}
export async function readPriceWorkbook(buffer) {
  guardWorkbook(buffer);
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch {
    bad("엑셀 파일을 읽지 못했습니다.");
  }
  const sheet = wb.getWorksheet("판매가");
  if (!sheet || sheet.rowCount > 5001 || sheet.columnCount > 30)
    bad("판매가 시트는 최대 5,000행까지 지원합니다.");
  const headers = sheet
    .getRow(1)
    .values.slice(1)
    .map((v) => String(v ?? "").trim());
  if (PRICE_HEADERS.some((h, i) => headers[i] !== h))
    bad("양식을 내려받아 열 제목과 순서를 유지해 주세요.");
  const rows = [];
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r),
      v = { row: r };
    if (!row.hasValues) continue;
    let any = false;
    for (let i = 0; i < PRICE_HEADERS.length; i++) {
      const value = row.getCell(i + 1).value;
      if (value !== null && value !== undefined && value !== "") any = true;
      if (value !== null && typeof value === "object")
        bad(`${r}행: 수식·하이퍼링크 대신 값만 입력해 주세요.`);
      v[PRICE_HEADERS[i]] = value ?? "";
    }
    if (any) rows.push(v);
  }
  return rows;
}
export async function priceWorkbook(records) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "WORKNIC";
  const s = wb.addWorksheet("판매가", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  s.addRow(PRICE_HEADERS);
  s.getRow(1).font = {
    name: "맑은 고딕",
    bold: true,
    color: { argb: "FFFFFFFF" },
  };
  s.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF343E31" },
  };
  s.getRow(1).height = 30;
  const widths = [19, 17, 16, 42, 23, 22, 16, 18, 15, 16, 14];
  s.columns.forEach((c, i) => {
    c.width = widths[i];
  });
  for (const p of records) {
    const row = s.addRow([
      p.productId,
      p.optionId,
      p.brand,
      p.name + (p.optionLabel ? " · " + p.optionLabel : ""),
      p.model,
      p.unit || "",
      p.price ?? "",
      p.taxMode || "",
      p.price === null || p.price === undefined ? "미정" : "확정",
      p.effectiveOn || "",
      p.revision || 0,
    ]);
    row.font = { name: "맑은 고딕", size: 11 };
    row.height = 25;
    for (const col of [1, 2, 5, 10]) row.getCell(col).numFmt = "@";
    for (const col of [6, 7, 8, 9, 10])
      row.getCell(col).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFF0F4EC" },
      };
    row.getCell(7).numFmt = "#,##0";
  }
  s.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: Math.max(1, s.rowCount), column: PRICE_HEADERS.length },
  };
  const n = wb.addWorksheet("입력안내");
  n.columns = [{ width: 105 }];
  for (const text of [
    "WORKNIC 판매가 일괄 관리",
    "상품번호·옵션번호·수정번호는 변경하지 마세요. 단품 옵션번호는 default입니다.",
    "가격을 입력할 때 판매단위, 부가세기준(포함 또는 별도), 가격상태(확정), 적용일(YYYY-MM-DD)을 함께 입력하세요.",
    "가격상태 미정은 별도 문의입니다. 빈 판매가를 0원으로 저장하지 않습니다.",
    "날짜는 YYYY-MM-DD 텍스트로 입력하세요. 수식·외부 연결·매크로·암호 파일은 지원하지 않습니다.",
    "변경 미리보기에서 오류가 없는지 확인한 뒤 적용합니다. 업로드만으로 가격은 변경되지 않습니다.",
    "공개 상품자료와 기존 견적·주문 문서는 변경되지 않습니다.",
  ]) {
    n.addRow([text]);
  }
  n.getRow(1).font = { bold: true, size: 15 };
  for (const r of n.getRows(1, n.rowCount)) {
    r.alignment = { wrapText: true, vertical: "middle" };
    r.height = 34;
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
