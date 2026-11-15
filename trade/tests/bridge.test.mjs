import test from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createOSAdapter } from "../server/os-adapter.mjs";
test("��Ʈ���� ���ڷ� ��ȯ�� ����ڹ�ȣ�� ���ڿ� ������ ��Ȯ�� ����", async () => {
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
    businessNumber: "9987412864", email: "qa@example.invalid" }), /����/);
  await assert.rejects(adapter.find("test-session", {
    businessNumber: "9987412863", email: "other@example.invalid" }), /����/);
});
test("���� ������ OS�� �ʿ��� ����� ����ó�� �����ϰ� ���� ��й�ȣ�� �������� ����", async () => {
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
    companyName: "����",
    businessNumber: "1234567891",
    contactName: "����",
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
test("OS ���� �긮��: ��Ȯ�� ������ ��ȸ������/������/���� ���ܡ����� ���Ʈ ����", () => {
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
      Charset: {UTF_8:"UTF-8"},
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
test("OS �����: ������ڡ����� ���� �������̼��� �긮������ ���� ����", async () => {
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
  await assert.rejects(adapter.authorize("test-token"), /������/);
  await assert.rejects(
    createOSAdapter().status(
      { businessNumber: "1234567891", email: "test@example.invalid" },
      "id",
    ),
    /�غ�/,
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
    /����/,
  );
});
