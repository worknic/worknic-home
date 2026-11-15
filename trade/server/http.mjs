import { createServer } from "node:http";
import { readFile, realpath } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { TradeError, verifyTotp } from "./store.mjs";
import { statement } from "./statement.mjs";
import { syncCatalog } from "./catalog-sync.mjs";
import { createBetaRouter } from "./beta-http.mjs";
import { createOSAdapter } from "./os-adapter.mjs";

const MIME = {
  ".webmanifest": "application/manifest+json",
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: data:; font-src 'self'; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'; object-src 'none'";
export function createTradeServer({
  store,
  root,
  origin,
  secure = true,
  adminTotpSecret = "",
  trustProxy = false,
  betaMode = false,
  demo = false,
  os = createOSAdapter(),
  backups = null,
  businessSms = null,
  businessSmsAllowedRequests = [],
  businessSmsMode = 'disabled',
}) {
  const allowedOrigin = new URL(origin).origin;
  const cookieName = secure ? "__Host-worknic_trade" : "worknic_trade";
  const getToken = (req) =>
    (req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith(cookieName + "="))
      ?.slice(cookieName.length + 1) || "";
  const cookie = (token, maxAge) =>
    `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? "; Secure" : ""}`;
  const json = (res, value, status = 200, headers = {}) => {
    res.writeHead(status, { "Content-Type": MIME[".json"], ...headers });
    res.end(JSON.stringify(value));
  };
  const body = async (req) => {
    if (!/^application\/json(?:;|$)/i.test(req.headers["content-type"] || ""))
      throw new TradeError("JSON ��û�� �ʿ��մϴ�.", 415);
    let size = 0,
      chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 128 * 1024)
        throw new TradeError("��û ũ�⸦ �ٿ� �ּ���.", 413);
      chunks.push(chunk);
    }
    try {
      const value = JSON.parse(Buffer.concat(chunks).toString());
      if (!value || Array.isArray(value) || typeof value !== "object")
        throw Error();
      return value;
    } catch {
      throw new TradeError("�Է� ������ Ȯ���� �ּ���.");
    }
  };
  const beta = createBetaRouter({
    store,
    os,
    origin,
    demo,
    trustProxy,
    backups,
    businessSms,
    businessSmsAllowedRequests,
    businessSmsMode,
  });
  return createServer(async (req, res) => {
    res.setHeader("Content-Security-Policy", CSP);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Cache-Control", "no-store");
    if (secure) res.setHeader("Strict-Transport-Security", "max-age=31536000");
    try {
      const url = new URL(req.url, origin),
        path = url.pathname;
      if (path === "/" && ["GET", "HEAD"].includes(req.method)) {
        res.writeHead(302, { Location: "/trade/" });
        res.end();
        return;
      }
      if (await beta(req, res, url, { json, cookie, getToken })) return;
      if (
        betaMode &&
        path.startsWith("/api/trade/") &&
        ![
          "/api/trade/health",
          "/api/trade/login",
          "/api/trade/logout",
          "/api/trade/me",
        ].includes(path)
      )
        throw new TradeError("��Ÿ �������ֹ� ȭ�鿡�� �̿��� �ּ���.", 404);
      if (path.startsWith("/api/trade/")) {
        if (!["GET", "POST"].includes(req.method))
          throw new TradeError("�������� �ʴ� ��û�Դϴ�.", 405);
        if (req.method === "POST" && req.headers.origin !== allowedOrigin)
          throw new TradeError("�� ����Ʈ���� �ٽ� ��û�� �ּ���.", 403);
        const remoteIp = trustProxy
          ? (req.headers["x-forwarded-for"] || req.socket.remoteAddress)
              .split(",")[0]
              .trim()
          : req.socket.remoteAddress;
        store.limit("api:" + remoteIp, 300, 60_000);
        const input = req.method === "POST" ? await body(req) : {};
        if (path === "/api/trade/health" && req.method === "GET")
          return json(res, { ok: true });
        if (path === "/api/trade/settings" && req.method === "GET") {
          const s = store.settings();
          return json(res, {
            seller: s.seller,
            shipping: s.shipping,
            paymentDays: s.paymentDays,
            ordersEnabled: s.ordersEnabled,
            consentVersion: s.consentVersion,
          });
        }
        if (path === "/api/trade/register" && req.method === "POST") {
          store.limit("register:" + remoteIp, 5, 3600_000);
          return json(res, store.register(input), 201);
        }
        if (path === "/api/trade/login" && req.method === "POST") {
          store.limit("login:" + remoteIp, 20);
          store.limit("login-user:" + String(input.username).toLowerCase(), 20);
          const member = store.login(input.username, input.password);
          if (
            member.role === "admin" &&
            adminTotpSecret &&
            !verifyTotp(adminTotpSecret, input.otp)
          )
            throw new TradeError("���� ���� 6�ڸ� �ڵ带 Ȯ���� �ּ���.", 401);
          const session = store.session(member);
          return json(res, { member }, 200, {
            "Set-Cookie": cookie(
              session.token,
              member.role === "admin" ? 3600 : 43200,
            ),
          });
        }
        if (path === "/api/trade/reset-password" && req.method === "POST") {
          store.limit("reset:" + remoteIp, 10);
          return json(res, store.resetPassword(input.token, input.password));
        }
        const actor = store.authenticate(getToken(req));
        if (!actor) throw new TradeError("�α����� �ʿ��մϴ�.", 401);
        if (path === "/api/trade/me" && req.method === "GET")
          return json(res, { member: actor });
        if (path === "/api/trade/logout" && req.method === "POST") {
          store.logout(getToken(req));
          return json(res, { ok: true }, 200, { "Set-Cookie": cookie("", 0) });
        }
        if (path === "/api/trade/catalog" && req.method === "GET")
          return json(res, { products: store.products(actor) });
        if (path === "/api/trade/orders" && req.method === "POST")
          return json(res, { order: store.createOrder(actor, input) }, 201);
        if (path === "/api/trade/orders" && req.method === "GET")
          return json(res, { orders: store.orders(actor) });
        const orderMatch = path.match(
          /^\/api\/trade\/orders\/([a-f0-9-]{36})(\/statement)?$/,
        );
        if (orderMatch) {
          if (req.method === "GET" && orderMatch[2]) {
            const html = statement(store.order(actor, orderMatch[1]));
            res.writeHead(200, { "Content-Type": MIME[".html"] });
            return res.end(html);
          }
          if (req.method === "GET")
            return json(res, { order: store.order(actor, orderMatch[1]) });
          if (req.method === "POST" && !orderMatch[2])
            return json(res, {
              order: store.updateOrder(actor, orderMatch[1], input),
            });
        }
        if (path.startsWith("/api/trade/admin/")) {
          if (actor.role !== "admin" || actor.status !== "approved")
            throw new TradeError("������ ������ �ʿ��մϴ�.", 403);
          if (path === "/api/trade/admin/members" && req.method === "GET")
            return json(res, { members: store.members(actor) });
          if (
            path === "/api/trade/admin/catalog-sync" &&
            req.method === "POST"
          ) {
            store.limit("catalog-sync:" + actor.id, 5, 60_000);
            return json(res, await syncCatalog(store, actor));
          }
          if (path === "/api/trade/admin/settings")
            return json(
              res,
              req.method === "GET"
                ? store.settings()
                : store.updateSettings(actor, input),
            );
          const memberMatch = path.match(
            /^\/api\/trade\/admin\/members\/([a-f0-9-]{36})(\/reset)?$/,
          );
          if (memberMatch && req.method === "POST")
            return json(
              res,
              memberMatch[2]
                ? store.resetToken(actor, memberMatch[1])
                : { member: store.updateMember(actor, memberMatch[1], input) },
            );
          const productMatch = path.match(
            /^\/api\/trade\/admin\/products\/([a-zA-Z0-9_-]{1,80})$/,
          );
          if (productMatch && req.method === "POST")
            return json(
              res,
              store.updateProduct(actor, productMatch[1], input),
            );
        }
        throw new TradeError("��û�� ����� ã�� �� �����ϴ�.", 404);
      }
      if (!["GET", "HEAD"].includes(req.method))
        throw new TradeError("�������� �ʴ� ��û�Դϴ�.", 405);
      // Never serve source, SQLite files, environment files, or repository metadata.
      const relative = decodeURIComponent(path);
      const allowed =
        /^\/(?:style\.css|media\.js|assets\/[a-zA-Z0-9_./-]+|trade\/(?:[a-z0-9-]+\.(?:html|css|js|webmanifest|svg|png)))$/.test(
          relative,
        );
      if (
        !allowed &&
        !["/trade", "/trade/", "/trade/admin", "/trade/admin/"].includes(
          relative,
        )
      )
        throw new TradeError("�������� ã�� �� �����ϴ�.", 404);
      const filePath =
        relative === "/trade" || relative === "/trade/"
          ? "/trade/index.html"
          : relative === "/trade/admin" || relative === "/trade/admin/"
            ? "/trade/admin.html"
            : relative;
      const file = await realpath(resolve(root, "." + filePath));
      if (!file.startsWith(resolve(root) + sep))
        throw new TradeError("�������� ã�� �� �����ϴ�.", 404);
      const content = await readFile(file);
      res.writeHead(200, {
        "Content-Type": MIME[extname(file)] || "application/octet-stream",
      });
      res.end(req.method === "HEAD" ? undefined : content);
    } catch (e) {
      const status =
        e instanceof TradeError ? e.status : e.code === "ENOENT" ? 404 : 500;
      if (status === 500)
        console.error("Trade request failed:", e.name, e.code || "internal");
      json(
        res,
        {
          error:
            status === 500
              ? "ó�� �� ������ �߻��߽��ϴ�. ��� �� �ٽ� �õ��� �ּ���."
              : e.message,
        },
        status,
      );
    }
  });
}
