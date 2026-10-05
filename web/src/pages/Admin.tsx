import { useEffect, useState } from "react";
import { api, when } from "../api";

type Tab = "overview" | "users" | "templates" | "landings" | "tickets" | "settings";

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

export function AdminPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<{ users: number; landings: number; tickets: number; analytics?: { visits: number; direct: number; clicks: number; avgSeconds: number } } | null>(null);
  const [users, setUsers] = useState<Array<{ id: string; telegramId: string; username?: string | null; firstName?: string | null; role: string }>>([]);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; slug: string; published: boolean }>>([]);
  const [landings, setLandings] = useState<Array<{ id: string; name: string; status: string; subdomain?: string | null; user?: { telegramId: string } }>>([]);
  const [tickets, setTickets] = useState<Array<{ id: string; message: string; createdAt: string; user?: { firstName?: string | null; telegramId: string } }>>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState({ slug: "", name: "", description: "Короткий экран", category: "Приложение", price: 0, theme: "aurora", layout: "app", previewHue: "#c8f54d", html: "", published: true, inShop: false, defaults: { title: "Заголовок", subtitle: "Описание", button: "Открыть", features: ["Пункт"] } });
  const [cloudflareToken, setCloudflareToken] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load(next = tab) {
    setError("");
    if (next === "overview") setOverview(await api("/api/admin/overview"));
    if (next === "users") setUsers((await api<{ items: typeof users }>("/api/admin/users")).items);
    if (next === "templates") setTemplates((await api<{ items: typeof templates }>("/api/admin/templates")).items);
    if (next === "landings") setLandings((await api<{ items: typeof landings }>("/api/admin/landings")).items);
    if (next === "tickets") setTickets((await api<{ items: typeof tickets }>("/api/admin/tickets")).items);
    if (next === "settings") setSettings(await api<Settings>("/api/admin/settings"));
  }

  useEffect(() => { load().catch((reason) => setError(reason.message)); }, [tab]);

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault();
    if (!settings) return;
    const data = await api<Settings>("/api/admin/settings", { method: "PUT", body: JSON.stringify({ ...settings, ...(cloudflareToken.trim() ? { cloudflareToken } : {}) }) });
    setCloudflareToken("");
    setSettings(data);
    setMessage("Сохранено. Новые лендинги получат адрес вида ldng1." + data.platformDomain);
  }

  const tabs: Array<[Tab, string]> = [
    ["overview", "Обзор"],
    ["users", "Люди"],
    ["templates", "Шаблоны"],
    ["landings", "Лендинги"],
    ["tickets", "Тикеты"],
    ["settings", "Домен"],
  ];

  return (
    <section className="page">
      <p className="kicker">Админ</p>
      <h1>Панель</h1>
      <div className="admin-tabs">
        {tabs.map(([id, label]) => <button key={id} className={`tab${tab === id ? " active" : ""}`} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {error && <p className="error">{error}</p>}
      {message && <p className="ok">{message}</p>}
      {tab === "overview" && overview && (
        <div className="list">
          <article className="row-card"><b>Пользователи</b><span className="chevron">{overview.users}</span></article>
          <article className="row-card"><b>Лендинги</b><span className="chevron">{overview.landings}</span></article>
          <article className="row-card"><b>Обращения</b><span className="chevron">{overview.tickets}</span></article>
          <article className="row-card"><b>Весь трафик</b><span className="muted">{overview.analytics ? `${overview.analytics.visits} визитов · ${overview.analytics.direct} прямых · ${overview.analytics.clicks} кликов · ${overview.analytics.avgSeconds} с` : ""}</span></article>
        </div>
      )}
      {tab === "users" && (
        <div className="list">{users.map((item) => <article key={item.id} className="row-card"><span className="grow"><b>{item.firstName || item.username || item.telegramId}</b><span className="muted">{item.telegramId} · {item.role}</span></span></article>)}</div>
      )}
      {tab === "templates" && (
        <div>
          <form onSubmit={async (event) => { event.preventDefault(); await api("/api/admin/templates", { method: "POST", body: JSON.stringify(draft) }); setMessage("Шаблон добавлен"); await load("templates"); }}>
            <label className="field"><span>Slug</span><input value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: event.target.value })} required /></label>
            <label className="field"><span>Название</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label>
            <label className="field"><span>HTML шаблона</span><textarea value={draft.html} placeholder="<!doctype html>..." onChange={(event) => setDraft({ ...draft, html: event.target.value })} /></label>
            <button className="btn" type="submit">Добавить шаблон</button>
          </form>
          <div className="list" style={{ marginTop: 12 }}>{templates.map((item) => <article key={item.id} className="row-card"><span className="grow"><b>{item.name}</b><span className="muted">{item.slug}</span></span></article>)}</div>
        </div>
      )}
      {tab === "landings" && (
        <div className="list">{landings.map((item) => <article key={item.id} className="row-card"><span className="grow"><b>{item.name}</b><span className="muted">{item.subdomain || item.status} · {item.user?.telegramId}</span></span></article>)}</div>
      )}
      {tab === "tickets" && (
        <div className="list">{tickets.map((item) => <article key={item.id} className="log-row"><div><b>{item.user?.firstName || item.user?.telegramId}</b><div className="muted">{item.message}</div></div><span className="muted">{when(item.createdAt)}</span></article>)}</div>
      )}
      {tab === "settings" && settings && (
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
