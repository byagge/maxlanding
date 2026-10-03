import assert from "node:assert/strict";
import { test } from "node:test";

process.env.NODE_ENV = "test";
process.env.APP_SECRET = "test-secret-test-secret-test-secret";
process.env.ADMIN_TELEGRAM_IDS = "10000";

const { decideDomain, normalizeHostname, nsMatches } = await import("../src/dns.js");
const { cryptoBotSignature, decryptSecret, encryptSecret, safeEqualHex, xrocketSignature } = await import("../src/crypto.js");
const { decodeTonComment, findTonPayment, findTrc20Transfer, trc20Expected } = await import("../src/chains.js");
const { renderLanding } = await import("../src/render.js");
const { hostDecision } = await import("../src/landings.js");

test("domain names and NS decisions", () => {
  assert.equal(normalizeHostname("HTTPS://Promo.Example.com/landing"), "promo.example.com");
  assert.throws(() => normalizeHostname("localhost"));
  assert.equal(nsMatches(["NS1.MaxLanding.app.", "ns2.maxlanding.app"], ["ns1.maxlanding.app", "ns2.maxlanding.app"]), true);
  assert.equal(decideDomain({ actualNs: ["ns1.maxlanding.app", "ns2.maxlanding.app"], actualA: [], expectedNs: ["ns1.maxlanding.app", "ns2.maxlanding.app"], platformIp: "" }).ok, true);
  assert.equal(decideDomain({ actualNs: ["other.ns"], actualA: ["203.0.113.10"], expectedNs: ["ns1.maxlanding.app", "ns2.maxlanding.app"], platformIp: "203.0.113.10" }).status, "active");
  assert.equal(decideDomain({ actualNs: [], actualA: [], expectedNs: ["ns1.maxlanding.app", "ns2.maxlanding.app"], platformIp: "" }).status, "pending_ns");
  assert.equal(hostDecision(["203.0.113.10"], "203.0.113.10", "promo.example.com").status, "active");
  assert.equal(hostDecision([], "203.0.113.10", "promo.example.com").status, "pending");
  assert.equal(hostDecision(["1.1.1.1"], "", "promo.example.com").status, "pending");
});

test("payment signatures, secrets and chain matching", () => {
  const body = "{\"ok\":true}";
  const signature = cryptoBotSignature("token", body);
  assert.equal(safeEqualHex(signature, cryptoBotSignature("token", body)), true);
  assert.equal(safeEqualHex(signature, cryptoBotSignature("other", body)), false);
  const rocket = xrocketSignature("whsec", "1760000000000", body);
  assert.equal(rocket, xrocketSignature("whsec", "1760000000000", body));
  const hidden = encryptSecret("super-secret-token");
  assert.equal(hidden.includes("super-secret-token"), false);
  assert.equal(decryptSecret(hidden), "super-secret-token");
  const expected = trc20Expected(10, 1234);
  assert.equal(findTrc20Transfer([{ to: "TADDR", value: expected.raw, transaction_id: "tx1" }], "TADDR", expected.raw), "tx1");
  assert.equal(findTrc20Transfer([{ to: "TADDR", value: "1", transaction_id: "tx1" }], "TADDR", expected.raw), null);
  const comment = Buffer.from("mlpayment1").toString("base64");
  assert.equal(decodeTonComment(comment), "mlpayment1");
  assert.equal(findTonPayment([{ in_msg: { value: "2000000000", message: comment }, transaction_id: { hash: "tonhash" } }], "mlpayment1", 1500000000n), "tonhash");
});

test("public landing escapes content", () => {
  const html = renderLanding({
    slug: "safe",
    name: "Имя",
    title: "<script>alert(1)</script>",
    subtitle: "ok",
    buttonText: "Скачать",
    downloadUrl: "https://example.com/app.apk",
    features: ["<b>нет</b>"],
    theme: "aurora",
    layout: "app",
  }, false);
  assert.equal(html.includes("<script>alert"), false);
  assert.equal(html.includes("&lt;script&gt;"), true);
  assert.equal(html.includes("data-download"), true);
});
