import type { PlatformSettings } from "./settings.js";

export type DnsTarget = { type: "A" | "CNAME"; content: string };

export function dnsTarget(settings: Pick<PlatformSettings, "platformIp" | "originHost">): DnsTarget | null {
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(settings.platformIp)) return { type: "A", content: settings.platformIp };
  const host = settings.originHost.trim().replace(/\.$/, "");
  if (host) return { type: "CNAME", content: host };
  return null;
}

type CloudflareRecord = { id: string; name: string };

export async function upsertCloudflareRecord(settings: PlatformSettings, name: string): Promise<{ ok: boolean; detail: string }> {
  const target = dnsTarget(settings);
  if (!settings.cloudflareToken || !settings.cloudflareZoneId || !target) {
    const ip = settings.platformIp || settings.originHost || "IP GI-сервера";
    return { ok: false, detail: `Cloudflare не настроен. Для ${name} создайте ${target?.type || "A"}-запись на ${ip}. NS: ${settings.ns1}, ${settings.ns2}.` };
  }
  const headers = { authorization: `Bearer ${settings.cloudflareToken}`, "content-type": "application/json" };
  const base = `https://api.cloudflare.com/client/v4/zones/${settings.cloudflareZoneId}/dns_records`;
  const listed = await fetch(`${base}?name=${encodeURIComponent(name)}`, { headers });
  const listBody = await listed.json() as { success?: boolean; errors?: Array<{ message?: string }>; result?: CloudflareRecord[] };
  if (!listed.ok || listBody.success === false) {
    return { ok: false, detail: listBody.errors?.[0]?.message || "Cloudflare не ответил на чтение зоны" };
  }
  const payload = { type: target.type, name, content: target.content, ttl: 1, proxied: false };
  const existing = listBody.result?.[0];
  const response = await fetch(existing ? `${base}/${existing.id}` : base, {
    method: existing ? "PUT" : "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const body = await response.json() as { success?: boolean; errors?: Array<{ message?: string }> };
  if (!response.ok || body.success === false) {
    return { ok: false, detail: body.errors?.[0]?.message || "Cloudflare не записал DNS" };
  }
  return { ok: true, detail: `${target.type} ${name} → ${target.content}` };
}
