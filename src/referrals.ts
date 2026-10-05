import { db } from "./db.js";
import { AppError } from "./errors.js";
import { randomSlug } from "./crypto.js";

export async function ensureReferralCode(userId: string): Promise<string> {
  const user = await db().user.findUniqueOrThrow({ where: { id: userId } });
  if (user.referralCode) return user.referralCode;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const referralCode = randomSlug(8);
    try {
      await db().user.update({ where: { id: userId }, data: { referralCode } });
      return referralCode;
    } catch {
      const fresh = await db().user.findUnique({ where: { id: userId } });
      if (fresh?.referralCode) return fresh.referralCode;
    }
  }
  throw new AppError(500, "referral", "Не удалось выдать код приглашения");
}

export async function applyReferral(userId: string, code: string): Promise<{ ok: boolean; message: string }> {
  const clean = code.trim().toLowerCase();
  if (!clean) throw new AppError(400, "bad_ref", "Код приглашения пустой");
  const user = await db().user.findUniqueOrThrow({ where: { id: userId } });
  if (user.referredById) return { ok: true, message: "Приглашение уже принято" };
  const owner = await db().user.findFirst({ where: { referralCode: clean } });
  if (!owner || owner.id === user.id) throw new AppError(400, "bad_ref", "Код приглашения не найден");
  await db().user.update({ where: { id: user.id }, data: { referredById: owner.id } });
  return { ok: true, message: "Приглашение принято" };
}

export async function listReferrals(userId: string) {
  const code = await ensureReferralCode(userId);
  const items = await db().user.findMany({
    where: { referredById: userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, telegramId: true, username: true, firstName: true, createdAt: true },
  });
  return { code, items };
}
