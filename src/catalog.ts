import type { User } from "@prisma/client";
import { db } from "./db.js";
import { AppError } from "./errors.js";
import { money, pageQuery } from "./format.js";
import { recordEvent } from "./stats.js";

export async function listTemplates(userId: string | null, scope: string, query: { page?: unknown; pageSize?: unknown }) {
  const paging = pageQuery(query, scope === "examples" ? 3 : 12);
  const purchases = userId
    ? await db().purchase.findMany({ where: { userId }, select: { templateId: true } })
    : [];
  const owned = new Set(purchases.map((item) => item.templateId));
  const where =
    scope === "shop"
      ? { published: true, OR: [{ inShop: true }, { price: { gt: 0 } }] }
      : scope === "usable"
        ? { published: true, OR: [{ price: { lte: 0 } }, { id: { in: [...owned, "none"] } }] }
        : { published: true };
  const [total, items] = await Promise.all([
    db().template.count({ where }),
    db().template.findMany({ where, orderBy: [{ price: "asc" }, { name: "asc" }], skip: paging.skip, take: paging.pageSize }),
  ]);
  return {
    items: items.map((item) => ({ ...item, owned: item.price <= 0 || owned.has(item.id), defaults: JSON.parse(item.defaults) })),
    page: paging.page,
    pageSize: paging.pageSize,
    pages: Math.max(1, Math.ceil(total / paging.pageSize)),
    total,
  };
}

export async function buyTemplate(user: User, templateId: string) {
  const template = await db().template.findFirst({ where: { id: templateId, published: true } });
  if (!template) throw new AppError(404, "not_found", "Шаблон не найден");
  if (template.price <= 0) throw new AppError(400, "free_template", "Этот шаблон бесплатный");
  const existing = await db().purchase.findUnique({ where: { userId_templateId: { userId: user.id, templateId } } });
  if (existing) throw new AppError(409, "owned", "Шаблон уже куплен");
  const price = money(template.price);
  const updated = await db().$transaction(async (tx) => {
    const fresh = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    if (fresh.balance + 1e-9 < price) throw new AppError(402, "insufficient", "Недостаточно средств. Пополните баланс в профиле.");
    await tx.user.update({ where: { id: user.id }, data: { balance: money(fresh.balance - price) } });
    await tx.purchase.create({ data: { userId: user.id, templateId, price } });
    await tx.ledgerEntry.create({ data: { userId: user.id, amount: -price, reason: "shop", ref: template.slug } });
    return tx.user.findUniqueOrThrow({ where: { id: user.id } });
  });
  await recordEvent({ userId: user.id, type: "purchase", meta: { template: template.slug, price } });
  return { balance: money(updated.balance), templateId };
}

export async function saveTemplate(input: {
  id?: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  price: number;
  theme: string;
  layout: string;
  previewHue: string;
  defaults: unknown;
  published: boolean;
  inShop: boolean;
}) {
  const data = {
    slug: input.slug.trim().toLowerCase(),
    name: input.name.trim().slice(0, 60),
    description: input.description.trim().slice(0, 240),
    category: input.category.trim().slice(0, 40),
    price: money(input.price),
    theme: input.theme,
    layout: input.layout,
    previewHue: input.previewHue,
    defaults: JSON.stringify(input.defaults),
    published: input.published,
    inShop: input.inShop,
  };
  if (!/^[a-z0-9-]{2,40}$/.test(data.slug)) throw new AppError(400, "bad_slug", "Slug: латиница, цифры и дефис");
  if (input.id) return db().template.update({ where: { id: input.id }, data });
  return db().template.create({ data });
}
