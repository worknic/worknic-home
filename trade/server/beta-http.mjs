import { randomBytes } from "node:crypto";
import { TradeError } from "./store.mjs";
import { readPriceWorkbook, priceWorkbook } from "./pricing.mjs";
import { statement } from "./statement.mjs";
const fail = (m, s = 400) => {
  throw new TradeError(m, s);
};
export function createBetaRouter({
  store,
  os,
  origin,
  demo = false,
  trustProxy = false,
}) {
  const bridges = new Map();
  return async (req, res, url, { json, cookie, getToken }) => {
    if (!url.pathname.startsWith("/api/beta/")) return false;
    const path = url.pathname.slice("/api/beta".length),
      method = req.method,
      remoteIp = trustProxy
        ? String(req.headers["x-forwarded-for"] || req.socket.remoteAddress)
            .split(",")[0]
            .trim()
        : req.socket.remoteAddress;
    if (!["GET", "POST"].includes(method))
      fail("지원하지 않는 요청입니다.", 405);
    if (method === "POST" && req.headers.origin !== new URL(origin).origin)
      fail("이 사이트에서 다시 요청해 주세요.", 403);
    store.limit("beta:" + remoteIp, 200, 60000);
    const actor = store.authenticate(getToken(req)),
      admin = actor?.role === "admin" && actor.status === "approved";
    let input = {};
    if (method === "POST") {
      let length = 0,
        chunks = [];
      for await (const c of req) {
        length += c.length;
        if (
          length >
          (path === "/admin/prices/file" ? 5 * 1024 * 1024 : 1024 * 1024)
        )
          fail("요청 크기를 줄여 주세요.", 413);
        chunks.push(c);
      }
      const buf = Buffer.concat(chunks);
      if (path === "/admin/prices/file") {
        if (!admin) fail("관리자 권한이 필요합니다.", 403);
        input = { rows: await readPriceWorkbook(buf) };
      } else {
        if (
          !/^application\/json(?:;|$)/i.test(req.headers["content-type"] || "")
        )
          fail("JSON 요청 필요", 415);
        try {
          input = JSON.parse(buf.toString());
          if (!input || Array.isArray(input) || typeof input !== "object")
            throw Error();
        } catch {
          fail("입력 내용 확인");
        }
      }
    }
    const send = (v, s = 200, headers = {}) => {
      json(res, v, s, headers);
      return true;
    };
    if (path === "/health" && method === "GET") {
      const publicOrigins = new Set([
        "https://worknic.co.kr",
        "https://www.worknic.co.kr",
      ]);
      return send(
        {
          ok: true,
          approvalBridgeConfigured: demo || os.configured(),
          ...store.beta.runtime(),
        },
        200,
        publicOrigins.has(req.headers.origin)
          ? {
              "Access-Control-Allow-Origin": req.headers.origin,
              Vary: "Origin",
            }
          : {},
      );
    }
    if (path === "/public-catalog" && method === "GET") {
      const d = await os.publicCatalog();
      return send({
        brands: d.brands.map((b) => ({
          id: b.id,
          name: b.name,
          english: b.english,
          logo: b.logo,
        })),
        products: d.products
          .filter((p) => p.published === true)
          .map((p) => ({
            id: p.id,
            name: p.name,
            brand: p.brand,
            model: p.model,
            summary: p.summary,
            specs: p.specs,
            images: p.images,
            variants: p.variants || [],
            thumbnail: p.guide?.media?.thumbnail,
          })),
      });
    }
    if (path === "/activate" && method === "POST")
      return send(store.beta.activate(input.token, input.password));
    if (path === "/password/forgot" && method === "POST") {
      store.limit("recovery-ip:" + remoteIp, 5, 3600000);
      store.limit(
        "recovery-name:" +
          String(input.username || "")
            .trim()
            .toLowerCase()
            .slice(0, 80),
        3,
        3600000,
      );
      return send(store.beta.requestRecovery(input));
    }
    if (path === "/password/reset" && method === "POST") {
      store.limit("recovery-reset:" + remoteIp, 10, 3600000);
      return send(store.beta.resetPassword(input.token, input.password));
    }
    if (path === "/register" && method === "POST") {
      if (!store.beta.config().registrationEnabled)
        fail("베타 회원 접수를 준비하고 있습니다.", 409);
      store.limit("beta-register:" + remoteIp, 5, 3600000);
      const r = store.register(input);
      try {
        await os.apply(input);
      } catch (e) {
        return send(
          {
            ...r,
            osReceipt: "retry_required",
            message:
              "계정이 준비됐지만 OS 신청 접수를 확인하지 못했습니다. 로그인 후 접수 다시 보내기를 눌러 주세요.",
          },
          201,
        );
      }
      return send({ ...r, osReceipt: "received" }, 201);
    }
    if (path === "/admin/os-connect" && method === "POST") {
      const verified = await os.authorize(input.token);
      const { createHash } = await import("node:crypto"),
        username =
          "os_" +
          createHash("sha256")
            .update(verified.actor)
            .digest("hex")
            .slice(0, 16),
        password = randomBytes(32).toString("hex");
      const connected = store.osAdmin(username, password, verified.actor);
      const session = store.session(connected);
      bridges.set(connected.id, {
        token: input.token,
        expires: Date.now() + 55 * 60000,
      });
      return send({ member: connected }, 200, {
        "Set-Cookie": cookie(session.token, 3300),
      });
    }
    if (!actor) fail("로그인이 필요합니다.", 401);
    if (admin && !demo) {
      const bridge = bridges.get(actor.id);
      if (!bridge || bridge.expires < Date.now())
        fail("OS에서 관리자 연결을 다시 열어 주세요.", 401);
      await os.authorize(bridge.token);
    }
    async function approve() {
      if (actor.role === "admin") return;
      const b = store.beta.binding(actor);
      if (!b?.activated) fail("OS 승인과 계정 본인 확인을 완료해 주세요.", 403);
      if (demo) return;
      const proof = await os.status(actor.profile, b.request_id);
      if (proof.status !== "approved" || proof.id !== b.request_id)
        fail("사업자 거래 승인이 유효하지 않습니다.", 403);
    }
    if (path === "/me" && method === "GET") {
      const binding = store.beta.binding(actor);
      let member = actor;
      if (!admin && binding?.activated && !demo) {
        const proof = await os.status(actor.profile, binding.request_id);
        if (
          proof.id !== binding.request_id ||
          !["approved", "pending", "rejected", "suspended"].includes(
            proof.status,
          )
        )
          fail("OS 승인 상태를 확인해 주세요.", 503);
        member = { ...actor, status: proof.status };
      }
      return send({
        member,
        bound: !!binding?.activated,
      });
    }
    if (path === "/receipt-retry" && method === "POST") {
      store.limit("receipt:" + actor.id, 3, 3600000);
      await os.apply(actor.profile);
      return send({ received: true });
    }
    if (path === "/catalog" && method === "GET") {
      await approve();
      return send({ products: store.beta.catalog(actor) });
    }
    if (path === "/quotes") {
      await approve();
      return send(
        method === "GET"
          ? { quotes: store.beta.quotes(actor) }
          : { quote: store.beta.createQuote(actor, input) },
        method === "POST" ? 201 : 200,
      );
    }
    const q = path.match(/^\/quotes\/([a-f0-9-]{36})(?:\/(accept|print))?$/);
    if (q) {
      await approve();
      if (q[2] === "accept" && method === "POST")
        return send({ order: store.beta.acceptQuote(actor, q[1], input) });
      if (q[2] === "print" && method === "GET") {
        const quote = store.beta.quote(actor, q[1]);
        if (!["issued", "accepted"].includes(quote.status))
          fail("발행된 견적서가 없습니다.", 409);
        const member = admin
          ? store.members(actor).find((m) => m.id === quote.memberId)
          : actor;
        const html = statement({
          ...quote,
          buyer: member.profile,
          number: "견적 " + quote.id.slice(0, 8),
          createdAt: quote.issuedAt,
          dueAt: quote.expiresAt,
          shippingFee: quote.pickupFee,
          shippingLabel: "픽업 비용",
          status: "quote",
        }).replaceAll("거래명세서", "견적서");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return true;
      }
      if (method === "GET")
        return send({ quote: store.beta.quote(actor, q[1]) });
    }
    if (path === "/orders" && method === "GET") {
      await approve();
      return send({
        orders: store.orders(actor).map((o) => ({
          ...o,
          refundHold: store.beta.hasRefundHold(o.id),
          procurement: store.beta.procurementStage(actor, o.id),
          pickup:
            o.fulfillment?.method === "pickup"
              ? store.beta.pickup(actor, o.id)
              : null,
        })),
      });
    }
    const cancellation = path.match(/^\/orders\/([a-f0-9-]{36})\/cancel$/);
    if (cancellation && method === "POST") {
      await approve();
      return send({
        order: store.beta.cancelUnpaid(actor, cancellation[1], input),
      });
    }
    if (path === "/refunds") {
      await approve();
      return send(
        method === "GET"
          ? { refunds: store.beta.refunds(actor) }
          : { refund: store.beta.requestRefund(actor, input.orderId, input) },
        method === "GET" ? 200 : 201,
      );
    }
    const document = path.match(/^\/orders\/([a-f0-9-]{36})\/statement$/);
    if (document && method === "GET") {
      await approve();
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(statement(store.order(actor, document[1])));
      return true;
    }
    const pickup = path.match(/^\/orders\/([a-f0-9-]{36})\/(code|received)$/);
    if (pickup && method === "POST") {
      await approve();
      store.limit("pickup-code:" + actor.id, 10, 60000);
      return send(
        pickup[2] === "code"
          ? store.beta.revealPin(actor, pickup[1])
          : store.beta.reportPickup(actor, pickup[1], input),
      );
    }
    if (path.startsWith("/admin/")) {
      if (!admin) fail("관리자 권한이 필요합니다.", 403);
      if (path === "/admin/recovery" && method === "GET")
        return send({ requests: store.beta.recoveryRequests(actor) });
      if (path === "/admin/recovery/issue" && method === "POST") {
        const request = store.beta
          .recoveryRequests(actor)
          .find((r) => r.id === input.id);
        if (!request) fail("복구 요청을 찾을 수 없습니다.", 404);
        const binding = store.beta.binding({ id: request.member_id });
        const proof = demo
          ? { id: binding?.request_id }
          : await os.find(bridges.get(actor.id).token, request.profile);
        return send(
          store.beta.issueRecovery(actor, input.id, {
            ...input,
            osRequestId: proof.id,
          }),
        );
      }
      if (path === "/admin/refunds" && method === "GET")
        return send({ refunds: store.beta.refunds(actor) });
      if (path === "/admin/refunds/request" && method === "POST")
        return send(
          { refund: store.beta.requestRefund(actor, input.orderId, input) },
          201,
        );
      if (path === "/admin/refunds/review" && method === "POST")
        return send({
          refund: store.beta.reviewRefund(actor, input.id, input),
        });
      if (path === "/admin/refunds/complete" && method === "POST")
        return send({
          refund: store.beta.completeRefund(actor, input.id, input),
        });
      if (path === "/admin/prices/template" && method === "GET") {
        const file = await priceWorkbook(store.beta.priceRows(actor));
        res.writeHead(200, {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": 'attachment; filename="worknic-prices.xlsx"',
        });
        res.end(file);
        return true;
      }
      if (path === "/admin/prices/file" && method === "POST")
        return send(store.beta.previewPrices(actor, input.rows));
      if (path === "/admin/prices/undetermined" && method === "POST")
        return send(store.beta.markAllPricesUndetermined(actor, input));
      if (path === "/admin/prices/apply" && method === "POST")
        return send(store.beta.applyPrices(actor, input.id));
      if (path === "/admin/prices/history" && method === "GET")
        return send({ history: store.beta.priceHistory(actor) });
      if (path === "/admin/prices/restore" && method === "POST")
        return send(store.beta.restorePrices(actor, input.id));
      if (path === "/admin/locations")
        return send({
          locations:
            method === "POST"
              ? store.beta.updateLocation(actor, input.id, input)
              : store.beta.locations(),
        });
      if (path === "/admin/slots")
        return send(
          method === "POST"
            ? store.beta.saveSlot(actor, input)
            : { slots: store.beta.slots(actor) },
        );
      if (path === "/admin/config") {
        if (
          method === "POST" &&
          (input.betaEnabled || input.registrationEnabled) &&
          !demo &&
          !os.configured()
        )
          fail("OS 승인 서버 연결을 먼저 설정해 주세요.", 409);
        return send(
          method === "POST"
            ? store.beta.updateConfig(actor, input)
            : store.beta.config(),
        );
      }
      if (path === "/admin/policies/standard-cancellation" && method === "POST")
        return send(store.beta.confirmStandardCancellation(actor, input));
      if (path === "/admin/policies/special-cancellation" && method === "POST")
        return send(store.beta.confirmSpecialCancellation(actor, input));
      if (path === "/admin/orders/special-start" && method === "POST")
        return send(store.beta.markSpecialStarted(actor, input.id, input));
      if (path === "/admin/catalog-sync" && method === "POST") {
        const d = await os.publicCatalog();
        return send(store.importCatalog(actor, d));
      }
      if (path === "/admin/quotes" && method === "GET") {
        const members = new Map(
          store.members(actor).map((m) => [m.id, m.profile]),
        );
        return send({
          quotes: store.beta.quotes(actor).map((q) => ({
            ...q,
            companyName: members.get(q.memberId)?.companyName,
            businessNumber: members.get(q.memberId)?.businessNumber,
          })),
        });
      }
      if (path === "/admin/quotes/issue" && method === "POST")
        return send({ quote: store.beta.issueQuote(actor, input.id, input) });
      if (path === "/admin/members" && method === "GET")
        return send({ members: store.members(actor) });
      if (path === "/admin/members/bind" && method === "POST") {
        const m = store.members(actor).find((x) => x.id === input.id);
        if (!m) fail("회원 확인", 404);
        const proof = demo
          ? {
              id: "demo-os",
              status: "approved",
              businessNumber: m.profile.businessNumber,
              email: m.profile.email,
            }
          : await os.find(bridges.get(actor.id).token, m.profile);
        return send(
          store.beta.bindMember(actor, m.id, {
            ...proof,
            contactVerified: input.contactVerified === true,
          }),
        );
      }
      if (path === "/admin/orders" && method === "GET")
        return send({
          orders: store.orders(actor).map((o) => ({
            ...o,
            refundHold: store.beta.hasRefundHold(o.id),
            procurement: store.beta.procurementStage(actor, o.id),
            pickup:
              o.fulfillment?.method === "pickup"
                ? store.beta.pickup(actor, o.id)
                : null,
          })),
        });
      if (path === "/admin/orders/update" && method === "POST") {
        if (!["confirm_payment", "prepare"].includes(input.action))
          fail("올바른 준비 작업 선택");
        if (input.action === "prepare")
          store.beta.assertFulfillmentAllowed(input.id);
        return send({ order: store.updateOrder(actor, input.id, input) });
      }
      if (path === "/admin/pickups/ready" && method === "POST")
        return send(store.beta.readyPickup(actor, input.id, input));
      if (path === "/admin/pickups/close" && method === "POST")
        return send(store.beta.closePickup(actor, input.id, input));
      if (path === "/admin/handoffs/ready" && method === "POST")
        return send(store.beta.readyHandoff(actor, input.id, input));
      if (path === "/admin/handoffs/close" && method === "POST")
        return send(store.beta.closeHandoff(actor, input.id, input));
      if (path === "/admin/products" && method === "GET")
        return send({ products: store.beta.inventory(actor) });
      if (path === "/admin/products/stock" && method === "POST")
        return send(store.beta.updateInventory(actor, input.id, input));
    }
    fail("요청한 기능을 찾을 수 없습니다.", 404);
  };
}
