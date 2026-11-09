import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { openStore } from "../server/store.mjs";
import { createTradeServer } from "../server/http.mjs";
import { encryptBackup } from "../server/backup-service.mjs";
test("암호화 백업 내보내기는 저장된 영우 신원·CSRF·다운로드 비공개를 검증", async () => {
  const dir = mkdtempSync(join(tmpdir(), "worknic-backup-http-"));
  const store = openStore(join(dir, "trade.sqlite"));
  let server,
    calls = 0;
  try {
    const yw = store.osAdmin("backup_yw", "synthetic staff passphrase", "영우"),
      nk = store.osAdmin("backup_nk", "synthetic staff passphrase", "나경");
    store.beta.confirmRecoveryOperator(yw, {
      revision: store.beta.config().revision,
      value: "영우",
      confirmed: true,
    });
    const archive = encryptBackup(
      Buffer.from("synthetic only"),
      "ab".repeat(32),
    );
    const backups = {
      status: () => ({ configured: true, externalConfigured: false }),
      run: async () => {
        calls++;
        return { filename: "synthetic.wnbk", bytes: archive };
      },
    };
    server = createTradeServer({
      store,
      backups,
      root: fileURLToPath(new URL("../../", import.meta.url)),
      origin: "http://localhost",
      secure: false,
      betaMode: true,
      demo: true,
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const base = "http://127.0.0.1:" + server.address().port,
      cookies = {
        yw: "worknic_trade=" + store.session(yw).token,
        nk: "worknic_trade=" + store.session(nk).token,
      };
    const post = (cookie, origin = "http://localhost") =>
      fetch(base + "/api/beta/admin/backups/export", {
        method: "POST",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          Cookie: cookie || "",
        },
        body: "{}",
      });
    assert.equal((await post()).status, 401);
    assert.equal((await post(cookies.nk)).status, 403);
    assert.equal(
      (await post(cookies.yw, "https://example.invalid")).status,
      403,
    );
    const response = await post(cookies.yw);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), archive);
    assert.equal(calls, 1);
    assert.equal((await post(cookies.yw)).status, 429);
    assert.equal(
      (await fetch(base + "/trade/.runtime/encrypted-backups/status.json"))
        .status,
      404,
    );
    assert.equal(store.beta.config().betaEnabled, false);
  } finally {
    if (server) await new Promise((r) => server.close(r));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
