// Isolated local fixture. Never uses OS production membership, prices or orders.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { openStore } from "../server/store.mjs";
import { createTradeServer } from "../server/http.mjs";
const dir = mkdtempSync(join(tmpdir(), "worknic-beta-ui-"));
const data = {
  brands: [{ id: "qa", name: "검증용 브랜드" }],
  products: [
    {
      id: "qa-tool",
      name: "검증용 상품 · 실제 판매 상품 아님",
      brand: "qa",
      model: "QA-001",
      published: true,
      images: ["/assets/logo.png"],
      summary: "로컬 개발 검증 전용 상품입니다.",
    },
  ],
};
const store = openStore(join(dir, "trade.sqlite"), {
  betaOptions: { pickupKey: "22".repeat(32) },
});
store.createAdmin("qa_staff", "local test passphrase");
const admin = store.login("qa_staff", "local test passphrase");
store.seedCatalog(data);
const product = store.products(admin)[0];
store.updateStock(admin, product.id, {
  revision: product.revision,
  stock: 30,
  enabled: true,
});
store.register({
  username: "qa_buyer",
  password: "local test passphrase",
  companyName: "검증용 거래처 · 실제 거래 아님",
  businessNumber: "1234567891",
  contactName: "검증 담당자",
  phone: "010-0000-0000",
  email: "qa@example.invalid",
  postalCode: "11111",
  address: "검증용 주소",
  consent: true,
});
const member = store.members(admin)[0],
  activation = store.beta.bindMember(admin, member.id, {
    id: "qa-request",
    email: member.profile.email,
    businessNumber: member.profile.businessNumber,
    status: "approved",
    contactVerified: true,
  });
store.beta.activate(activation.token, "local test passphrase");
store.beta.updateConfig(admin, {
  ...store.beta.config(),
  documentsConfirmed: true,
  registrationEnabled: true,
  betaEnabled: true,
});
const l = store.beta.locations().find((l) => l.id === "jinjeop");
store.beta.updateLocation(admin, l.id, {
  ...l,
  address: "진접중학교 앞 · 로컬 검증용",
  hours: "오후 7시~11시 · 로컬 검증용",
  noticeUrl: "https://example.invalid/test",
  enabled: true,
  sourceVerified: true,
  fee: 0,
});
store.beta.saveSlot(admin, {
  id: "qa_box_1",
  locationId: l.id,
  label: "검증용 보관함 1",
  enabled: true,
});
const price = {
  상품번호: "qa-tool",
  옵션번호: "default",
  판매단위: "개",
  판매가: 11000,
  부가세기준: "포함",
  가격상태: "확정",
  적용일: new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10),
  수정번호: 0,
};
store.beta.applyPrices(admin, store.beta.previewPrices(admin, [price]).id);
const os = {
  configured: () => false,
  publicCatalog: async () => data,
  authorize: async () => ({ actor: "검증 담당자", role: "admin" }),
  apply: async () => ({ status: "received" }),
};
const server = createTradeServer({
  store,
  root: fileURLToPath(new URL("../../", import.meta.url)),
  origin: "http://localhost:8086",
  secure: false,
  betaMode: true,
  demo: true,
  os,
});
server.listen(8086, "127.0.0.1", () =>
  console.log(
    "Local-only beta fixture: http://localhost:8086/trade/ · all data disposable",
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      store.close();
      rmSync(dir, { recursive: true, force: true });
      process.exit(0);
    }),
  );
