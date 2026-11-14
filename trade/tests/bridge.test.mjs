import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createOSAdapter } from "../server/os-adapter.mjs";
test("시트에서 숫자로 반환한 사업자번호도 문자열 계정과 정확히 대조", async () => {
  const row = { id: "numeric-sheet-id", businessNumber: 9987412863,
    email: "QA@example.invalid", status: "approved", revision: 2 };
  const adapter = createOSAdapter({fetcher: async () => ({ok: true,
    json: async () => ({ok: true, data: {rows: [row]}})})});
  const proof = await adapter.find("test-session", {
    businessNumber: "9987412863", email: "qa@example.invalid" });
  assert.equal(proof.businessNumber, "9987412863");
  assert.equal(proof.email, "qa@example.invalid");
  assert.equal(proof.status, "approved");
  assert.equal(row.businessNumber, 9987412863);
  await assert.rejects(adapter.find("test-session", {
    businessNumber: "9987412864", email: "qa@example.invalid" }), /대조/);
  await assert.rejects(adapter.find("test-session", {
    businessNumber: "9987412863", email: "other@example.invalid" }), /대조/);
});
test("가입 접수는 OS에 필요한 사업자 연락처만 전달하고 계정 비밀번호를 전송하지 않음", async () => {
  const requests = [],
    adapter = createOSAdapter({
      fetcher: async (url, init) => {
        const r = JSON.parse(init.body);
        requests.push(r);
        return {
          ok: true,
          json: async () => ({
            ok: true,
            data:
              r.action === "business.challenge"
                ? { token: "challenge-test" }
                : { status: "received" },
          }),
        };
      },
    });
  await adapter.apply({
    companyName: "검증",
    businessNumber: "1234567891",
    contactName: "검증",
    phone: "010-0000-0000",
    email: "qa@example.invalid",
    password: "never-forward-this",
    address: "private address",
    username: "qa_buyer",
  });
  const p = requests[1].payload;
  assert.equal(p.password, undefined);
  assert.equal(p.address, undefined);
  assert.equal(p.username, undefined);
  assert.equal(p.challenge, "challenge-test");
  assert.equal(p.consentVersion, "business-2026-11-07");
});
test("OS 서명 브리지: 정확한 계정만 조회·변조/재전송/만료 차단·기존 라우트 보존", () => {
  const secret = "test_only_secret_12345678901234567890",
    cache = new Map(),
    now = Date.now();
  let legacy = 0;
  const c = {
    Date,
    Number,
    JSON,
    PropertiesService: {
      getScriptProperties: () => ({ getProperty: () => secret }),
    },
    Utilities: {
      computeHmacSha256Signature: (m, s) => [
        ...createHmac("sha256", s).update(m).digest(),
      ],
    },
    LockService: {
      getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }),
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => cache.get(k),
        put: (k, v) => cache.set(k, v),
      }),
    },
    wnbTables_: () => ({ requests: {} }),
    WNB_HEADERS_: [],
    wnbRows_: () => [
      {
        id: "request-1",
        businessNumber: "1234567891",
        email: "test@example.invalid",
        status: "approved",
        revision: 3,
      },
    ],
    worknicLegacyDoPost_: () => {
      legacy++;
      return "legacy";
    },
    ContentService: {
      MimeType: { JSON: "json" },
      createTextOutput: (t) => ({ setMimeType: () => JSON.parse(t) }),
    },
  };
  vm.runInNewContext(
    readFileSync(new URL("../os/TradeBridge.gs", import.meta.url), "utf8"),
    c,
  );
  const sign = (payload, timestamp = now) => {
    const r = { timestamp, nonce: randomUUID(), payload };
    return {
      ...r,
      signature: createHmac("sha256", secret)
        .update(JSON.stringify(r))
        .digest("hex"),
    };
  };
  const p = sign({
    requestId: "request-1",
    businessNumber: "1234567891",
    email: "test@example.invalid",
  });
  assert.equal(c.worknicTradeStatus_(p).status, "approved");
  assert.throws(() => c.worknicTradeStatus_(p), /REPLAY/);
  assert.throws(
    () => c.worknicTradeStatus_(sign(p.payload, now - 61000)),
    /UNAUTHORIZED/,
  );
  const tampered = sign(p.payload);
  tampered.payload = { ...p.payload, email: "other@example.invalid" };
  assert.throws(() => c.worknicTradeStatus_(tampered), /UNAUTHORIZED/);
  assert.throws(
    () =>
      c.worknicTradeStatus_(
        sign({ ...p.payload, email: "other@example.invalid" }),
      ),
    /NOT_FOUND/,
  );
  assert.equal(
    c.doPost({
      postData: { contents: JSON.stringify({ action: "catalog.get" }) },
    }),
    "legacy",
  );
  assert.equal(legacy, 1);
});
test("OS 어댑터: 비관리자·승인 응답 오류·미설정 브리지에서 접근 거절", async () => {
  const adapter = createOSAdapter({
    sharedSecret: "test".repeat(10),
    fetcher: async () => ({
      ok: true,
      json: async () => ({
        ok: true,
        data: { role: "customer", actor: "invalid" },
      }),
    }),
  });
  await assert.rejects(adapter.authorize("test-token"), /관리자/);
  await assert.rejects(
    createOSAdapter().status(
      { businessNumber: "1234567891", email: "test@example.invalid" },
      "id",
    ),
    /준비/,
  );
  const broken = createOSAdapter({
    sharedSecret: "test".repeat(10),
    fetcher: async () => {
      throw Error("offline");
    },
  });
  await assert.rejects(
    broken.status(
      { businessNumber: "1234567891", email: "test@example.invalid" },
      "id",
    ),
    /연결/,
  );
});
