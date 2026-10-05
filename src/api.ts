import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { publicUser, requireAdmin, requireUser, setSessionCookie, signSession } from "./auth.js";
import { buyTemplate, listTemplates, saveTemplate } from "./catalog.js";
import { config } from "./config.js";
import { cryptoBotSignature, safeEqualHex, xrocketSignature } from "./crypto.js";
import { db } from "./db.js";
import { activateDomain, addDomain, deleteDomain, listDomains, verifyDomain } from "./domains.js";
import { AppError } from "./errors.js";
import { pageQuery } from "./format.js";
import { assertTheme, attachPlatformDns, connectCustomHost, createLanding, decorateMany, deleteLanding, getLanding, launchLanding, pauseLanding, trackPublicHit, updateLanding } from "./landings.js";
import { applyReferral, listReferrals } from "./referrals.js";
import { checkPayment, createInvoice, creditFromCryptoBot, creditFromXrocket, expirePayments, markPaid } from "./payments.js";
import { adminSettings, getSettings, publicSettings, updateSettings } from "./settings.js";
import { adjustBalance, recordEvent, userStats } from "./stats.js";
import { upsertTelegramUser, userFromInitData } from "./telegram.js";

const hits = new Map<string, { count: number; at: number }>();

const landingSchema = z.object({
  name: z.string().min(2, "Название слишком короткое").max(60),
  templateId: z.string().min(1),
  domainId: z.string().nullable().optional(),
  title: z.string().max(80).optional(),
  subtitle: z.string().max(180).optional(),
  buttonText: z.string().max(32).optional(),
  downloadUrl: z.string().max(500).nullable().optional(),
  features: z.array(z.string().max(80)).max(6).optional(),
  pixelUrl: z.string().max(500).nullable().optional(),
  launch: z.boolean().optional(),
});

const templateSchema = z.object({
  slug: z.string().min(2).max(40),
  name: z.string().min(2).max(60),
  description: z.string().min(2).max(240),
  category: z.string().min(2).max(40),
  price: z.number().min(0).max(100000),
  theme: z.string(),
  layout: z.string(),
  previewHue: z.string().max(20).default("#8b7cff"),
  defaults: z.object({
    title: z.string().max(80),
    subtitle: z.string().max(180),
    button: z.string().max(32),
    features: z.array(z.string().max(80)).max(6),
  }),
  html: z.string().max(200000).optional(),
  published: z.boolean(),
  inShop: z.boolean(),
});

export async function registerApi(app: FastifyInstance): Promise<void> {
  app.get("/api/health", async () => ({ ok: true, devAuth: config.devAuth }));

  app.post("/api/auth/telegram", async (request, reply) => {
    const { initData } = z.object({ initData: z.string().min(1) }).parse(request.body);
    const user = await userFromInitData(initData);
    const token = signSession(user.id);
    setSessionCookie(reply, token);
    return { token, user: publicUser(user) };
  });

  app.post("/api/auth/dev", async (request, reply) => {
    if (!config.devAuth) throw new AppError(404, "not_found", "Не найдено");
    const { role } = z.object({ role: z.enum(["admin", "user"]) }).parse(request.body);
    const telegramId = role === "admin" ? config.adminIds[0] || "10000" : "20000";
    const user = await upsertTelegramUser({
      telegramId,
      username: role === "admin" ? "maxadmin" : "demo_user",
      firstName: role === "admin" ? "Админ" : "Демо",
    });
    const token = signSession(user.id);
    setSessionCookie(reply, token);
    return { token, user: publicUser(user) };
  });

  app.post("/api/auth/logout", async (_request, reply) => {
    reply.clearCookie("ml_session", { path: "/" });
    return { ok: true };
  });

  app.get("/api/me", async (request) => ({ user: publicUser(await requireUser(request)) }));

  app.get("/api/dashboard", async (request) => {
    const user = await requireUser(request);
    const [stats, domains, landings, recent] = await Promise.all([
      userStats(user.id),
      db().domain.count({ where: { userId: user.id } }),
      db().landing.count({ where: { userId: user.id, status: "active" } }),
      db().event.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 6 }),
    ]);
    return { stats, domains, activeLandings: landings, balance: publicUser(user).balance, recent };
  });

  app.get("/api/settings/public", async () => publicSettings(await getSettings()));

  app.get("/api/referrals", async (request) => listReferrals((await requireUser(request)).id));
  app.post("/api/referrals/apply", async (request) => {
    const user = await requireUser(request);
    const { code } = z.object({ code: z.string().min(2).max(40) }).parse(request.body);
    return applyReferral(user.id, code.replace(/^ref_/, ""));
  });

  app.patch("/api/me/logs", async (request) => {
    const user = await requireUser(request);
    const body = z.object({ logIp: z.boolean(), logUa: z.boolean(), logReferrer: z.boolean() }).parse(request.body);
    return { user: publicUser(await db().user.update({ where: { id: user.id }, data: body })) };
  });

  app.get("/api/domains", async (request) => ({ items: await listDomains((await requireUser(request)).id) }));
  app.post("/api/domains", async (request) => {
    const user = await requireUser(request);
    const { hostname } = z.object({ hostname: z.string().min(3) }).parse(request.body);
    return { domain: await addDomain(user, hostname) };
  });
  app.post("/api/domains/:id/verify", async (request) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    return { domain: await verifyDomain(user.id, id) };
  });
  app.delete("/api/domains/:id", async (request) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    await deleteDomain(user.id, id);
    return { ok: true };
  });

  app.get("/api/templates", async (request) => {
    const user = await requireUser(request);
    const query = request.query as { scope?: string; page?: string; pageSize?: string };
    return listTemplates(user.id, query.scope || "examples", query);
  });
  app.post("/api/templates/:id/buy", async (request) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    return buyTemplate(user, id);
  });

  app.get("/api/landings", async (request) => {
    const user = await requireUser(request);
    const items = await db().landing.findMany({
      where: { userId: user.id },
      include: { template: true, domain: true },
      orderBy: { updatedAt: "desc" },
    });
    const grouped = items.length
      ? await db().event.groupBy({
          by: ["landingId", "type"],
          where: { landingId: { in: items.map((item) => item.id) }, type: { in: ["visit", "download"] } },
          _count: { _all: true },
        })
      : [];
    const withCounts = items.map((item) => {
      const visits = grouped.find((row) => row.landingId === item.id && row.type === "visit")?._count._all ?? 0;
      const downloads = grouped.find((row) => row.landingId === item.id && row.type === "download")?._count._all ?? 0;
      return { ...item, visits, downloads };
    });
    return { items: await decorateMany(withCounts) };
  });

  app.post("/api/landings", async (request) => {
    const user = await requireUser(request);
    return { landing: await createLanding(user, landingSchema.parse(request.body)) };
  });
  app.get("/api/landings/:id", async (request) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    const landing = await getLanding(user.id, id);
    return { landing };
  });
  app.patch("/api/landings/:id", async (request) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    return { landing: await updateLanding(user.id, id, landingSchema.partial().parse(request.body)) };
  });
  app.post("/api/landings/:id/launch", async (request) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    return { landing: await launchLanding(user.id, id) };
  });
  app.post("/api/landings/:id/dns", async (request) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    await getLanding(user.id, id);
    await attachPlatformDns(id);
    return { landing: await getLanding(user.id, id) };
  });
  app.post("/api/landings/:id/domain", async (request) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    const body = z.object({ hostname: z.string().min(3).max(253) }).parse(request.body);
    return connectCustomHost(user.id, id, body.hostname);
  });
  app.post("/api/landings/:id/pause", async (request) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    return { landing: await pauseLanding(user.id, id) };
  });
  app.delete("/api/landings/:id", async (request) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    await deleteLanding(user.id, id);
    return { ok: true };
  });

  app.get("/api/logs", async (request) => {
    const user = await requireUser(request);
    const query = request.query as { page?: string; type?: string };
    const paging = pageQuery(query, 12);
    const where = { userId: user.id, ...(query.type ? { type: query.type } : {}) };
    const [total, items] = await Promise.all([
      db().event.count({ where }),
      db().event.findMany({ where, orderBy: { createdAt: "desc" }, skip: paging.skip, take: paging.pageSize, include: { landing: { select: { name: true, slug: true } } } }),
    ]);
    return { items, page: paging.page, pages: Math.max(1, Math.ceil(total / paging.pageSize)), total, settings: { logIp: user.logIp, logUa: user.logUa, logReferrer: user.logReferrer } };
  });

  app.get("/api/payments", async (request) => {
    const user = await requireUser(request);
    await expirePayments();
    return { items: await db().payment.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 }) };
  });
  app.post("/api/payments", async (request) => {
    const user = await requireUser(request);
    const body = z.object({ provider: z.enum(["cryptobot", "xrocket", "ton", "trc20"]), amount: z.number().positive() }).parse(request.body);
    return { payment: await createInvoice(user, body.provider, body.amount) };
  });
  app.post("/api/payments/:id/check", async (request) => {
    const user = await requireUser(request);
    const { id } = request.params as { id: string };
    return checkPayment(user.id, id);
  });

  app.get("/api/support", async (request) => {
    const user = await requireUser(request);
    const settings = await getSettings();
    const tickets = await db().supportTicket.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20 });
    return { contact: settings.supportContact, tickets };
  });
  app.post("/api/support", async (request) => {
    const user = await requireUser(request);
    const { message } = z.object({ message: z.string().min(4).max(2000) }).parse(request.body);
    const ticket = await db().supportTicket.create({ data: { userId: user.id, message: message.trim() } });
    await recordEvent({ userId: user.id, type: "support", meta: { ticket: ticket.id } });
    return { ticket };
  });

  app.post("/api/public/hit", async (request, reply) => {
    const { slug, type, session, source, duration, element } = z.object({
      slug: z.string().min(1).max(80),
      type: z.enum(["visit", "download", "heartbeat", "click", "pixel"]),
      session: z.string().max(40).optional(),
      source: z.string().max(80).optional(),
      duration: z.number().min(0).max(86_400).optional(),
      element: z.string().max(80).optional(),
    }).strict().parse(request.body);
    const key = `${request.ip}:${slug}:${type}`;
    const now = Date.now();
    const row = hits.get(key);
    if (!row || now - row.at > 60_000) hits.set(key, { count: 1, at: now });
    else if (row.count > 40) return reply.code(429).send({ error: { code: "rate", message: "Слишком часто" } });
    else row.count += 1;
    await trackPublicHit(slug, type, {
      ip: request.ip,
      userAgent: request.headers["user-agent"],
      referrer: typeof request.headers.referer === "string" ? request.headers.referer : undefined,
      session,
      source,
      duration,
      element,
    });
    return { ok: true };
  });

  app.post("/api/webhooks/cryptobot", async (request, reply) => {
    const settings = await getSettings();
    if (!settings.cryptobotToken) return reply.code(401).send({ ok: false });
    const raw = request.rawBody || "";
    const signature = String(request.headers["crypto-pay-api-signature"] || "");
    if (!safeEqualHex(signature, cryptoBotSignature(settings.cryptobotToken, raw))) return reply.code(401).send({ ok: false });
    const update = request.body as { update_type?: string; payload?: { invoice_id?: number; payload?: string; status?: string } };
    if (update.update_type === "invoice_paid") {
      await creditFromCryptoBot(raw, update.payload?.payload, update.payload?.invoice_id ? String(update.payload.invoice_id) : undefined);
    }
    return { ok: true };
  });

  app.post("/api/webhooks/xrocket", async (request, reply) => {
    const settings = await getSettings();
    if (!settings.xrocketWebhookSecret) return reply.code(401).send({ ok: false });
    const timestamp = String(request.headers["signature-timestamp"] || "");
    const signature = String(request.headers.signature || "");
    const version = String(request.headers["signature-version"] || "");
    if (version !== "v1" || Math.abs(Date.now() - Number(timestamp)) > 5 * 60 * 1000) return reply.code(401).send({ ok: false });
    const raw = request.rawBody || "";
    if (!safeEqualHex(signature, xrocketSignature(settings.xrocketWebhookSecret, timestamp, raw))) return reply.code(401).send({ ok: false });
    const event = request.body as { type?: string; data?: { event?: string; invoice?: { status?: string; id?: string; clientInvoiceId?: string }; payment?: { status?: string } } };
    const invoice = event.data?.invoice;
    const paid = invoice?.status === "paid" || event.data?.payment?.status === "paid";
    if (event.type === "invoice" && paid) await creditFromXrocket(invoice?.clientInvoiceId, invoice?.id);
    return { ok: true };
  });

  await registerAdmin(app);
}

async function registerAdmin(app: FastifyInstance): Promise<void> {
  app.get("/api/admin/overview", async (request) => {
    await requireAdmin(request);
    const [users, domains, landings, payments, tickets, volume] = await Promise.all([
      db().user.count(),
      db().domain.count(),
      db().landing.count(),
      db().payment.count({ where: { status: "paid" } }),
      db().supportTicket.count(),
      db().payment.aggregate({ where: { status: "paid" }, _sum: { amount: true } }),
    ]);
    return { users, domains, landings, payments, tickets, volume: volume._sum.amount || 0, analytics: await userStats() };
  });

  app.get("/api/admin/users", async (request) => {
    await requireAdmin(request);
    const { q } = request.query as { q?: string };
    const users = await db().user.findMany({
      where: q ? { OR: [{ username: { contains: q } }, { telegramId: { contains: q } }, { firstName: { contains: q } }] } : undefined,
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        telegramId: true,
        username: true,
        firstName: true,
        role: true,
        referralCode: true,
        createdAt: true,
        _count: { select: { landings: true } },
      },
    });
    const ids = users.map((user) => user.id);
    const [referrals, visits] = ids.length
      ? await Promise.all([
          db().user.groupBy({ by: ["referredById"], where: { referredById: { in: ids } }, _count: { _all: true } }),
          db().event.groupBy({ by: ["userId"], where: { userId: { in: ids }, type: "visit" }, _count: { _all: true } }),
        ])
      : [[], []];
    return {
      items: users.map((user) => ({
        id: user.id,
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        role: user.role,
        referralCode: user.referralCode,
        createdAt: user.createdAt,
        landings: user._count.landings,
        referrals: referrals.find((row) => row.referredById === user.id)?._count._all ?? 0,
        visits: visits.find((row) => row.userId === user.id)?._count._all ?? 0,
      })),
    };
  });

  app.post("/api/admin/users/:id/balance", async (request) => {
    const admin = await requireAdmin(request);
    const { id } = request.params as { id: string };
    const { amount, reason } = z.object({ amount: z.number(), reason: z.string().min(2).max(120) }).parse(request.body);
    const user = await db().user.findUnique({ where: { id } });
    if (!user) throw new AppError(404, "not_found", "Пользователь не найден");
    const updated = await adjustBalance(user, amount, `admin:${reason}`, admin.id);
    return { user: publicUser(updated) };
  });

  app.get("/api/admin/settings", async (request) => {
    await requireAdmin(request);
    return adminSettings(await getSettings());
  });

  app.put("/api/admin/settings", async (request) => {
    await requireAdmin(request);
    const body = z
      .object({
        ns1: z.string().min(3).optional(),
        ns2: z.string().min(3).optional(),
        platformDomain: z.string().max(253).optional(),
        platformIp: z.string().max(64).optional(),
        originHost: z.string().max(253).optional(),
        cloudflareZoneId: z.string().max(64).optional(),
        cloudflareToken: z.string().optional(),
        supportContact: z.string().min(2).max(64).optional(),
        minTopup: z.number().min(1).max(10000).optional(),
        cryptobotToken: z.string().optional(),
        cryptobotTestnet: z.boolean().optional(),
        xrocketToken: z.string().optional(),
        xrocketWebhookSecret: z.string().optional(),
        tonWallet: z.string().max(120).optional(),
        tonApiKey: z.string().optional(),
        tronWallet: z.string().max(120).optional(),
        tronApiKey: z.string().optional(),
        clearSecrets: z.array(z.enum(["cryptobotToken", "xrocketToken", "xrocketWebhookSecret", "tonApiKey", "tronApiKey", "cloudflareToken"])).optional(),
      })
      .parse(request.body);
    const { clearSecrets, ...patch } = body;
    return adminSettings(await updateSettings(patch, clearSecrets));
  });

  app.get("/api/admin/templates", async (request) => {
    await requireAdmin(request);
    return { items: await db().template.findMany({ orderBy: { createdAt: "asc" } }) };
  });
  app.post("/api/admin/templates", async (request) => {
    await requireAdmin(request);
    const body = templateSchema.parse(request.body);
    assertTheme(body.theme, body.layout);
    return { template: await saveTemplate(body) };
  });
  app.patch("/api/admin/templates/:id", async (request) => {
    await requireAdmin(request);
    const { id } = request.params as { id: string };
    const body = templateSchema.parse(request.body);
    assertTheme(body.theme, body.layout);
    return { template: await saveTemplate({ ...body, id }) };
  });
  app.delete("/api/admin/templates/:id", async (request) => {
    await requireAdmin(request);
    const { id } = request.params as { id: string };
    const used = await db().landing.count({ where: { templateId: id } });
    if (used) {
      await db().template.update({ where: { id }, data: { published: false, inShop: false } });
      return { ok: true, archived: true };
    }
    await db().template.delete({ where: { id } });
    return { ok: true };
  });

  app.get("/api/admin/domains", async (request) => {
    await requireAdmin(request);
    return { items: await db().domain.findMany({ include: { user: { select: { telegramId: true, username: true } } }, orderBy: { createdAt: "desc" }, take: 100 }) };
  });
  app.post("/api/admin/domains/:id/activate", async (request) => {
    await requireAdmin(request);
    const { id } = request.params as { id: string };
    return { domain: await activateDomain(id) };
  });

  app.get("/api/admin/landings", async (request) => {
    await requireAdmin(request);
    return { items: await db().landing.findMany({ include: { user: { select: { telegramId: true, username: true } }, domain: true, template: true }, orderBy: { updatedAt: "desc" }, take: 100 }) };
  });

  app.get("/api/admin/payments", async (request) => {
    await requireAdmin(request);
    await expirePayments();
    return { items: await db().payment.findMany({ include: { user: { select: { telegramId: true, username: true } } }, orderBy: { createdAt: "desc" }, take: 100 }) };
  });
  app.post("/api/admin/payments/:id/confirm", async (request) => {
    await requireAdmin(request);
    const { id } = request.params as { id: string };
    const { txHash } = z.object({ txHash: z.string().max(120).optional() }).parse(request.body ?? {});
    const payment = await markPaid(id, { txHash });
    return { payment };
  });

  app.get("/api/admin/tickets", async (request) => {
    await requireAdmin(request);
    return { items: await db().supportTicket.findMany({ include: { user: { select: { telegramId: true, username: true, firstName: true } } }, orderBy: { createdAt: "desc" }, take: 100 }) };
  });

  app.get("/api/admin/logs", async (request) => {
    await requireAdmin(request);
    const query = request.query as { page?: string; type?: string };
    const paging = pageQuery(query, 20);
    const where = query.type ? { type: query.type } : {};
    const [total, items] = await Promise.all([
      db().event.count({ where }),
      db().event.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: paging.skip,
        take: paging.pageSize,
        include: { landing: { select: { name: true, slug: true, user: { select: { telegramId: true, firstName: true } } } } },
      }),
    ]);
    return { items, page: paging.page, pages: Math.max(1, Math.ceil(total / paging.pageSize)), total };
  });
}
