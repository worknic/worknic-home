import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  writeFile,
  rm,
  mkdir,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  encryptBackup,
  decryptBackup,
  createBackupService,
  s3Transport,
} from "../server/backup-service.mjs";
import { refundDue, refundDeadline } from "../server/refund-deadlines.mjs";
const master = "ab".repeat(32);
test("환불 기한: 주말·대체공휴일·KST 경계·연도 미확인 차단", () => {
  assert.equal(
    refundDue("2026-11-09", Date.parse("2026-11-09T00:00:00Z")).dueOn,
    "2026-11-12",
  );
  assert.equal(
    refundDue("2026-10-02", Date.parse("2026-10-02T00:00:00Z")).dueOn,
    "2026-10-08",
  );
  assert.equal(
    refundDue("2026-12-24", Date.parse("2026-12-24T00:00:00Z")).dueOn,
    "2026-12-30",
  );
  assert.equal(
    refundDue("2026-11-09", Date.parse("2026-11-12T14:59:59Z")).status,
    "due_today",
  );
  assert.equal(
    refundDue("2026-11-09", Date.parse("2026-11-12T15:00:00Z")).status,
    "overdue",
  );
  assert.equal(
    refundDue("2027-12-31", Date.now()).status,
    "calendar_unverified",
  );
  assert.equal(refundDue("2026-02-30", Date.now()).status, "trigger_missing");
  assert.equal(refundDue("2026-12-31", Date.now()).dueOn, "2027-01-06");
  assert.equal(refundDue("2026-04-30", Date.now()).dueOn, "2026-05-07");
  assert.equal(refundDue("2027-07-16", Date.now()).dueOn, "2027-07-22");
});
test("검수·승인 지연은 반환/철회 기준의 환불 기한을 늘리지 않음", () => {
  const now = Date.parse("2026-11-20T00:00:00Z");
  const cancel = {
    originalStatus: "paid",
    requestedAt: Date.parse("2026-11-09T01:00:00Z"),
    refundTransferReadyAt: now,
  };
  assert.equal(refundDeadline(cancel, now).dueOn, "2026-11-12");
  const returned = {
    ...cancel,
    originalStatus: "collected",
    returnReceivedOn: "2026-11-10",
    inspectionCompletedOn: "2026-11-19",
  };
  assert.equal(refundDeadline(returned, now).dueOn, "2026-11-13");
  assert.equal(
    refundDeadline({ ...returned, returnReceivedOn: undefined }, now).status,
    "trigger_missing",
  );
});
test("백업 암호화: 원문 비노출·정확한 복구·변조/다른 키 차단", () => {
  const bytes = Buffer.from("합성 고객자료·비밀번호 해시·주문 기록");
  const archive = encryptBackup(bytes, master);
  assert.equal(archive.includes(bytes), false);
  assert.deepEqual(decryptBackup(archive, master), bytes);
  assert.throws(() => decryptBackup(archive, "cd".repeat(32)));
  const changed = JSON.parse(archive);
  changed.tag = "00".repeat(16);
  assert.throws(() =>
    decryptBackup(Buffer.from(JSON.stringify(changed)), master),
  );
});
test("일일 백업: 실제 SQLite 스냅샷·복구 무결성·원본 보존·외부 기본 비활성", async () => {
  const dir = await mkdtemp(join(tmpdir(), "worknic-encrypted-test-"));
  try {
    const db = new DatabaseSync(join(dir, "trade.sqlite"));
    db.exec(
      "PRAGMA journal_mode=WAL; CREATE TABLE data(id INTEGER PRIMARY KEY,value TEXT); INSERT INTO data VALUES(1,'synthetic only');",
    );
    const service = createBackupService({ dataDir: dir, masterKey: master });
    await service.initialized;
    const archive = await service.run();
    assert.ok(archive.filename.endsWith(".wnbk"));
    assert.equal(service.status().externalConfigured, false);
    assert.equal(service.status().lastExternalAt, null);
    assert.equal(await service.run(), null);
    const restore = join(dir, "restore.sqlite");
    await writeFile(restore, decryptBackup(archive.bytes, master));
    const recovered = new DatabaseSync(restore, { readOnly: true });
    assert.equal(
      recovered.prepare("PRAGMA integrity_check").get().integrity_check,
      "ok",
    );
    assert.equal(
      recovered.prepare("SELECT value FROM data WHERE id=1").get().value,
      "synthetic only",
    );
    recovered.close();
    assert.equal(db.prepare("SELECT count(*) AS n FROM data").get().n, 1);
    db.close();
    const destination = join(dir, "new-recovery");
    const command = fileURLToPath(
      new URL("../server/restore-backup.mjs", import.meta.url),
    );
    const result = spawnSync(
      process.execPath,
      [command, join(dir, "encrypted-backups", archive.filename), destination],
      { env: { ...process.env, TRADE_PICKUP_KEY: master }, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.notEqual(
      spawnSync(
        process.execPath,
        [
          command,
          join(dir, "encrypted-backups", archive.filename),
          destination,
        ],
        { env: { ...process.env, TRADE_PICKUP_KEY: master }, encoding: "utf8" },
      ).status,
      0,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("외부 백업 실패는 성공으로 기록하지 않고 같은 암호화 파일을 재시도", async () => {
  const dir = await mkdtemp(join(tmpdir(), "worknic-backup-retry-"));
  try {
    const db = new DatabaseSync(join(dir, "trade.sqlite"));
    db.exec("CREATE TABLE data(id); INSERT INTO data VALUES(1)");
    db.close();
    let offline = true,
      attempts = [];
    const service = createBackupService({
      dataDir: dir,
      masterKey: master,
      transport: {
        putAndVerify: async (filename, bytes) => {
          attempts.push(filename);
          assert.ok(decryptBackup(bytes, master));
          if (offline) throw Error("mock storage unavailable");
        },
      },
    });
    await assert.rejects(service.run(), /실패/);
    assert.equal(service.status().lastExternalAt, null);
    assert.ok(service.status().lastErrorAt);
    offline = false;
    await service.run();
    assert.equal(attempts[0], attempts[1]);
    assert.ok(service.status().lastExternalAt);
    assert.equal(service.status().lastErrorAt, null);
    assert.equal(
      (await readdir(join(dir, "encrypted-backups"))).filter((n) =>
        n.endsWith(".wnbk"),
      ).length,
      1,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test("외부 전송은 명시 승인·HTTPS·인증 후 암호화 파일만 PUT/GET 검증", async () => {
  assert.equal(s3Transport({}), null);
  assert.throws(() =>
    s3Transport({
      TRADE_BACKUP_DESTINATION_APPROVED: "1",
      TRADE_BACKUP_S3_PREFIX: "http://example.invalid/",
    }),
  );
  const calls = [];
  let saved;
  const transport = s3Transport(
    {
      TRADE_BACKUP_DESTINATION_APPROVED: "1",
      TRADE_BACKUP_S3_PREFIX: "https://private.example.invalid/worknic/",
      TRADE_BACKUP_ACCESS_KEY: "synthetic-key",
      TRADE_BACKUP_SECRET_KEY: "synthetic-secret",
      TRADE_BACKUP_REGION: "ap-southeast-1",
    },
    async (url, input) => {
      calls.push({ url: String(url), ...input });
      if (input.method === "PUT") {
        saved = input.body;
        return new Response("", { status: 200 });
      }
      return new Response(saved, { status: 200 });
    },
  );
  const bytes = encryptBackup(Buffer.from("synthetic"), master);
  await transport.putAndVerify("test.wnbk", bytes, Date.now());
  assert.deepEqual(
    calls.map((c) => c.method),
    ["PUT", "GET"],
  );
  assert.ok(
    calls.every((c) => c.headers.authorization.includes("AWS4-HMAC-SHA256")),
  );
  assert.equal(calls[0].headers["if-none-match"], "*");
  assert.equal(calls[0].redirect, "error");
  assert.equal(saved, bytes);
});
