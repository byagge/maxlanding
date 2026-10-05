import { decryptSecret, encryptSecret, maskSecret } from "./crypto.js";
import { config } from "./config.js";
import { db } from "./db.js";

export type PlatformSettings = {
  ns1: string;
  ns2: string;
  platformDomain: string;
  platformIp: string;
  originHost: string;
  cloudflareZoneId: string;
  cloudflareToken: string;
  supportContact: string;
  minTopup: number;
  cryptobotToken: string;
  cryptobotTestnet: boolean;
  xrocketToken: string;
  xrocketWebhookSecret: string;
  tonWallet: string;
  tonApiKey: string;
  tronWallet: string;
  tronApiKey: string;
};

const SECRET_KEYS = ["cryptobotToken", "xrocketToken", "xrocketWebhookSecret", "tonApiKey", "tronApiKey", "cloudflareToken"] as const;

export const defaultSettings = (): PlatformSettings => ({
  ns1: "ns1.maxlanding.app",
  ns2: "ns2.maxlanding.app",
  platformDomain: "max.com",
  platformIp: "",
  originHost: "",
  cloudflareZoneId: "",
  cloudflareToken: "",
  supportContact: "@maxlanding_support",
  minTopup: 5,
  cryptobotToken: "",
  cryptobotTestnet: false,
  xrocketToken: "",
  xrocketWebhookSecret: "",
  tonWallet: "",
  tonApiKey: "",
  tronWallet: "",
  tronApiKey: "",
});

function encode(settings: PlatformSettings): string {
  const stored: PlatformSettings = { ...settings };
  for (const key of SECRET_KEYS) stored[key] = encryptSecret(settings[key]);
  return JSON.stringify(stored);
}

function decode(raw: string | null | undefined): PlatformSettings {
  const base = defaultSettings();
  if (!raw) return base;
  const parsed = JSON.parse(raw) as Partial<PlatformSettings>;
  const merged = { ...base, ...parsed };
  for (const key of SECRET_KEYS) merged[key] = decryptSecret(String(parsed[key] ?? ""));
  merged.minTopup = Number(merged.minTopup) || base.minTopup;
  return merged;
}

export async function getSettings(): Promise<PlatformSettings> {
  const row = await db().setting.findUnique({ where: { key: "platform" } });
  return decode(row?.value);
}

export async function ensureSettings(): Promise<PlatformSettings> {
  const row = await db().setting.findUnique({ where: { key: "platform" } });
  if (row) return decode(row.value);
  const settings = defaultSettings();
  await db().setting.create({ data: { key: "platform", value: encode(settings) } });
  return settings;
}

export async function updateSettings(patch: Partial<PlatformSettings>, clear: string[] = []): Promise<PlatformSettings> {
  const current = await ensureSettings();
  const next: PlatformSettings = { ...current, ...patch, minTopup: Number(patch.minTopup ?? current.minTopup) };
  if (patch.platformDomain !== undefined) {
    next.platformDomain = String(patch.platformDomain).trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0]?.split(":")[0]?.replace(/\.$/, "") || current.platformDomain;
  }
  for (const key of SECRET_KEYS) {
    if (clear.includes(key)) next[key] = "";
    else if (!patch[key]) next[key] = current[key];
  }
  await db().setting.upsert({
    where: { key: "platform" },
    create: { key: "platform", value: encode(next) },
    update: { value: encode(next) },
  });
  return next;
}

export function publicSettings(settings: PlatformSettings) {
  return {
    ns1: settings.ns1,
    ns2: settings.ns2,
    platformDomain: settings.platformDomain,
    platformIp: settings.platformIp,
    originHost: settings.originHost,
    cloudflareZoneId: settings.cloudflareZoneId,
    cloudflare: Boolean(settings.cloudflareToken && settings.cloudflareZoneId),
    supportContact: settings.supportContact,
    minTopup: settings.minTopup,
    publicBaseUrl: config.publicBaseUrl,
    providers: {
      cryptobot: Boolean(settings.cryptobotToken),
      xrocket: Boolean(settings.xrocketToken),
      ton: Boolean(settings.tonWallet),
      trc20: Boolean(settings.tronWallet),
    },
  };
}

export function adminSettings(settings: PlatformSettings) {
  return {
    ...publicSettings(settings),
    cryptobotTestnet: settings.cryptobotTestnet,
    secrets: {
      cryptobotToken: maskSecret(settings.cryptobotToken),
      xrocketToken: maskSecret(settings.xrocketToken),
      xrocketWebhookSecret: maskSecret(settings.xrocketWebhookSecret),
      tonApiKey: maskSecret(settings.tonApiKey),
      tronApiKey: maskSecret(settings.tronApiKey),
      cloudflareToken: maskSecret(settings.cloudflareToken),
    },
    wallets: {
      ton: settings.tonWallet,
      trc20: settings.tronWallet,
    },
  };
}
