// Offline recovery to a NEW directory only. Never overwrites the operating database.
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { decryptBackup } from "./backup-service.mjs";
const [archive, destination] = process.argv.slice(2);
if (!archive || !destination || !process.env.TRADE_PICKUP_KEY)
  throw Error(
    "암호화 백업 파일·새 복구 폴더·해당 시점의 복구 키 설정이 필요합니다.",
  );
const bytes = decryptBackup(
  await readFile(resolve(archive)),
  process.env.TRADE_PICKUP_KEY,
);
await mkdir(resolve(destination), { mode: 0o700 });
const output = join(resolve(destination), "trade.sqlite");
await writeFile(output, bytes, { flag: "wx", mode: 0o600 });
const db = new DatabaseSync(output, { readOnly: true });
try {
  if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
    throw Error("복구 파일 무결성 확인 실패");
} finally {
  db.close();
}
console.log(
  "새 비공개 폴더로 복구·무결성 검증 완료. 운영 데이터 교체는 수행하지 않았습니다.",
);
