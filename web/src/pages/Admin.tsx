import { useEffect, useState } from "react";
import { api, when } from "../api";

export type AdminSection = "overview" | "traffic" | "templates" | "settings";

type Settings = {
  platformDomain: string;
  platformIp: string;
  originHost: string;
  cloudflareZoneId: string;
  supportContact: string;
  ns1: string;
  ns2: string;
  secrets?: { cloudflareToken?: string };
};

type UserRow = {
  id: string;
  telegramId: string;
  username?: string | null;
  firstName?: string | null;
  role: string;
  landings: number;
  referrals: number;
  visits: number;
};

type LogItem = {
  id: string;
  type: string;
  createdAt: string;
  meta?: string;
  landing?: { name: string; user?: { telegramId: string; firstName?: string | null } } | null;
};

function roleName(role: string): string {
  return role === "admin" ? "админ" : "трафер";
}

function detail(item: LogItem): string {
  try {
    const meta = JSON.parse(item.meta || "{}") as { source?: string; element?: string; duration?: number };
    return [meta.source, meta.element, typeof meta.duration === "number" ? `${meta.duration} с` : ""].filter(Boolean).join(" · ");
  } catch {
    return "";
  }
}

export function AdminPage({ section }: { section: AdminSection }) {
  const [overview, setOverview] = useState<{ users: number; landings: number; domains: number; tickets: number; analytics?: { visits: number; direct: number; clicks: number; pixels: number; avgSeconds: number } } | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; slug: string; published: boolean; html?: string }>>([]);
  const [landings, setLandings] = useState<Array<{ id: string; name: string; status: string; subdomain?: string | null; customHost?: string | null; dnsStatus?: string; user?: { telegramId: string; firstName?: string | null } }>>([]);
  const [domains, setDomains] = useState<Array<{ id: string; hostname: string; status: string; user?: { telegramId: string } }>>([]);
  const [tickets, setTickets] = useState<Array<{ id: string; message: string; createdAt: string; user?: { firstName?: string | null; telegramId: string } }>>([]);
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [traffic, setTraffic] = useState<"logs" | "landings" | "domains">("logs");
  const [draft, setDraft] = useState({ slug: "", name: "", description: "Короткий экран", category: "Приложение", price: 0, theme: "aurora", layout: "app", previewHue: "#c8f54d", html: "", published: true, inShop: false, defaults: { title: "Заголовок", subtitle: "Описание", button: "Открыть", features: ["Пункт"] } });
  const [cloudflareToken, setCloudflareToken] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setError("");
    if (section === "overview") {
      const [summary, people, notes] = await Promise.all([
        api<NonNullable<typeof overview>>("/api/admin/overview"),
        api<{ items: UserRow[] }>("/api/admin/users"),
        api<{ items: typeof tickets }>("/api/admin/tickets"),
      ]);
      setOverview(summary);
      setUsers(people.items);
      setTickets(notes.items);
    }
    if (section === "traffic") {
      const [rows, pages, hosts] = await Promise.all([
        api<{ items: LogItem[] }>("/api/admin/logs"),
        api<{ items: typeof landings }>("/api/admin/landings"),
        api<{ items: typeof domains }>("/api/admin/domains"),
      ]);
      setLogs(rows.items);
      setLandings(pages.items);
      setDomains(hosts.items);
    }
    if (section === "templates") setTemplates((await api<{ items: typeof templates }>("/api/admin/templates")).items);
    if (section === "settings") setSettings(await api<Settings>("/api/admin/settings"));
  }

  useEffect(() => {
    load().catch((reason) => setError(reason instanceof Error ? reason.message : "Не загрузилось"));
  }, [section]);

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault();
    if (!settings) return;
    const data = await api<Settings>("/api/admin/settings", { method: "PUT", body: JSON.stringify({ ...settings, ...(cloudflareToken.trim() ? { cloudflareToken } : {}) }) });
    setCloudflareToken("");
    setSettings(data);
    setMessage("Сохранено. Новые лендинги получат адрес вида ldng1." + data.platformDomain);
  }

  const title = section === "traffic" ? "Трафик" : section === "templates" ? "Шаблоны" : section === "settings" ? "Настройки" : "Обзор";

  return (
    <section className="page">
      <p className="kicker">Админ</p>
      <h1>{title}</h1>
      {error && <p className="error">{error}</p>}
      {message && <p className="ok">{message}</p>}
      {section === "overview" && overview && (
        <div className="list">
          <article className="row-card"><b>Траферы</b><span className="chevron">{overview.users}</span></article>
          <article className="row-card"><b>Лендинги</b><span className="chevron">{overview.landings}</span></article>
          <article className="row-card"><b>Домены</b><span className="chevron">{overview.domains}</span></article>
          <article className="row-card"><b>Обращения</b><span className="chevron">{overview.tickets}</span></article>
          <article className="lime">
            <div>
              <span>Весь трафик</span>
              <b>{overview.analytics?.visits ?? 0}</b>
              <small>прямых {overview.analytics?.direct ?? 0} · кликов {overview.analytics?.clicks ?? 0} · {overview.analytics?.avgSeconds ?? 0} с</small>
            </div>
          </article>
          <div className="section-title">Люди <span>{users.length}</span></div>
          {users.map((item) => (
            <article key={item.id} className="row-card">
              <span className="grow">
                <b>{item.firstName || item.username || item.telegramId}</b>
                <span className="muted">{item.telegramId} · {roleName(item.role)} · ссылок {item.landings} · приглашений {item.referrals} · визитов {item.visits}</span>
              </span>
            </article>
          ))}
          <div className="section-title">Обращения</div>
          {tickets.map((item) => (
            <article key={item.id} className="log-row">
              <div><b>{item.user?.firstName || item.user?.telegramId}</b><div className="muted">{item.message}</div></div>
              <span className="muted">{when(item.createdAt)}</span>
            </article>
          ))}
          {tickets.length === 0 && <p className="muted">Обращений нет.</p>}
        </div>
      )}
      {section === "traffic" && (
        <div>
          <div className="admin-tabs">
            {(["logs", "landings", "domains"] as const).map((id) => (
              <button key={id} className={`tab${traffic === id ? " active" : ""}`} onClick={() => setTraffic(id)}>
                {id === "logs" ? "Логи" : id === "landings" ? "Лендинги" : "Домены"}
              </button>
            ))}
          </div>
          {traffic === "logs" && (
            <div className="list">
              {logs.map((item) => (
                <article key={item.id} className="log-row">
                  <div>
                    <b>{item.type}</b>
                    <div className="muted">{item.landing?.user?.firstName || item.landing?.user?.telegramId || "система"} · {item.landing?.name || "без лендинга"} {detail(item)}</div>
                  </div>
                  <span className="muted">{when(item.createdAt)}</span>
                </article>
              ))}
              {logs.length === 0 && <p className="muted">Событий пока нет.</p>}
            </div>
          )}
          {traffic === "landings" && (
            <div className="list">
              {landings.map((item) => (
                <article key={item.id} className="row-card">
                  <span className="grow">
                    <b>{item.name}</b>
                    <span className="muted">{item.subdomain || item.status}{item.customHost ? ` · ${item.customHost}` : ""} · {item.dnsStatus} · {item.user?.firstName || item.user?.telegramId}</span>
                  </span>
                </article>
              ))}
            </div>
          )}
          {traffic === "domains" && (
            <div className="list">
              {domains.map((item) => (
                <article key={item.id} className="row-card">
                  <span className="grow"><b>{item.hostname}</b><span className="muted">{item.status} · {item.user?.telegramId}</span></span>
                  {item.status !== "active" && (
                    <button className="ghost" onClick={async () => { await api(`/api/admin/domains/${item.id}/activate`, { method: "POST" }); setMessage("Домен активирован"); await load(); }}>Включить</button>
                  )}
                </article>
              ))}
              {domains.length === 0 && <p className="muted">Отдельных доменов нет. Свои хосты траферы привязывают к ссылке.</p>}
            </div>
          )}
        </div>
      )}
      {section === "templates" && (
        <div>
          <form onSubmit={async (event) => { event.preventDefault(); await api("/api/admin/templates", { method: "POST", body: JSON.stringify(draft) }); setMessage("Шаблон добавлен"); setDraft({ ...draft, slug: "", name: "", html: "" }); await load(); }}>
            <label className="field"><span>Slug</span><input value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: event.target.value })} required /></label>
            <label className="field"><span>Название</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label>
            <label className="field"><span>HTML шаблона</span><textarea value={draft.html} placeholder="<!doctype html>..." onChange={(event) => setDraft({ ...draft, html: event.target.value })} /></label>
            <button className="btn" type="submit">Добавить шаблон</button>
          </form>
          <div className="list" style={{ marginTop: 12 }}>
            {templates.map((item) => (
              <article key={item.id} className="row-card">
                <span className="grow"><b>{item.name}</b><span className="muted">{item.slug} · {item.published ? "опубликован" : "скрыт"}{item.html ? " · HTML" : ""}</span></span>
                <button className="ghost" onClick={async () => { await api(`/api/admin/templates/${item.id}`, { method: "DELETE" }); setMessage(item.published ? "Шаблон скрыт или удалён" : "Готово"); await load(); }}>{item.published ? "Скрыть" : "Удалить"}</button>
              </article>
            ))}
          </div>
        </div>
      )}
      {section === "settings" && settings && (
        <form onSubmit={saveSettings}>
          <label className="field"><span>Домен платформы</span><input value={settings.platformDomain} onChange={(event) => setSettings({ ...settings, platformDomain: event.target.value })} /></label>
          <label className="field"><span>GI-сервер, IP</span><input value={settings.platformIp} placeholder="203.0.113.10" onChange={(event) => setSettings({ ...settings, platformIp: event.target.value })} /></label>
          <label className="field"><span>GI-сервер, hostname для CNAME</span><input value={settings.originHost || ""} onChange={(event) => setSettings({ ...settings, originHost: event.target.value })} /></label>
          <label className="field"><span>NS 1</span><input value={settings.ns1} onChange={(event) => setSettings({ ...settings, ns1: event.target.value })} /></label>
          <label className="field"><span>NS 2</span><input value={settings.ns2} onChange={(event) => setSettings({ ...settings, ns2: event.target.value })} /></label>
          <label className="field"><span>Cloudflare zone id</span><input value={settings.cloudflareZoneId || ""} onChange={(event) => setSettings({ ...settings, cloudflareZoneId: event.target.value })} /></label>
          <label className="field"><span>Cloudflare token {settings.secrets?.cloudflareToken ? `(сейчас ${settings.secrets.cloudflareToken})` : ""}</span><input value={cloudflareToken} onChange={(event) => setCloudflareToken(event.target.value)} placeholder="Новый токен, пусто не стирает" /></label>
          <label className="field"><span>Поддержка</span><input value={settings.supportContact} onChange={(event) => setSettings({ ...settings, supportContact: event.target.value })} /></label>
          <button className="btn" type="submit">Сохранить</button>
        </form>
      )}
    </section>
  );
}
