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
import {
  inventoryWorkbook,
  readInventoryWorkbook,
} from "../server/inventory.mjs";
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
        find: async () => ({ id: "os-test", status: "approved" }),
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
    const officialHealth = await fetch(base + "/api/beta/health", {
      headers: { Origin: "https://worknic.co.kr" },
    });
    assert.equal(
      officialHealth.headers.get("access-control-allow-origin"),
      "https://worknic.co.kr",
    );
    assert.equal(
      officialHealth.headers.get("access-control-allow-credentials"),
      null,
    );
    assert.equal((await officialHealth.json()).member, undefined);
    assert.equal(
      (
        await fetch(base + "/api/beta/health", {
          headers: { Origin: "https://other.invalid" },
        })
      ).headers.get("access-control-allow-origin"),
      null,
    );
    const me = await fetch(base + "/api/beta/me", {
      headers: { ...headers, Origin: "https://worknic.co.kr" },
    });
    assert.equal(me.headers.get("access-control-allow-origin"), null);
    assert.equal((await me.json()).member.status, "approved");
    assert.equal(
      (
        await fetch(base + "/api/beta/quotes", {
          method: "POST",
          headers: {
            ...headers,
            Origin: "https://worknic.co.kr",
            "Content-Type": "application/json",
          },
          body: "{}",
        })
      ).status,
      403,
    );
    assert.equal(
      (await fetch(base + "/api/beta/catalog", { headers })).status,
      200,
    );
    status = "suspended";
    assert.equal(
      (await (await fetch(base + "/api/beta/me", { headers })).json()).member
        .status,
      "suspended",
    );
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
    assert.equal((await fetch(base + "/trade/entry-intent.js")).status, 200);
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
    const post = async (path, input, cookie = "") =>
      fetch(base + "/api/beta" + path, {
        method: "POST",
        headers: {
          Origin: "http://localhost",
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: JSON.stringify(input),
      });
    for (const path of ["/refunds", "/admin/refunds", "/admin/recovery"])
      assert.equal((await fetch(base + "/api/beta" + path)).status, 401);
    assert.equal(
      (await fetch(base + "/api/beta/admin/refunds", { headers })).status,
      403,
    );
    const recoveryKnown = await post("/password/forgot", {
      username: "buyer",
      email: "test@example.invalid",
    });
    const recoveryUnknown = await post("/password/forgot", {
      username: "missing",
      email: "none@example.invalid",
    });
    assert.equal(recoveryKnown.status, 200);
    assert.deepEqual(await recoveryKnown.json(), await recoveryUnknown.json());
    const connected = await post("/admin/os-connect", {
        token: "synthetic-os-token",
      }),
      adminCookie = connected.headers.get("set-cookie").split(";")[0];
    const queue = await (
      await fetch(base + "/api/beta/admin/recovery", {
        headers: { Cookie: adminCookie },
      })
    ).json();
    const adminHeaders = { Cookie: adminCookie };
    assert.equal((await fetch(base + "/api/beta/admin/readiness")).status, 401);
    assert.equal(
      (await fetch(base + "/api/beta/admin/inventory/template", { headers }))
        .status,
      403,
    );
    const readyResponse = await fetch(base + "/api/beta/admin/readiness", {
      headers: adminHeaders,
    });
    assert.equal(readyResponse.status, 200);
    const readiness = await readyResponse.json();
    assert.equal(readiness.intake.quotes, false);
    assert.equal(readiness.intake.registration, false);
    assert.equal(readiness.members, undefined);
    const template = await fetch(base + "/api/beta/admin/inventory/template", {
      headers: adminHeaders,
    });
    assert.equal(template.status, 200);
    assert.equal(template.headers.get("cache-control"), "no-store");
    assert.equal(
      (await readInventoryWorkbook(Buffer.from(await template.arrayBuffer())))
        .length,
      0,
    );
    store.seedCatalog({
      brands: [],
      products: [
        { id: "stock_http", name: "재고 검증", published: true, images: [] },
      ],
    });
    const stockFile = await inventoryWorkbook(
      store.beta.inventory(store.authenticate(adminCookie.split("=")[1])),
    );
    const upload = async (cookie, origin = "http://localhost") =>
      fetch(base + "/api/beta/admin/inventory/file", {
        method: "POST",
        headers: {
          Origin: origin,
          Cookie: cookie,
          "Content-Type": "application/octet-stream",
        },
        body: stockFile,
      });
    assert.equal(
      (await upload(adminCookie, "https://example.invalid")).status,
      403,
    );
    assert.equal((await upload(headers.Cookie)).status, 403);
    const preview = await upload(adminCookie);
    assert.equal(preview.status, 200);
    const stockPreview = await preview.json();
    assert.equal(stockPreview.invalid, 0);
    assert.equal(
      (
        await post(
          "/admin/inventory/apply",
          { id: stockPreview.id },
          adminCookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await post(
          "/admin/inventory/apply",
          { id: stockPreview.id },
          adminCookie,
        )
      ).status,
      409,
    );
    assert.equal(store.beta.config().betaEnabled, false);
    assert.equal(
      store.beta.priceRows(store.authenticate(adminCookie.split("=")[1]))[0]
        .price,
      null,
    );
    assert.equal(queue.requests.length, 1);
    assert.equal(queue.requests[0].token, undefined);
    assert.equal(
      (
        await post(
          "/admin/recovery/issue",
          { id: queue.requests[0].id },
          adminCookie,
        )
      ).status,
      400,
    );
    const issued = await post(
      "/admin/recovery/issue",
      { id: queue.requests[0].id, contactVerified: true },
      adminCookie,
    );
    assert.equal(issued.status, 200);
    const recovery = await issued.json();
    assert.ok(recovery.token);
    assert.equal(
      (
        await post("/password/reset", {
          token: recovery.token,
          password: "new synthetic passphrase",
        })
      ).status,
      200,
    );
    assert.equal((await fetch(base + "/api/beta/me", { headers })).status, 401);
    assert.equal(
      (
        await post("/password/reset", {
          token: recovery.token,
          password: "another synthetic passphrase",
        })
      ).status,
      400,
    );
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
