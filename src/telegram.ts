import { createHash, createHmac } from "node:crypto";
import { config } from "./config.js";
import { db } from "./db.js";
import { AppError } from "./errors.js";

type TelegramUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

export function verifyInitData(initData: string, maxAgeSeconds = 60 * 60 * 24): URLSearchParams {
  if (!config.botToken) {
    throw new AppError(503, "bot_unconfigured", "Бот ещё не подключён: укажите BOT_TOKEN");
  }
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) throw new AppError(401, "bad_init_data", "Нет подписи Telegram");
  const pairs: string[] = [];
  params.forEach((value, key) => {
    if (key !== "hash") pairs.push(`${key}=${value}`);
  });
  pairs.sort();
  const secret = createHmac("sha256", "WebAppData").update(config.botToken).digest();
  const check = createHmac("sha256", secret).update(pairs.join("\n")).digest("hex");
  if (check !== hash) throw new AppError(401, "bad_init_data", "Подпись Telegram не сошлась");
  const authDate = Number(params.get("auth_date") || 0);
  if (!authDate || Math.abs(Date.now() / 1000 - authDate) > maxAgeSeconds) {
    throw new AppError(401, "stale_init_data", "Сессия Telegram устарела, откройте приложение заново");
  }
  return params;
}

export async function userFromInitData(initData: string) {
  const params = verifyInitData(initData);
  const raw = params.get("user");
  if (!raw) throw new AppError(401, "bad_init_data", "В initData нет пользователя");
  const tg = JSON.parse(raw) as TelegramUser;
  return upsertTelegramUser({
    telegramId: String(tg.id),
    username: tg.username,
    firstName: tg.first_name,
    lastName: tg.last_name,
  });
}

export async function upsertTelegramUser(input: {
  telegramId: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}) {
  const role = config.adminIds.includes(input.telegramId) ? "admin" : "user";
  const existing = await db().user.findUnique({ where: { telegramId: input.telegramId } });
  if (!existing) {
    return db().user.create({
      data: {
        telegramId: input.telegramId,
        username: input.username || null,
        firstName: input.firstName || null,
        lastName: input.lastName || null,
        role,
      },
    });
  }
  return db().user.update({
    where: { id: existing.id },
    data: {
      username: input.username || existing.username,
      firstName: input.firstName || existing.firstName,
      lastName: input.lastName || existing.lastName,
      role: config.adminIds.includes(input.telegramId) ? "admin" : existing.role,
    },
  });
}

export function hashIp(ip: string): string {
  return createHash("sha256").update(`${config.appSecret}:${ip}`).digest("hex").slice(0, 24);
}
