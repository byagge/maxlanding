import type { User } from "@prisma/client";
import { db } from "./db.js";
import { AppError } from "./errors.js";
import { money } from "./format.js";
import { getSettings, type PlatformSettings } from "./settings.js";
import { findTonPayment, findTrc20Transfer, tonNano, trc20Expected } from "./chains.js";
import { recordEvent } from "./stats.js";

const providers = new Set(["cryptobot", "xrocket", "ton", "trc20"]);
const USDT_TRC20 = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";

type InvoiceResult = {
  externalId?: string;
  payUrl?: string;
  address?: string;
  memo?: string;
  asset: string;
  meta: Record<string, unknown>;
};

export async function expirePayments(): Promise<void> {
  await db().payment.updateMany({
    where: { status: "pending", expiresAt: { lt: new Date() } },
    data: { status: "expired" },
  });
}

export async function createInvoice(user: User, provider: string, amountInput: number) {
  if (!providers.has(provider)) throw new AppError(400, "bad_provider", "Неизвестный способ оплаты");
  const settings = await getSettings();
  const amount = money(amountInput);
  if (!Number.isFinite(amount) || amount < settings.minTopup) {
    throw new AppError(400, "bad_amount", `Минимальное пополнение — ${settings.minTopup} USDT`);
  }
  if (amount > 100000) throw new AppError(400, "bad_amount", "Слишком большая сумма");
  const payment = await db().payment.create({
    data: {
      userId: user.id,
      provider,
      amount,
      currency: "USDT",
      asset: provider === "ton" ? "TON" : "USDT",
      status: "pending",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  try {
    const prepared = await prepareProvider(user, provider, amount, settings, payment.id);
    const memo = provider === "ton" || provider === "trc20" ? `ml${payment.id.slice(-12)}` : prepared.memo;
    return await db().payment.update({
      where: { id: payment.id },
      data: {
        asset: prepared.asset,
        externalId: prepared.externalId,
        payUrl: prepared.payUrl,
        address: prepared.address,
        memo,
        meta: JSON.stringify({ ...prepared.meta, memo }),
      },
    });
  } catch (error) {
    await db().payment.update({ where: { id: payment.id }, data: { status: "failed" } });
    throw error;
  }
}

async function prepareProvider(user: User, provider: string, amount: number, settings: PlatformSettings, clientId: string): Promise<InvoiceResult> {
  if (provider === "cryptobot") return createCryptoBotInvoice(amount, settings, clientId);
  if (provider === "xrocket") return createXrocketInvoice(user, amount, settings, clientId);
  if (provider === "trc20") {
    if (!settings.tronWallet) throw new AppError(409, "provider_off", "USDT TRC20 ещё не подключён в панели управления");
    const nonce = Math.floor(Math.random() * 9000) + 1000;
    const expected = trc20Expected(amount, nonce);
    return { asset: "USDT", address: settings.tronWallet, meta: { raw: expected.raw, display: expected.display, nonce } };
  }
  if (!settings.tonWallet) throw new AppError(409, "provider_off", "TON ещё не подключён в панели управления");
  const rate = await tonUsdtRate();
  const tonAmount = Math.ceil((amount / rate) * 10000) / 10000;
  return { asset: "TON", address: settings.tonWallet, meta: { tonAmount, rate, nano: tonNano(tonAmount) } };
}

async function createCryptoBotInvoice(amount: number, settings: PlatformSettings, clientId: string): Promise<InvoiceResult> {
  if (!settings.cryptobotToken) throw new AppError(409, "provider_off", "CryptoBot ещё не подключён в панели управления");
  const host = settings.cryptobotTestnet ? "https://testnet-pay.crypt.bot" : "https://pay.crypt.bot";
  const response = await fetch(`${host}/api/createInvoice`, {
    method: "POST",
    headers: { "content-type": "application/json", "Crypto-Pay-API-Token": settings.cryptobotToken },
    body: JSON.stringify({
      asset: "USDT",
      amount: amount.toFixed(2),
      description: "Пополнение баланса MaxLanding",
      payload: clientId,
      expires_in: 3600,
    }),
    signal: AbortSignal.timeout(10000),
  });
  const body = (await response.json()) as { ok?: boolean; result?: { invoice_id?: number; pay_url?: string; bot_invoice_url?: string }; error?: { name?: string } };
  if (!response.ok || !body.ok || !body.result) {
    throw new AppError(502, "provider_error", body.error?.name || "CryptoBot не создал счёт");
  }
  return {
    asset: "USDT",
    externalId: String(body.result.invoice_id),
    payUrl: body.result.pay_url || body.result.bot_invoice_url,
    meta: {},
  };
}

async function createXrocketInvoice(user: User, amount: number, settings: PlatformSettings, clientId: string): Promise<InvoiceResult> {
  if (!settings.xrocketToken) throw new AppError(409, "provider_off", "xRocket ещё не подключён в панели управления");
  const response = await fetch("https://pay.api.xrocket.exchange/api/v1/invoices", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${settings.xrocketToken}` },
    body: JSON.stringify({
      priceAmount: amount.toFixed(2),
      priceCurrency: "USDT",
      clientInvoiceId: clientId,
      description: "Пополнение баланса MaxLanding",
      expiresIn: 60 * 60 * 1000,
      customer: { id: user.id, telegramId: user.telegramId, telegramUsername: user.username || undefined },
    }),
    signal: AbortSignal.timeout(10000),
  });
  const body = (await response.json()) as { id?: string; links?: { telegramBotLink?: string }; type?: string; title?: string };
  if (!response.ok || !body.id) throw new AppError(502, "provider_error", body.title || "xRocket не создал счёт");
  return { asset: "USDT", externalId: body.id, payUrl: body.links?.telegramBotLink, meta: {} };
}

export async function markPaid(paymentId: string, extra?: { externalId?: string; txHash?: string }) {
  return db().$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new AppError(404, "not_found", "Счёт не найден");
    if (payment.status === "paid") return payment;
    if (payment.status !== "pending") throw new AppError(409, "not_pending", "Счёт уже закрыт");
    const updated = await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: "paid",
        paidAt: new Date(),
        externalId: extra?.externalId || payment.externalId,
        txHash: extra?.txHash || payment.txHash,
      },
    });
    await tx.user.update({ where: { id: payment.userId }, data: { balance: { increment: payment.amount } } });
    await tx.ledgerEntry.create({ data: { userId: payment.userId, amount: payment.amount, reason: `topup:${payment.provider}`, ref: payment.id } });
    return updated;
  });
}

export async function checkPayment(userId: string, paymentId: string) {
  await expirePayments();
  const payment = await db().payment.findFirst({ where: { id: paymentId, userId } });
  if (!payment) throw new AppError(404, "not_found", "Счёт не найден");
  if (payment.status !== "pending") return { payment, detail: payment.status === "paid" ? "Оплата уже зачислена" : "Счёт закрыт" };
  const settings = await getSettings();
  try {
    if (payment.provider === "cryptobot") return { payment: await checkCryptoBot(payment.id, payment.externalId, settings), detail: "Проверили CryptoBot" };
    if (payment.provider === "xrocket") return { payment: await checkXrocket(payment.id, payment.externalId, settings), detail: "Проверили xRocket" };
    if (payment.provider === "trc20") return checkTron(payment.id, payment.address || "", payment.meta, settings);
    return checkTon(payment.id, payment.address || "", payment.memo || "", payment.meta, settings);
  } catch (error) {
    if (error instanceof AppError) throw error;
    return { payment, detail: "Сеть провайдера сейчас недоступна. Попробуйте ещё раз." };
  }
}

async function checkCryptoBot(paymentId: string, externalId: string | null, settings: PlatformSettings) {
  if (!externalId || !settings.cryptobotToken) throw new AppError(409, "provider_off", "CryptoBot не настроен");
  const host = settings.cryptobotTestnet ? "https://testnet-pay.crypt.bot" : "https://pay.crypt.bot";
  const response = await fetch(`${host}/api/getInvoices?invoice_ids=${externalId}`, {
    headers: { "Crypto-Pay-API-Token": settings.cryptobotToken },
    signal: AbortSignal.timeout(10000),
  });
  const body = (await response.json()) as { ok?: boolean; result?: { items?: Array<{ status?: string; invoice_id?: number }> } | Array<{ status?: string }> };
  const items = Array.isArray(body.result) ? body.result : body.result?.items || [];
  const status = items[0]?.status;
  if (status === "paid") return markPaid(paymentId, { externalId });
  return db().payment.findUniqueOrThrow({ where: { id: paymentId } });
}

async function checkXrocket(paymentId: string, externalId: string | null, settings: PlatformSettings) {
  if (!settings.xrocketToken) throw new AppError(409, "provider_off", "xRocket не настроен");
  const query = externalId ? `invoiceId=${encodeURIComponent(externalId)}` : `clientInvoiceId=${encodeURIComponent(paymentId)}`;
  const response = await fetch(`https://pay.api.xrocket.exchange/api/v1/invoice?${query}`, {
    headers: { authorization: `Bearer ${settings.xrocketToken}` },
    signal: AbortSignal.timeout(10000),
  });
  const body = (await response.json()) as { status?: string; id?: string };
  if (body.status === "paid") return markPaid(paymentId, { externalId: body.id || externalId || undefined });
  return db().payment.findUniqueOrThrow({ where: { id: paymentId } });
}

async function checkTron(paymentId: string, address: string, metaRaw: string, settings: PlatformSettings) {
  const meta = JSON.parse(metaRaw) as { raw?: string };
  const headers: Record<string, string> = {};
  if (settings.tronApiKey) headers["TRON-PRO-API-KEY"] = settings.tronApiKey;
  const url = `https://api.trongrid.io/v1/accounts/${address}/transactions/trc20?limit=40&only_to=true&contract_address=${USDT_TRC20}`;
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
  const body = (await response.json()) as { data?: Array<{ transaction_id?: string; value?: string; to?: string }> };
  const tx = findTrc20Transfer(body.data || [], address, String(meta.raw || ""));
  if (!tx) return { payment: await db().payment.findUniqueOrThrow({ where: { id: paymentId } }), detail: "Платёж в сети TRON пока не найден" };
  return { payment: await markPaid(paymentId, { txHash: tx }), detail: "USDT TRC20 зачислен" };
}

async function checkTon(paymentId: string, address: string, memo: string, metaRaw: string, settings: PlatformSettings) {
  const meta = JSON.parse(metaRaw) as { nano?: string };
  const headers: Record<string, string> = {};
  if (settings.tonApiKey) headers["X-API-Key"] = settings.tonApiKey;
  const response = await fetch(`https://toncenter.com/api/v2/getTransactions?address=${encodeURIComponent(address)}&limit=30`, {
    headers,
    signal: AbortSignal.timeout(10000),
  });
  const body = (await response.json()) as { result?: Parameters<typeof findTonPayment>[0] };
  const tx = findTonPayment(body.result || [], memo, BigInt(meta.nano || "0"));
  if (!tx) return { payment: await db().payment.findUniqueOrThrow({ where: { id: paymentId } }), detail: "Платёж в TON пока не найден" };
  return { payment: await markPaid(paymentId, { txHash: tx }), detail: "TON зачислен" };
}

export async function creditFromCryptoBot(rawBody: string, payloadId: string | undefined, invoiceId: string | undefined) {
  const payment = payloadId
    ? await db().payment.findUnique({ where: { id: payloadId } })
    : invoiceId
      ? await db().payment.findFirst({ where: { externalId: invoiceId, provider: "cryptobot" } })
      : null;
  if (!payment) return null;
  await recordEvent({ userId: payment.userId, type: "payment_webhook", meta: { provider: "cryptobot", bytes: rawBody.length } });
  return markPaid(payment.id, { externalId: invoiceId });
}

export async function creditFromXrocket(clientInvoiceId: string | undefined, invoiceId: string | undefined) {
  const payment = clientInvoiceId
    ? await db().payment.findUnique({ where: { id: clientInvoiceId } })
    : invoiceId
      ? await db().payment.findFirst({ where: { externalId: invoiceId, provider: "xrocket" } })
      : null;
  if (!payment) return null;
  return markPaid(payment.id, { externalId: invoiceId });
}

async function tonUsdtRate(): Promise<number> {
  try {
    const response = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=the-open-network&vs_currencies=usd", {
      signal: AbortSignal.timeout(8000),
    });
    const body = (await response.json()) as { "the-open-network"?: { usd?: number } };
    const rate = body["the-open-network"]?.usd;
    if (rate && rate > 0) return rate;
  } catch {
    // The invoice can still be quoted with the last conservative fallback.
  }
  return 3;
}
