import { Bot, InlineKeyboard, type Context } from "grammy";
import { config } from "./config.js";
import { db } from "./db.js";
import { addDomain, listDomains } from "./domains.js";
import { AppError } from "./errors.js";
import { formatUsdt } from "./format.js";
import { createLanding } from "./landings.js";
import { buyTemplate } from "./catalog.js";
import { checkPayment, createInvoice } from "./payments.js";
import { getSettings, publicSettings } from "./settings.js";
import { statsText, userStats } from "./stats.js";
import { upsertTelegramUser } from "./telegram.js";

type Draft = {
  name?: string;
  templateId?: string;
  domainId?: string | null;
  title?: string;
  subtitle?: string;
  button?: string;
  downloadUrl?: string | null;
  provider?: "cryptobot" | "xrocket" | "ton" | "trc20";
};

const screens = [
  ["🔗 Создать ленд", "create"],
  ["📁 Мои домены", "domains"],
  ["🏷 Примеры лендингов", "examples"],
  ["🔔 Настройки логов", "logs"],
  ["👤 Профиль", "profile"],
  ["🛒 Магазин лендов", "shop"],
  ["🎛 Панель управления", "admin"],
  ["💬 Поддержка", "support"],
] as const;

function menuKeyboard(): InlineKeyboard {
  const web = config.webappUrl.startsWith("https://") ? config.webappUrl.replace(/\/$/, "") : "";
  const kb = new InlineKeyboard();
  const rows = [2, 1, 2, 1, 1, 1];
  let index = 0;
  for (const size of rows) {
    for (let i = 0; i < size; i += 1) {
      const [label, screen] = screens[index];
      index += 1;
      if (web) kb.webApp(label, `${web}?screen=${screen}`);
      else kb.text(label, `go:${screen}`);
    }
    if (index < screens.length) kb.row();
  }
  return kb;
}

async function actor(ctx: Context) {
  const from = ctx.from;
  if (!from) throw new AppError(401, "unauthorized", "Нет пользователя Telegram");
  return upsertTelegramUser({
    telegramId: String(from.id),
    username: from.username,
    firstName: from.first_name,
    lastName: from.last_name,
  });
}

async function readState(userId: string): Promise<{ step: string; data: Draft }> {
  const row = await db().botState.findUnique({ where: { userId } });
  if (!row) return { step: "idle", data: {} };
  return { step: row.step, data: JSON.parse(row.data) as Draft };
}

async function writeState(userId: string, step: string, data: Draft): Promise<void> {
  await db().botState.upsert({
    where: { userId },
    create: { userId, step, data: JSON.stringify(data) },
    update: { step, data: JSON.stringify(data) },
  });
}

async function showMenu(ctx: Context): Promise<void> {
  const user = await actor(ctx);
  const stats = await userStats(user.id);
  await ctx.reply(statsText(stats), { reply_markup: menuKeyboard() });
}

function plainError(error: unknown): string {
  if (error instanceof AppError) return error.message;
  return "Не получилось выполнить действие. Попробуйте ещё раз.";
}

export function createBot(): Bot {
  const bot = new Bot(config.botToken);
  bot.catch((error) => {
    console.error("bot", error.error);
  });

  bot.command(["start", "menu"], async (ctx) => {
    const user = await actor(ctx);
    await writeState(user.id, "idle", {});
    await showMenu(ctx);
  });

  bot.command("cancel", async (ctx) => {
    const user = await actor(ctx);
    await writeState(user.id, "idle", {});
    await ctx.reply("Шаг сброшен.");
    await showMenu(ctx);
  });

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    const user = await actor(ctx);
    await ctx.answerCallbackQuery();
    try {
      if (data.startsWith("go:")) await openScreen(ctx, user.id, data.slice(3));
      else if (data.startsWith("tpl:")) await pickTemplate(ctx, user.id, data.slice(4));
      else if (data.startsWith("dom:")) await pickDomain(ctx, user.id, data.slice(4));
      else if (data.startsWith("buy:")) {
        const result = await buyTemplate(user, data.slice(4));
        await ctx.reply(`Шаблон куплен. Баланс: ${formatUsdt(result.balance)}`);
      } else if (data.startsWith("pay:")) {
        const provider = data.slice(4) as Draft["provider"];
        await writeState(user.id, "topup_amount", { provider });
        await ctx.reply("Введите сумму пополнения в USDT.");
      } else if (data.startsWith("chk:")) {
        const result = await checkPayment(user.id, data.slice(4));
        await ctx.reply(`${result.detail}\nСтатус: ${result.payment.status}`);
      } else if (data.startsWith("log:")) await toggleLog(ctx, user.id, data.slice(4));
      else if (data.startsWith("page:")) await openScreen(ctx, user.id, data.split(":")[1] || "examples", Number(data.split(":")[2] || 1));
    } catch (error) {
      await ctx.reply(plainError(error));
    }
  });

  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) return;
    const user = await actor(ctx);
    const state = await readState(user.id);
    try {
      if (state.step === "create_name") {
        await writeState(user.id, "create_template", { name: ctx.message.text.trim() });
        await sendTemplates(ctx, user.id);
        return;
      }
      if (state.step === "create_title") return askNext(ctx, user.id, state.data, "title", ctx.message.text, "create_subtitle", "Подзаголовок:");
      if (state.step === "create_subtitle") return askNext(ctx, user.id, state.data, "subtitle", ctx.message.text, "create_button", "Текст кнопки:");
      if (state.step === "create_button") return askNext(ctx, user.id, state.data, "button", ctx.message.text, "create_url", "Ссылка на APK или файл. Или отправьте - чтобы пропустить.");
      if (state.step === "create_url") {
        const downloadUrl = ctx.message.text.trim() === "-" ? null : ctx.message.text.trim();
        const landing = await createLanding(user, {
          name: state.data.name || "Лендинг",
          templateId: state.data.templateId || "",
          domainId: state.data.domainId,
          title: state.data.title,
          subtitle: state.data.subtitle,
          buttonText: state.data.button,
          downloadUrl,
          launch: true,
        });
        await writeState(user.id, "idle", {});
        await ctx.reply(`Лендинг запущен: ${config.publicBaseUrl}/l/${landing.slug}`);
        return;
      }
      if (state.step === "domain_host") {
        const domain = await addDomain(user, ctx.message.text);
        await writeState(user.id, "idle", {});
        await ctx.reply(`Домен ${domain.hostname} добавлен.\nNS:\n${domain.ns1}\n${domain.ns2}\nПосле смены NS нажмите «Мои домены» и проверку в приложении.`);
        return;
      }
      if (state.step === "topup_amount" && state.data.provider) {
        const amount = Number(ctx.message.text.replace(",", "."));
        const payment = await createInvoice(user, state.data.provider, amount);
        await writeState(user.id, "idle", {});
        const meta = JSON.parse(payment.meta) as { display?: string; tonAmount?: number };
        const extra = payment.payUrl
          ? payment.payUrl
          : `Адрес: ${payment.address}\nСумма: ${meta.display || meta.tonAmount || payment.amount} ${payment.asset}\nКомментарий: ${payment.memo}`;
        await ctx.reply(`Счёт создан.\n${extra}`, { reply_markup: new InlineKeyboard().text("Проверить оплату", `chk:${payment.id}`) });
        return;
      }
      if (state.step === "support_text") {
        await db().supportTicket.create({ data: { userId: user.id, message: ctx.message.text.trim() } });
        await writeState(user.id, "idle", {});
        await ctx.reply("Сообщение передано в поддержку.");
        return;
      }
      await ctx.reply("Откройте /start и выберите действие.");
    } catch (error) {
      await ctx.reply(plainError(error));
    }
  });

  return bot;
}

async function askNext(ctx: Context, userId: string, data: Draft, key: keyof Draft, value: string, step: string, prompt: string) {
  await writeState(userId, step, { ...data, [key]: value.trim() });
  await ctx.reply(prompt);
}

async function openScreen(ctx: Context, userId: string, screen: string, page = 1): Promise<void> {
  const user = await db().user.findUniqueOrThrow({ where: { id: userId } });
  if (screen === "create") {
    await writeState(userId, "create_name", {});
    await ctx.reply("Как назвать лендинг?");
    return;
  }
  if (screen === "domains") {
    const domains = await listDomains(userId);
    const lines = domains.length ? domains.map((item) => `${item.hostname} — ${item.status}`).join("\n") : "Доменов пока нет.";
    await writeState(userId, "domain_host", {});
    await ctx.reply(`${lines}\n\nПришлите домен, чтобы подключить его через NS ${ (await getSettings()).ns1 } и ${ (await getSettings()).ns2 }.`);
    return;
  }
  if (screen === "examples" || screen === "shop") {
    const scope = screen === "shop" ? "shop" : "examples";
    const result = await import("./catalog.js").then((mod) => mod.listTemplates(userId, scope, { page, pageSize: 3 }));
    const kb = new InlineKeyboard();
    for (const item of result.items) {
      const price = item.price > 0 ? formatUsdt(item.price) : "бесплатно";
      if (screen === "shop" && item.price > 0 && !item.owned) kb.text(`${item.name} · ${price}`, `buy:${item.id}`).row();
      else kb.text(`${item.name} · ${price}`, `go:examples`).row();
    }
    if (page > 1) kb.text("←", `page:${screen}:${page - 1}`);
    if (page < result.pages) kb.text("→", `page:${screen}:${page + 1}`);
    await ctx.reply(result.items.map((item, index) => `${index + 1}. ${item.name}\n${item.description}`).join("\n\n") || "Пусто", { reply_markup: kb });
    return;
  }
  if (screen === "logs") {
    const events = await db().event.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 8 });
    const lines = events.map((event) => `${event.createdAt.toISOString().slice(0, 16)} · ${event.type}`).join("\n") || "Событий пока нет.";
    const kb = new InlineKeyboard()
      .text(`IP ${user.logIp ? "вкл" : "выкл"}`, "log:ip")
      .text(`UA ${user.logUa ? "вкл" : "выкл"}`, "log:ua")
      .text(`Ref ${user.logReferrer ? "вкл" : "выкл"}`, "log:ref");
    await ctx.reply(`Раздел логов ещё будет расширен. Сейчас видны последние события.\n\n${lines}`, { reply_markup: kb });
    return;
  }
  if (screen === "profile") {
    const settings = publicSettings(await getSettings());
    const kb = new InlineKeyboard();
    if (settings.providers.cryptobot) kb.text("CryptoBot", "pay:cryptobot");
    if (settings.providers.xrocket) kb.text("xRocket", "pay:xrocket");
    if (settings.providers.trc20) kb.text("USDT TRC20", "pay:trc20");
    if (settings.providers.ton) kb.text("TON", "pay:ton");
    await ctx.reply(`Баланс: ${formatUsdt(user.balance)}\nTelegram: ${user.telegramId}`, { reply_markup: kb });
    return;
  }
  if (screen === "admin") {
    if (user.role !== "admin") {
      await ctx.reply("Панель управления доступна только администраторам.");
      return;
    }
    const [users, landings, payments] = await Promise.all([db().user.count(), db().landing.count(), db().payment.count()]);
    await ctx.reply(`Панель управления\nПользователи: ${users}\nЛендинги: ${landings}\nСчета: ${payments}\nТокены оплат и шаблоны настраиваются в мини-приложении.`);
    return;
  }
  await writeState(userId, "support_text", {});
  const settings = await getSettings();
  await ctx.reply(`Поддержка: ${settings.supportContact}\nНапишите сообщение одним текстом.`);
}

async function sendTemplates(ctx: Context, userId: string): Promise<void> {
  const result = await import("./catalog.js").then((mod) => mod.listTemplates(userId, "usable", { pageSize: 20 }));
  const kb = new InlineKeyboard();
  for (const item of result.items) kb.text(item.name, `tpl:${item.id}`).row();
  await ctx.reply(result.items.length ? "Выберите шаблон." : "Нет доступных шаблонов. Загляните в магазин.", { reply_markup: kb });
}

async function pickTemplate(ctx: Context, userId: string, templateId: string): Promise<void> {
  const state = await readState(userId);
  const domains = await listDomains(userId);
  await writeState(userId, "create_domain", { ...state.data, templateId });
  const kb = new InlineKeyboard().text("Без домена", "dom:skip").row();
  for (const domain of domains) kb.text(`${domain.hostname} (${domain.status})`, `dom:${domain.id}`).row();
  await ctx.reply("Прикрепите домен или запустите на адресе платформы.", { reply_markup: kb });
}

async function pickDomain(ctx: Context, userId: string, domainId: string): Promise<void> {
  const state = await readState(userId);
  await writeState(userId, "create_title", { ...state.data, domainId: domainId === "skip" ? null : domainId });
  await ctx.reply("Заголовок на странице:");
}

async function toggleLog(ctx: Context, userId: string, key: string): Promise<void> {
  const user = await db().user.findUniqueOrThrow({ where: { id: userId } });
  const data = key === "ua" ? { logUa: !user.logUa } : key === "ref" ? { logReferrer: !user.logReferrer } : { logIp: !user.logIp };
  await db().user.update({ where: { id: userId }, data });
  await openScreen(ctx, userId, "logs");
}

export async function startBot(): Promise<Bot> {
  const bot = createBot();
  await bot.api.setMyCommands([
    { command: "start", description: "Главное меню" },
    { command: "cancel", description: "Сбросить текущий шаг" },
  ]);
  void bot.start({
    onStart: (info) => console.log(`bot @${info.username} polling`),
  });
  return bot;
}
