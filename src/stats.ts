import type { User } from "@prisma/client";
import { db } from "./db.js";
import { AppError } from "./errors.js";
import { formatPercent, money } from "./format.js";
import { hashIp } from "./telegram.js";

export async function userStats(userId: string) {
  const landings = await db().landing.findMany({ where: { userId }, select: { id: true } });
  const ids = landings.map((item) => item.id);
  if (!ids.length) return { visits: 0, downloads: 0, conversion: "0%" };
  const grouped = await db().event.groupBy({
    by: ["type"],
    where: { landingId: { in: ids }, type: { in: ["visit", "download"] } },
    _count: { _all: true },
  });
  const visits = grouped.find((item) => item.type === "visit")?._count._all ?? 0;
  const downloads = grouped.find((item) => item.type === "download")?._count._all ?? 0;
  return { visits, downloads, conversion: formatPercent(visits, downloads) };
}

export function statsText(stats: { visits: number; downloads: number; conversion: string }): string {
  return ["📊 Статистика по доменам", `Переходов: ${stats.visits} | Скачивание АПК: ${stats.downloads} |`, `Конверсия: ${stats.conversion}`, "", "Выберите действие:"].join("\n");
}

export async function adjustBalance(user: User, amount: number, reason: string, ref?: string) {
  const delta = money(amount);
  if (!Number.isFinite(delta) || delta === 0) throw new AppError(400, "bad_amount", "Сумма должна быть ненулевой");
  return db().$transaction(async (tx) => {
    const fresh = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    const next = money(fresh.balance + delta);
    if (next < 0) throw new AppError(400, "insufficient", "Баланс не может стать отрицательным");
    const updated = await tx.user.update({ where: { id: user.id }, data: { balance: next } });
    await tx.ledgerEntry.create({ data: { userId: user.id, amount: delta, reason, ref } });
    return updated;
  });
}

export async function recordEvent(input: {
  landingId?: string | null;
  userId?: string | null;
  type: string;
  meta?: unknown;
  ip?: string | null;
  userAgent?: string | null;
  referrer?: string | null;
  storeIp?: boolean;
  storeUa?: boolean;
  storeReferrer?: boolean;
}) {
  return db().event.create({
    data: {
      landingId: input.landingId || null,
      userId: input.userId || null,
      type: input.type,
      meta: JSON.stringify(input.meta ?? {}),
      ipHash: input.storeIp && input.ip ? hashIp(input.ip) : null,
      userAgent: input.storeUa ? input.userAgent?.slice(0, 240) || null : null,
      referrer: input.storeReferrer ? input.referrer?.slice(0, 240) || null : null,
    },
  });
}
