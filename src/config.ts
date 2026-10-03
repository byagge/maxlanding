const production = process.env.NODE_ENV === "production";

function read(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

const appSecret = read("APP_SECRET", production ? "" : "dev-only-change-me-please-32b");
if (appSecret.length < 16) {
  throw new Error("APP_SECRET must be at least 16 characters");
}

export const config = {
  production,
  port: Number(read("PORT", "8787")),
  appSecret,
  botToken: read("BOT_TOKEN"),
  webappUrl: read("WEBAPP_URL"),
  publicBaseUrl: read("PUBLIC_BASE_URL", `http://127.0.0.1:${read("PORT", "8787")}`),
  adminIds: read("ADMIN_TELEGRAM_IDS", "10000")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean),
  devAuth: !production && read("DEV_AUTH", "1") !== "0",
  platformHosts: read("PLATFORM_HOSTS", "localhost,127.0.0.1")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean),
};

export function isPlatformHost(host: string, platformDomain = ""): boolean {
  const name = host.split(":")[0]?.toLowerCase() ?? "";
  if (config.platformHosts.includes(name)) return true;
  return Boolean(platformDomain) && name === platformDomain.toLowerCase();
}
