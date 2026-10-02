import type { Domain, User } from "@prisma/client";
import { db } from "./db.js";
import { decideDomain, lookupDomain, normalizeHostname } from "./dns.js";
import { AppError } from "./errors.js";
import { isPlatformHost } from "./config.js";
import { getSettings } from "./settings.js";

export async function listDomains(userId: string) {
  return db().domain.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    include: { landings: { select: { id: true, name: true, status: true, slug: true } } },
  });
}

export async function addDomain(user: User, hostnameInput: string): Promise<Domain> {
  const hostname = normalizeHostname(hostnameInput);
  if (isPlatformHost(hostname)) throw new AppError(400, "bad_domain", "Этот адрес принадлежит платформе");
  const settings = await getSettings();
  try {
    return await db().domain.create({
      data: { userId: user.id, hostname, ns1: settings.ns1, ns2: settings.ns2, status: "pending_ns" },
    });
  } catch {
    throw new AppError(409, "domain_taken", "Этот домен уже добавлен");
  }
}

export async function verifyDomain(userId: string, domainId: string) {
  const domain = await db().domain.findFirst({ where: { id: domainId, userId } });
  if (!domain) throw new AppError(404, "not_found", "Домен не найден");
  const settings = await getSettings();
  const expected = [settings.ns1, settings.ns2];
  let looked: { ns: string[]; a: string[] };
  try {
    looked = await lookupDomain(domain.hostname);
  } catch {
    looked = { ns: [], a: [] };
  }
  const decision = decideDomain({
    actualNs: looked.ns,
    actualA: looked.a,
    expectedNs: expected,
    platformIp: settings.platformIp.trim(),
  });
  return db().domain.update({
    where: { id: domain.id },
    data: {
      ns1: settings.ns1,
      ns2: settings.ns2,
      status: decision.ok ? "active" : decision.status === "mismatch" ? "error" : "pending_ns",
      lastCheckAt: new Date(),
      lastError: decision.ok ? null : decision.message,
    },
  });
}

export async function activateDomain(domainId: string) {
  const domain = await db().domain.findUnique({ where: { id: domainId } });
  if (!domain) throw new AppError(404, "not_found", "Домен не найден");
  return db().domain.update({
    where: { id: domain.id },
    data: { status: "active", lastCheckAt: new Date(), lastError: null },
  });
}

export async function deleteDomain(userId: string, domainId: string) {
  const domain = await db().domain.findFirst({
    where: { id: domainId, userId },
    include: { landings: true },
  });
  if (!domain) throw new AppError(404, "not_found", "Домен не найден");
  if (domain.landings.some((landing) => landing.status === "active")) {
    throw new AppError(409, "domain_busy", "Сначала остановите лендинг на этом домене");
  }
  await db().landing.updateMany({ where: { domainId: domain.id }, data: { domainId: null } });
  await db().domain.delete({ where: { id: domain.id } });
}
