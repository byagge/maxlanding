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
test("launch assigns a platform subdomain and serves it by host", async () => {
  const token = await login("admin");
  const headers = { authorization: `Bearer ${token}` };
  const settings = await app.inject({
    method: "PUT",
    url: "/api/admin/settings",
    headers,
    payload: { platformDomain: "max.com", platformIp: "203.0.113.10" },
  });
  assert.equal(settings.statusCode, 200);
  assert.equal(settings.json().platformDomain, "max.com");
  assert.equal(settings.json().platformIp, "203.0.113.10");

  const landing = await app.inject({
    method: "POST",
    url: "/api/landings",
    headers,
    payload: {
      name: "Кампания",
      templateId: await templateId(token, "aurora-app"),
      title: `<img src=x onerror=alert(1)>`,
      subtitle: "Текст",
      buttonText: "Скачать",
      downloadUrl: "https://example.com/app.apk",
      features: ["Один", "Два"],
      launch: true,
    },
  });
  assert.equal(landing.statusCode, 200);
  const created = landing.json().landing;
  assert.match(created.subdomain, /^ldng\d+$/);
  assert.equal(created.publicUrl, `https://${created.subdomain}.max.com`);
  assert.equal(created.status, "preparing");

  let ready = created;
  for (let attempt = 0; attempt < 40 && ready.status !== "active"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    ready = (await app.inject({ method: "GET", url: `/api/landings/${created.id}`, headers })).json().landing;
  }
  assert.equal(ready.status, "active");

  const page = await app.inject({ method: "GET", url: `/l/${created.slug}` });
  assert.equal(page.statusCode, 200);
  assert.equal(page.body.includes("<img"), false);
  assert.equal(page.body.includes("&lt;img"), true);

  const byHost = await app.inject({ method: "GET", url: "/", headers: { host: `${created.subdomain}.max.com` } });
  assert.equal(byHost.statusCode, 200);
  assert.equal(byHost.body.includes("&lt;img"), true);

  const custom = await app.inject({
    method: "POST",
    url: `/api/landings/${created.id}/domain`,
    headers,
    payload: { hostname: "https://promo.example.com/path" },
  });
  assert.equal(custom.statusCode, 200);
  assert.equal(custom.json().landing.customHost, "promo.example.com");
  assert.equal(custom.json().landing.customStatus, "pending");
  assert.match(custom.json().message, /203\.0\.113\.10/);

  assert.equal((await app.inject({ method: "POST", url: "/api/public/hit", payload: { slug: created.slug, type: "visit" } })).statusCode, 200);
  assert.equal((await app.inject({ method: "POST", url: "/api/public/hit", payload: { slug: created.slug, type: "download" } })).statusCode, 200);
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
  await db().template.update({ where: { slug: "noir-product" }, data: { price: 19, inShop: true } });
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

test("analytics, referrals and template guard ignore form contents", async () => {
  const admin = await login("admin");
  const headers = { authorization: `Bearer ${admin}` };
  const landing = await app.inject({
    method: "POST",
    url: "/api/landings",
    headers,
    payload: { name: "Поток", templateId: await templateId(admin, "pulse-saas"), launch: true },
  });
  assert.equal(landing.statusCode, 200);
  const created = landing.json().landing;
  const slug = created.slug as string;
  const dns = await app.inject({ method: "POST", url: `/api/landings/${created.id}/dns`, headers, payload: {} });
  assert.equal(dns.statusCode, 200);
  assert.equal(dns.json().landing.dnsStatus, "manual");
  assert.match(dns.json().landing.dnsDetail, /Cloudflare/);

  let ready = created;
  for (let attempt = 0; attempt < 40 && ready.status !== "active"; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 50));
    ready = (await app.inject({ method: "GET", url: `/api/landings/${created.id}`, headers })).json().landing;
  }
  assert.equal(ready.status, "active");

  assert.equal((await app.inject({ method: "POST", url: "/api/public/hit", payload: { slug, type: "visit", source: "direct", session: "s1" } })).statusCode, 200);
  assert.equal((await app.inject({ method: "POST", url: "/api/public/hit", payload: { slug, type: "click", element: "cta", source: "direct", session: "s1" } })).statusCode, 200);
  assert.equal((await app.inject({ method: "POST", url: "/api/public/hit", payload: { slug, type: "heartbeat", duration: 15, session: "s1", source: "direct" } })).statusCode, 200);
  const leaked = await app.inject({ method: "POST", url: "/api/public/hit", payload: { slug, type: "visit", value: "79990001122" } });
  assert.equal(leaked.statusCode, 400);

  const dashboard = await app.inject({ method: "GET", url: "/api/dashboard", headers });
  assert.equal(dashboard.json().stats.clicks >= 1, true);
  assert.equal(dashboard.json().stats.direct >= 1, true);
  assert.equal(dashboard.json().stats.avgSeconds >= 15, true);

  const rejected = await app.inject({
    method: "POST",
    url: "/api/admin/templates",
    headers,
    payload: {
      slug: "blocked-login",
      name: "Блок",
      description: "Нельзя",
      category: "Тест",
      price: 0,
      theme: "aurora",
      layout: "app",
      previewHue: "#ccc",
      defaults: { title: "Нет", subtitle: "Нет", button: "Нет", features: ["Нет"] },
      html: "<form><input type=\"password\"></form>",
      published: true,
      inShop: false,
    },
  });
  assert.equal(rejected.statusCode, 400);

  const invite = await app.inject({ method: "GET", url: "/api/referrals", headers });
  assert.equal(invite.statusCode, 200);
  const userToken = await login("user");
  const joined = await app.inject({
    method: "POST",
    url: "/api/referrals/apply",
    headers: { authorization: `Bearer ${userToken}` },
    payload: { code: invite.json().code },
  });
  assert.equal(joined.statusCode, 200);
  const again = await app.inject({ method: "GET", url: "/api/referrals", headers });
  assert.equal(again.json().items.some((item: { telegramId: string }) => item.telegramId === "20000"), true);
});
});

async function templateId(token: string, slug: string) {
  const response = await app.inject({ method: "GET", url: "/api/templates?scope=usable&pageSize=20", headers: { authorization: `Bearer ${token}` } });
  return response.json().items.find((item: { slug: string; id: string }) => item.slug === slug).id as string;
}
