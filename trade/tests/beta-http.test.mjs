import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { openStore, TradeError } from "../server/store.mjs";
import { createTradeServer } from "../server/http.mjs";
import { priceWorkbook, readPriceWorkbook } from "../server/pricing.mjs";
test("베타 HTTP: 승인 취소 즉시 차단·연동 장애 시 거절·레거시 우회/CSRF/비공개 파일 차단", async () => {
  const dir = mkdtempSync(join(tmpdir(), "worknic-http-")),
    store = openStore(join(dir, "db.sqlite"), {
      betaOptions: { pickupKey: "33".repeat(32) },
    });
  let server;
  try {
    store.createAdmin("staff", "test staff passphrase");
    const admin = store.login("staff", "test staff passphrase");
    store.register({
      username: "buyer",
      password: "test buyer passphrase",
      companyName: "검증",
      businessNumber: "1234567891",
      contactName: "검증",
      phone: "010-0000-0000",
      email: "test@example.invalid",
      postalCode: "11111",
      address: "검증",
      consent: true,
    });
    const m = store.members(admin)[0],
      activation = store.beta.bindMember(admin, m.id, {
        id: "os-test",
        status: "approved",
        email: m.profile.email,
        businessNumber: m.profile.businessNumber,
        contactVerified: true,
      });
    store.beta.activate(activation.token, "test buyer passphrase");
    const buyer = store.login("buyer", "test buyer passphrase"),
      session = store.session(buyer);
    let status = "approved",
      offline = false;
    const data = { brands: [], products: [] },
      os = {
        configured: () => true,
        publicCatalog: async () => data,
        status: async () => {
          if (offline) throw new TradeError("OS 연결 오류", 503);
          return { id: "os-test", status };
        },
        authorize: async () => ({ actor: "검증", role: "admin" }),
      };
    server = createTradeServer({
      store,
      root: fileURLToPath(new URL("../../", import.meta.url)),
      origin: "http://localhost",
      secure: false,
      betaMode: true,
      os,
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const base = "http://127.0.0.1:" + server.address().port,
      headers = { Cookie: "worknic_trade=" + session.token };
    assert.equal(
      (await fetch(base + "/api/beta/catalog", { headers })).status,
      200,
    );
    status = "suspended";
    assert.equal(
      (await fetch(base + "/api/beta/catalog", { headers })).status,
      403,
    );
    offline = true;
    assert.equal(
      (await fetch(base + "/api/beta/catalog", { headers })).status,
      503,
    );
    for (const path of [
      "/api/trade/catalog",
      "/api/trade/orders",
      "/trade/server/store.mjs",
      "/trade/.env",
      "/data/catalog.json",
      "/trade/node_modules/exceljs/package.json",
    ])
      assert.equal((await fetch(base + path, { headers })).status, 404, path);
    assert.equal(
      (
        await fetch(base + "/api/beta/quotes", {
          method: "POST",
          headers: {
            ...headers,
            Origin: "https://other.invalid",
            "Content-Type": "application/json",
          },
          body: "{}",
        })
      ).status,
      403,
    );
    const manifest = await fetch(base + "/trade/manifest.webmanifest");
    assert.equal(
      manifest.headers.get("content-type"),
      "application/manifest+json",
    );
    assert.equal((await manifest.json()).scope, "/trade/");
    const code = await fetch(
      base + "/api/beta/orders/00000000-0000-0000-0000-000000000000/code",
      {
        method: "POST",
        headers: {
          Origin: "http://localhost",
          "Content-Type": "application/json",
        },
        body: "{}",
      },
    );
    assert.equal(code.status, 401);
    assert.equal(code.headers.get("cache-control"), "no-store");
  } finally {
    if (server) await new Promise((r) => server.close(r));
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test("엑셀 수식과 외부 링크는 값을 신뢰하지 않고 거절", async () => {
  const original = await priceWorkbook([
    { productId: "p1", optionId: "default", name: "검증", revision: 0 },
  ]);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(original);
  wb.getWorksheet("판매가").getCell("G2").value = { formula: "1+2", result: 3 };
  await assert.rejects(
    readPriceWorkbook(Buffer.from(await wb.xlsx.writeBuffer())),
    /수식/,
  );
  wb.getWorksheet("판매가").getCell("G2").value = {
    text: "조회",
    hyperlink: "https://example.invalid",
  };
  await assert.rejects(
    readPriceWorkbook(Buffer.from(await wb.xlsx.writeBuffer())),
    /하이퍼링크/,
  );
});
