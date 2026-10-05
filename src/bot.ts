import { Bot, InlineKeyboard, type Context } from "grammy";
import { config } from "./config.js";
import { db } from "./db.js";
import { isPremiumEmojiError, menuMarkup } from "./emoji.js";
import { AppError } from "./errors.js";
import { createLanding } from "./landings.js";
import { applyReferral, listReferrals } from "./referrals.js";
import { getSettings } from "./settings.js";
import { statsText, userStats } from "./stats.js";
import { upsertTelegramUser } from "./telegram.js";

type Draft = { name?: string };

let premiumButtons = true;

async function replyMenu(ctx: Context, text: string, isAdmin: boolean): Promise<void> {
  const web = config.webappUrl.startsWith("https://") ? config.webappUrl : "";
  const send = (premium: boolean) => ctx.reply(text, { reply_markup: menuMarkup(isAdmin, premium, web) });
  if (!premiumButtons) {
    await send(false);
    return;
  }
  try {
    await send(true);
  } catch (error) {
    if (!isPremiumEmojiError(error)) throw error;
    premiumButtons = false;
    console.error("premium emoji недоступны этому боту, меню без custom emoji");
    await send(false);
  }
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
  await replyMenu(ctx, statsText(stats), user.role === "admin");
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
    const payload = String(ctx.match || "").trim();
    if (payload.startsWith("ref_")) {
      try {
        await applyReferral(user.id, payload.slice(4));
      } catch {
        // Неверный код не блокирует меню.
      }
    }
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
      else if (data.startsWith("log:")) await toggleLog(ctx, user.id, data.slice(4));
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
        const name = ctx.message.text.trim();
        if (name.length < 2) {
          await ctx.reply("Название слишком короткое. Напишите ещё раз.");
          return;
        }
        await writeState(user.id, "create_template", { name });
        await sendTemplates(ctx, user.id);
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

async function openScreen(ctx: Context, userId: string, screen: string, page = 1): Promise<void> {
  const user = await db().user.findUniqueOrThrow({ where: { id: userId } });
  if (screen === "create") {
    await writeState(userId, "create_name", {});
    await ctx.reply("Как назвать ссылку? Дальше выберите шаблон — адрес будет уникальным для вас.");
    return;
  }
  if (screen === "domains") {
    const settings = await getSettings();
    const links = await db().landing.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 8 });
    const lines = links.map((item) => `${item.name}: ${item.subdomain}.${settings.platformDomain} · ${item.dnsStatus}${item.customHost ? ` · ${item.customHost}` : ""}`).join("\n") || "Ссылок пока нет.";
    await ctx.reply(`${lines}\n\nNS: ${settings.ns1}, ${settings.ns2}\nGI-сервер: ${settings.platformIp || settings.originHost || "не задан"}\nСвой домен привязывается в мини-приложении. Cloudflare создаёт запись, если токен зоны задан в панели.`);
    return;
  }
  if (screen === "invite") {
    const data = await listReferrals(userId);
    const link = data.inviteUrl || `/start ref_${data.code}`;
    await ctx.reply(`Приглашение даёт такой же кабинет трафера: свои ссылки, домены и статистика.\n\nКод: ${data.code}\n${link}\nПриглашено: ${data.items.length}`);
    return;
  }
  if (screen === "examples") {
    const result = await import("./catalog.js").then((mod) => mod.listTemplates(userId, "examples", { page, pageSize: 3 }));
    const kb = new InlineKeyboard();
    for (const item of result.items) kb.text(item.name, "go:examples").row();
    if (page > 1) kb.text("←", `page:examples:${page - 1}`);
    if (page < result.pages) kb.text("→", `page:examples:${page + 1}`);
    const text = result.items.map((item, index) => `${index + 1}. ${item.name}\n${item.description}`).join("\n\n") || "Примеров пока нет.";
    await ctx.reply(`${text}\n\n${page} / ${result.pages}`, { reply_markup: kb });
    return;
  }
  if (screen === "logs") {
    const events = await db().event.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 8 });
    const lines = events.map((event) => `${event.createdAt.toISOString().slice(0, 16)} · ${event.type}`).join("\n") || "Событий пока нет.";
    const kb = new InlineKeyboard()
      .text(`IP ${user.logIp ? "вкл" : "выкл"}`, "log:ip")
      .text(`UA ${user.logUa ? "вкл" : "выкл"}`, "log:ua")
      .text(`Ref ${user.logReferrer ? "вкл" : "выкл"}`, "log:ref");
    await ctx.reply(`Источник, прямые заходы, время на странице и клики. Содержимое форм не пишется.\n\n${lines}`, { reply_markup: kb });
    return;
  }
  if (screen === "profile") {
    const landings = await db().landing.count({ where: { userId } });
    await ctx.reply(`${user.firstName || "Профиль"}\nTelegram: ${user.telegramId}\nЛендингов: ${landings}`);
    return;
  }
  if (screen === "admin") {
    if (user.role !== "admin") {
      await ctx.reply("Панель управления доступна только администраторам.");
      return;
    }
    const [users, landings, tickets] = await Promise.all([db().user.count(), db().landing.count(), db().supportTicket.count()]);
    const settings = await getSettings();
    await ctx.reply(`Панель управления\nПользователи: ${users}\nЛендинги: ${landings}\nОбращения: ${tickets}\nДомен платформы: ${settings.platformDomain}\nIP для A-записи: ${settings.platformIp || "не задан"}\n\nШаблоны, общий трафик и домены — в мини-приложении, раздел «Админ». Кабинет трафера у вас тот же, что у приглашённых.`);
    return;
  }
  await writeState(userId, "support_text", {});
  const settings = await getSettings();
  await ctx.reply(`Поддержка: ${settings.supportContact}\nНапишите сообщение одним текстом.`);
}

async function sendTemplates(ctx: Context, userId: string): Promise<void> {
  const result = await import("./catalog.js").then((mod) => mod.listTemplates(userId, "examples", { pageSize: 20 }));
  const kb = new InlineKeyboard();
  for (const item of result.items) kb.text(item.name, `tpl:${item.id}`).row();
  await ctx.reply(result.items.length ? "Выберите шаблон. После этого лендинг запустится на поддомене." : "Нет опубликованных шаблонов.", { reply_markup: kb });
}

async function pickTemplate(ctx: Context, userId: string, templateId: string): Promise<void> {
  const user = await db().user.findUniqueOrThrow({ where: { id: userId } });
  const state = await readState(userId);
  const landing = await createLanding(user, { name: state.data.name || "Лендинг", templateId, launch: true });
  await writeState(userId, "idle", {});
  const link = landing.publicUrl || `${config.publicBaseUrl}/l/${landing.slug}`;
  await ctx.reply(`Готовим страницу. Через пару секунд она откроется:\n${link}\n\n${landing.instruction}\nЛокально, пока домен не делегирован: ${config.publicBaseUrl}/l/${landing.slug}`);
}

async function toggleLog(ctx: Context, userId: string, key: string): Promise<void> {
  const user = await db().user.findUniqueOrThrow({ where: { id: userId } });
  const data = key === "ua" ? { logUa: !user.logUa } : key === "ref" ? { logReferrer: !user.logReferrer } : { logIp: !user.logIp };
  await db().user.update({ where: { id: userId }, data });
  await openScreen(ctx, userId, "logs");
}

export async function startBot(): Promise<Bot> {
  const bot = createBot();
  await bot.api.deleteWebhook({ drop_pending_updates: false });
  await bot.api.setMyCommands([
    { command: "start", description: "Главное меню" },
    { command: "cancel", description: "Сбросить текущий шаг" },
  ]);
  void bot.start({
    onStart: (info) => {
      console.log(`bot @${info.username} polling`);
      db().setting.upsert({
        where: { key: "bot_username" },
        create: { key: "bot_username", value: info.username },
        update: { value: info.username },
      }).catch((error) => console.error("bot username", error));
    },
  });
  return bot;
}
