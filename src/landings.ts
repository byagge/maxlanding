import type { Landing, Template, User } from "@prisma/client";
import { db } from "./db.js";
import { AppError } from "./errors.js";
import { randomSlug } from "./crypto.js";
import { lookupDomain, normalizeHostname } from "./dns.js";
import { recordEvent } from "./stats.js";
import { getSettings, type PlatformSettings } from "./settings.js";

const layouts = new Set(["app", "saas", "course", "product", "portfolio", "local"]);
const themes = new Set(["aurora", "pulse", "linen", "noir", "harbor", "ember"]);

export type LandingInput = {
  name: string;
  templateId: string;
  domainId?: string | null;
  title?: string;
  subtitle?: string;
  buttonText?: string;
  downloadUrl?: string | null;
  features?: string[];
  launch?: boolean;
};

export function parseFeatures(raw: string): string[] {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === "string").slice(0, 6);
  } catch {
    return [];
  }
}

export function cleanFeatures(features: string[] | undefined, fallback: string[]): string[] {
  const source = features ?? fallback;
  return source.map((item) => item.trim()).filter(Boolean).slice(0, 6).map((item) => item.slice(0, 80));
}

export function cleanDownloadUrl(value: string | null | undefined): string | null {
  if (!value || !value.trim()) return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new AppError(400, "bad_url", "Ссылка на файл должна быть полным http(s) адресом");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new AppError(400, "bad_url", "Разрешены только ссылки http и https");
  }
  return url.toString().slice(0, 500);
}

async function ownedTemplate(_userId: string, templateId: string): Promise<Template> {
  const template = await db().template.findFirst({ where: { id: templateId, published: true } });
  if (!template) throw new AppError(404, "not_found", "Шаблон не найден");
  return template;
}

async function allocateSubdomain(): Promise<string> {
  const rows = await db().landing.findMany({ select: { subdomain: true } });
  const used = new Set(rows.map((item) => item.subdomain));
  let index = 1;
  while (used.has(`ldng${index}`)) index += 1;
  return `ldng${index}`;
}

const PREPARE_MS = 800;

export function scheduleReady(id: string): void {
  const timer = setTimeout(() => {
    db()
      .landing.updateMany({ where: { id, status: "preparing" }, data: { status: "active" } })
      .catch((error) => console.error("prepare", error));
  }, PREPARE_MS);
  timer.unref();
}

export async function resumePreparing(): Promise<void> {
  await db().landing.updateMany({ where: { status: "preparing" }, data: { status: "active" } });
}

export function hostDecision(addresses: string[], platformIp: string, hostname: string): { status: "active" | "pending"; message: string } {
  if (!platformIp) {
    return { status: "pending", message: "IP платформы ещё не задан. Когда он появится в карточке, создайте A-запись на этот адрес." };
  }
  if (addresses.includes(platformIp)) {
    return { status: "active", message: `A-запись ${hostname} указывает на ${platformIp}. Домен подключён.` };
  }
  return {
    status: "pending",
    message: `Создайте A-запись для ${hostname} и направьте её на ${platformIp}. Сейчас адрес не совпадает, домен пока не открывается.`,
  };
}

function defaultsOf(template: Template): { title: string; subtitle: string; button: string; features: string[] } {
  const parsed = JSON.parse(template.defaults) as { title?: string; subtitle?: string; button?: string; features?: string[] };
  return {
    title: parsed.title || template.name,
    subtitle: parsed.subtitle || template.description,
    button: parsed.button || "Скачать",
    features: cleanFeatures(parsed.features, []),
  };
}

async function uniqueSlug(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = randomSlug(8);
    const exists = await db().landing.findUnique({ where: { slug } });
    if (!exists) return slug;
  }
  return randomSlug(12);
}

export async function createLanding(user: User, input: LandingInput) {
  const name = input.name.trim().slice(0, 60);
  if (name.length < 2) throw new AppError(400, "bad_name", "Название лендинга слишком короткое");
  const template = await ownedTemplate(user.id, input.templateId);
  const defaults = defaultsOf(template);
  const launch = input.launch !== false;
  const landing = await db().landing.create({
    data: {
      userId: user.id,
      templateId: template.id,
      slug: await uniqueSlug(),
      subdomain: await allocateSubdomain(),
      name,
      status: launch ? "preparing" : "draft",
      title: (input.title || name || defaults.title).trim().slice(0, 80),
      subtitle: (input.subtitle || defaults.subtitle).trim().slice(0, 180),
      buttonText: (input.buttonText || defaults.button).trim().slice(0, 32),
      downloadUrl: cleanDownloadUrl(input.downloadUrl),
      features: JSON.stringify(cleanFeatures(input.features, defaults.features)),
    },
    include: landingInclude,
  });
  if (launch) scheduleReady(landing.id);
  return decorateLanding(landing);
}

const landingInclude = { template: true, domain: true } as const;

async function assertDomain(userId: string, domainId?: string | null) {
  if (!domainId) return null;
  const domain = await db().domain.findFirst({ where: { id: domainId, userId } });
  if (!domain) throw new AppError(404, "not_found", "Домен не найден");
  return domain;
}

export async function updateLanding(userId: string, landingId: string, input: Partial<LandingInput>) {
  const landing = await db().landing.findFirst({ where: { id: landingId, userId } });
  if (!landing) throw new AppError(404, "not_found", "Лендинг не найден");
  const domain = input.domainId === undefined ? undefined : await assertDomain(userId, input.domainId);
  if (input.templateId && input.templateId !== landing.templateId) await ownedTemplate(userId, input.templateId);
  const updated = await db().landing.update({
    where: { id: landing.id },
    data: {
      name: input.name?.trim().slice(0, 60) || undefined,
      templateId: input.templateId || undefined,
      domainId: domain === undefined ? undefined : domain?.id ?? null,
      title: input.title?.trim().slice(0, 80) || undefined,
      subtitle: input.subtitle?.trim().slice(0, 180) || undefined,
      buttonText: input.buttonText?.trim().slice(0, 32) || undefined,
      downloadUrl: input.downloadUrl === undefined ? undefined : cleanDownloadUrl(input.downloadUrl),
      features: input.features ? JSON.stringify(cleanFeatures(input.features, [])) : undefined,
    },
    include: landingInclude,
  });
  return decorateLanding(updated);
}

export async function launchLanding(userId: string, landingId: string) {
  const landing = await db().landing.findFirst({ where: { id: landingId, userId }, include: { domain: true, template: true } });
  if (!landing) throw new AppError(404, "not_found", "Лендинг не найден");
  await ownedTemplate(userId, landing.templateId);
  if (landing.domain && landing.domain.status !== "active") {
    throw new AppError(409, "domain_inactive", "Домен ещё не подключён. Дождитесь NS или запустите без домена — платформенная ссылка заработает сразу.");
  }
  if (landing.domainId) {
    await db().landing.updateMany({
      where: { domainId: landing.domainId, id: { not: landing.id }, status: "active" },
      data: { status: "paused" },
    });
  }
  const updated = await db().landing.update({
    where: { id: landing.id },
    data: { status: "preparing", subdomain: landing.subdomain || (await allocateSubdomain()) },
    include: landingInclude,
  });
  scheduleReady(updated.id);
  return decorateLanding(updated);
}

export async function pauseLanding(userId: string, landingId: string) {
  const landing = await db().landing.findFirst({ where: { id: landingId, userId } });
  if (!landing) throw new AppError(404, "not_found", "Лендинг не найден");
  return decorateLanding(await db().landing.update({ where: { id: landing.id }, data: { status: "paused" }, include: landingInclude }));
}

export async function deleteLanding(userId: string, landingId: string) {
  const landing = await db().landing.findFirst({ where: { id: landingId, userId } });
  if (!landing) throw new AppError(404, "not_found", "Лендинг не найден");
  await db().landing.delete({ where: { id: landing.id } });
}

export async function getLanding(userId: string, landingId: string) {
  const landing = await db().landing.findFirst({ where: { id: landingId, userId }, include: landingInclude });
  if (!landing) throw new AppError(404, "not_found", "Лендинг не найден");
  return decorateLanding(landing);
}

export async function connectCustomHost(userId: string, landingId: string, hostname: string) {
  const host = normalizeHostname(hostname);
  const settings = await getSettings();
  const landing = await db().landing.findFirst({ where: { id: landingId, userId } });
  if (!landing) throw new AppError(404, "not_found", "Лендинг не найден");
  const platformHost = landing.subdomain && settings.platformDomain ? `${landing.subdomain}.${settings.platformDomain}` : "";
  if (platformHost && (host === platformHost || host.endsWith(`.${settings.platformDomain}`))) {
    throw new AppError(400, "bad_domain", "Это адрес платформы. Укажите свой домен.");
  }
  const lookup = await lookupDomain(host);
  const decision = hostDecision(lookup.a, settings.platformIp, host);
  const updated = await db().landing.update({
    where: { id: landing.id },
    data: { customHost: host, customStatus: decision.status },
    include: landingInclude,
  });
  return { landing: await decorateLanding(updated), message: decision.message };
}

export function presentLanding(landing: Landing & { template?: Template; domain?: { hostname: string; status: string } | null }) {
  return { ...landing, features: parseFeatures(landing.features) };
}

export function addressFor(settings: PlatformSettings, landing: { subdomain?: string | null }) {
  const domain = settings.platformDomain;
  const host = landing.subdomain && domain ? `${landing.subdomain}.${domain}` : null;
  return {
    publicHost: host,
    publicUrl: host ? `https://${host}` : null,
    platformDomain: domain,
    platformIp: settings.platformIp,
    instruction: settings.platformIp
      ? `Чтобы открыть лендинг на своём домене, создайте A-запись и направьте её на ${settings.platformIp}.`
      : "IP платформы ещё не задан в панели. После этого A-запись вашего домена нужно направить на этот IP.",
  };
}

export async function decorateLanding<T extends Landing>(landing: T) {
  const settings = await getSettings();
  return { ...presentLanding(landing), ...addressFor(settings, landing) };
}

export async function decorateMany<T extends Landing>(landings: T[]) {
  const settings = await getSettings();
  return landings.map((landing) => ({ ...presentLanding(landing), ...addressFor(settings, landing) }));
}

export function assertTheme(theme: string, layout: string): void {
  if (!themes.has(theme) || !layouts.has(layout)) {
    throw new AppError(400, "bad_template", "Неизвестная тема или макет");
  }
}

export async function trackPublicHit(slug: string, type: "visit" | "download", request: { ip?: string; userAgent?: string; referrer?: string }) {
  const landing = await db().landing.findFirst({ where: { slug, status: "active" }, include: { user: true } });
  if (!landing) throw new AppError(404, "not_found", "Лендинг не опубликован");
  if (type === "download" && !landing.downloadUrl) throw new AppError(400, "no_file", "У лендинга нет ссылки на файл");
  await recordEvent({
    landingId: landing.id,
    userId: landing.userId,
    type,
    ip: request.ip,
    userAgent: request.userAgent,
    referrer: request.referrer,
    storeIp: landing.user.logIp,
    storeUa: landing.user.logUa,
    storeReferrer: landing.user.logReferrer,
  });
  return landing;
}
