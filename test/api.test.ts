import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { after, describe, test } from "node:test";
import type { FastifyInstance } from "fastify";

process.env.NODE_ENV = "test";
process.env.APP_SECRET = "test-secret-test-secret-test-secret";
process.env.DATABASE_URL = `file:${join(mkdtempSync(join(tmpdir(), "maxlanding-")), "test.db")}`;
process.env.DEV_AUTH = "1";
process.env.ADMIN_TELEGRAM_IDS = "10000";
process.env.BOT_TOKEN = "";
process.env.PORT = "8799";

execSync("npx prisma db push --skip-generate --accept-data-loss", { stdio: "inherit", env: process.env });

const { buildApp } = await import("../src/app.js");
const { seed } = await import("../prisma/seed.js");
const { db, disconnectDb } = await import("../src/db.js");
const { cryptoBotSignature } = await import("../src/crypto.js");

await seed();
const app: FastifyInstance = await buildApp();

after(async () => {
  await app.close();
  await disconnectDb();
});

async function login(role: "admin" | "user") {
  const response = await app.inject({ method: "POST", url: "/api/auth/dev", payload: { role } });
  assert.equal(response.statusCode, 200);
  return response.json().token as string;
}

describe("api", { concurrency: 1 }, () => {
test("dev session, landing launch, visit and download stats", async () => {
  const token = await login("admin");
  const headers = { authorization: `Bearer ${token}` };
  const created = await app.inject({ method: "POST", url: "/api/domains", headers, payload: { hostname: "https://promo.example.com/path" } });
  assert.equal(created.statusCode, 200);
  const domain = created.json().domain;
  assert.equal(domain.hostname, "promo.example.com");
  assert.equal(domain.status, "pending_ns");

  const blocked = await app.inject({
    method: "POST",
    url: "/api/landings",
    headers,
    payload: { name: "Кампания", templateId: (await templateId(token, "aurora-app")), domainId: domain.id, launch: true },
  });
  assert.equal(blocked.statusCode, 409);

  const activated = await app.inject({ method: "POST", url: `/api/admin/domains/${domain.id}/activate`, headers, payload: {} });
  assert.equal(activated.statusCode, 200);

  const landing = await app.inject({
    method: "POST",
    url: "/api/landings",
    headers,
    payload: {
      name: "Кампания",
      templateId: await templateId(token, "aurora-app"),
      domainId: domain.id,
      title: `<img src=x onerror=alert(1)>`,
      subtitle: "Текст",
      buttonText: "Скачать",
      downloadUrl: "https://example.com/app.apk",
      features: ["Один", "Два"],
      launch: true,
    },
  });
  assert.equal(landing.statusCode, 200);
  const slug = landing.json().landing.slug as string;
  const page = await app.inject({ method: "GET", url: `/l/${slug}` });
  assert.equal(page.statusCode, 200);
  assert.equal(page.body.includes("<img"), false);
  assert.equal(page.body.includes("&lt;img"), true);

  assert.equal((await app.inject({ method: "POST", url: "/api/public/hit", payload: { slug, type: "visit" } })).statusCode, 200);
  assert.equal((await app.inject({ method: "POST", url: "/api/public/hit", payload: { slug, type: "download" } })).statusCode, 200);
  const dashboard = await app.inject({ method: "GET", url: "/api/dashboard", headers });
  const stats = dashboard.json().stats;
  assert.equal(stats.downloads >= 1, true);
  assert.equal(stats.visits >= 1, true);
  assert.notEqual(stats.conversion, "0%");
});

test("shop purchase needs balance, on-chain invoice and admin confirm", async () => {
  const admin = await login("admin");
  const userToken = await login("user");
  const userHeaders = { authorization: `Bearer ${userToken}` };
  const shop = await app.inject({ method: "GET", url: "/api/templates?scope=shop&pageSize=20", headers: userHeaders });
  const paid = shop.json().items.find((item: { slug: string }) => item.slug === "noir-product");
  const denied = await app.inject({ method: "POST", url: `/api/templates/${paid.id}/buy`, headers: userHeaders });
  assert.equal(denied.statusCode, 402);

  const user = await db().user.findUniqueOrThrow({ where: { telegramId: "20000" } });
  const credit = await app.inject({
    method: "POST",
    url: `/api/admin/users/${user.id}/balance`,
    headers: { authorization: `Bearer ${admin}` },
    payload: { amount: 30, reason: "тест" },
  });
  assert.equal(credit.statusCode, 200);
  const bought = await app.inject({ method: "POST", url: `/api/templates/${paid.id}/buy`, headers: userHeaders });
  assert.equal(bought.statusCode, 200);
  assert.equal(bought.json().balance, 11);

  const settings = await app.inject({
    method: "PUT",
    url: "/api/admin/settings",
    headers: { authorization: `Bearer ${admin}` },
    payload: { tronWallet: "TXYZWalletForTests", cryptobotToken: "cryptobot-test-token", minTopup: 5 },
  });
  assert.equal(settings.statusCode, 200);
  assert.equal(settings.json().secrets.cryptobotToken.endsWith("oken"), true);
  assert.equal(JSON.stringify(settings.json()).includes("cryptobot-test-token"), false);

  const invoice = await app.inject({ method: "POST", url: "/api/payments", headers: userHeaders, payload: { provider: "trc20", amount: 10 } });
  assert.equal(invoice.statusCode, 200);
  const payment = invoice.json().payment;
  assert.equal(payment.address, "TXYZWalletForTests");
  assert.equal(payment.memo.startsWith("ml"), true);
  const meta = JSON.parse(payment.meta);
  assert.notEqual(meta.display, "10.000000");

  const confirmed = await app.inject({
    method: "POST",
    url: `/api/admin/payments/${payment.id}/confirm`,
    headers: { authorization: `Bearer ${admin}` },
    payload: { txHash: "abc" },
  });
  assert.equal(confirmed.statusCode, 200);
  const again = await app.inject({
    method: "POST",
    url: `/api/admin/payments/${payment.id}/confirm`,
    headers: { authorization: `Bearer ${admin}` },
    payload: {},
  });
  assert.equal(again.statusCode, 200);
  const once = await db().user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(once.balance, 21);

  const manual = await db().payment.create({
    data: { userId: user.id, provider: "cryptobot", amount: 7, asset: "USDT", currency: "USDT", status: "pending" },
  });
  const raw = JSON.stringify({ update_type: "invoice_paid", payload: { invoice_id: 77, status: "paid", payload: manual.id } });
  const bad = await app.inject({
    method: "POST",
    url: "/api/webhooks/cryptobot",
    headers: { "content-type": "application/json", "crypto-pay-api-signature": "aa" },
    payload: raw,
  });
  assert.equal(bad.statusCode, 401);
  const good = await app.inject({
    method: "POST",
    url: "/api/webhooks/cryptobot",
    headers: { "content-type": "application/json", "crypto-pay-api-signature": cryptoBotSignature("cryptobot-test-token", raw) },
    payload: raw,
  });
  assert.equal(good.statusCode, 200);
  const refreshed = await db().user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(refreshed.balance, 28);
});
});

async function templateId(token: string, slug: string) {
  const response = await app.inject({ method: "GET", url: "/api/templates?scope=usable&pageSize=20", headers: { authorization: `Bearer ${token}` } });
  return response.json().items.find((item: { slug: string; id: string }) => item.slug === slug).id as string;
}
