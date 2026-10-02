import { useEffect, useState } from "react";
import { api, money, when } from "../api";

type Tab = "overview" | "users" | "payments" | "templates" | "domains" | "landings" | "tickets" | "settings";

type Settings = {
  ns1: string;
  ns2: string;
  platformIp: string;
  supportContact: string;
  minTopup: number;
  cryptobotTestnet: boolean;
  secrets: Record<string, string>;
  wallets: { ton: string; trc20: string };
};

const emptyTemplate = {
  slug: "",
  name: "",
  description: "",
  category: "Приложение",
  price: 0,
  theme: "aurora",
  layout: "app",
  previewHue: "#d6ff4a",
  published: true,
  inShop: false,
  defaults: { title: "Заголовок", subtitle: "Короткое описание", button: "Скачать", features: ["Пункт"] },
};

export function AdminPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [overview, setOverview] = useState<{ users: number; domains: number; landings: number; payments: number; tickets: number; volume: number } | null>(null);
  const [users, setUsers] = useState<Array<{ id: string; telegramId: string; username?: string | null; firstName?: string | null; balance: number; role: string }>>([]);
  const [payments, setPayments] = useState<Array<{ id: string; provider: string; amount: number; status: string; user?: { username?: string | null; telegramId: string } }>>([]);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; slug: string; price: number; published: boolean; inShop: boolean }>>([]);
  const [domains, setDomains] = useState<Array<{ id: string; hostname: string; status: string; user?: { username?: string | null; telegramId: string } }>>([]);
  const [landings, setLandings] = useState<Array<{ id: string; name: string; status: string; slug: string; user?: { telegramId: string } }>>([]);
  const [tickets, setTickets] = useState<Array<{ id: string; message: string; createdAt: string; user?: { firstName?: string | null; telegramId: string } }>>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [secrets, setSecrets] = useState({ cryptobotToken: "", xrocketToken: "", xrocketWebhookSecret: "", tonApiKey: "", tronApiKey: "" });
  const [draft, setDraft] = useState(emptyTemplate);
  const [features, setFeatures] = useState("Пункт");
  const [query, setQuery] = useState("");
  const [credit, setCredit] = useState({ id: "", amount: 10, reason: "ручное пополнение" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load(next = tab) {
    setError("");
    if (next === "overview") setOverview(await api("/api/admin/overview"));
    if (next === "users") setUsers((await api<{ items: typeof users }>(`/api/admin/users?q=${encodeURIComponent(query)}`)).items);
    if (next === "payments") setPayments((await api<{ items: typeof payments }>("/api/admin/payments")).items);
    if (next === "templates") setTemplates((await api<{ items: typeof templates }>("/api/admin/templates")).items);
    if (next === "domains") setDomains((await api<{ items: typeof domains }>("/api/admin/domains")).items);
    if (next === "landings") setLandings((await api<{ items: typeof landings }>("/api/admin/landings")).items);
    if (next === "tickets") setTickets((await api<{ items: typeof tickets }>("/api/admin/tickets")).items);
    if (next === "settings") {
      const data = await api<Settings>("/api/admin/settings");
      setSettings(data);
    }
  }

  useEffect(() => { load().catch((reason) => setError(reason.message)); }, [tab]);

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault();
    if (!settings) return;
    const body = {
      ns1: settings.ns1,
      ns2: settings.ns2,
      platformIp: settings.platformIp,
      supportContact: settings.supportContact,
      minTopup: Number(settings.minTopup),
      cryptobotTestnet: settings.cryptobotTestnet,
      tonWallet: settings.wallets.ton,
      tronWallet: settings.wallets.trc20,
      ...Object.fromEntries(Object.entries(secrets).filter(([, value]) => value.trim())),
    };
    const data = await api<Settings>("/api/admin/settings", { method: "PUT", body: JSON.stringify(body) });
    setSettings(data);
    setSecrets({ cryptobotToken: "", xrocketToken: "", xrocketWebhookSecret: "", tonApiKey: "", tronApiKey: "" });
    setMessage("Настройки сохранены. Токены зашифрованы и наружу не отдаются.");
  }

  async function createTemplate(event: React.FormEvent) {
    event.preventDefault();
    await api("/api/admin/templates", {
      method: "POST",
      body: JSON.stringify({ ...draft, defaults: { ...draft.defaults, features: features.split("\n").map((item) => item.trim()).filter(Boolean) } }),
    });
    setMessage("Шаблон добавлен");
    await load("templates");
  }

  const tabs: Array<[Tab, string]> = [
    ["overview", "Обзор"],
    ["users", "Пользователи"],
    ["payments", "Платежи"],
    ["templates", "Шаблоны"],
    ["domains", "Домены"],
    ["landings", "Лендинги"],
    ["tickets", "Тикеты"],
    ["settings", "Настройки"],
  ];

  return (
    <section className="page">
      <h1>Панель управления</h1>
      <div className="admin-tabs">{tabs.map(([id, label]) => <button key={id} className={`tab${tab === id ? " active" : ""}`} onClick={() => setTab(id)}>{label}</button>)}</div>
      {error && <p className="error">{error}</p>}
      {message && <p className="ok">{message}</p>}
      {tab === "overview" && overview && (
        <div className="grid two">
          <article className="stat"><span>Пользователи</span><b>{overview.users}</b></article>
          <article className="stat"><span>Домены</span><b>{overview.domains}</b></article>
          <article className="stat"><span>Лендинги</span><b>{overview.landings}</b></article>
          <article className="stat"><span>Оплаченные счета</span><b>{overview.payments}</b></article>
          <article className="stat span-2"><span>Оборот</span><b>{money(overview.volume)}</b></article>
        </div>
      )}
      {tab === "users" && (
        <div>
          <form className="row" onSubmit={(event) => { event.preventDefault(); load("users").catch((reason) => setError(reason.message)); }}>
            <input value={query} placeholder="telegram id или имя" onChange={(event) => setQuery(event.target.value)} />
            <button className="ghost">Найти</button>
          </form>
          <table>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.firstName} @{user.username || "—"}<div className="muted">{user.telegramId} · {user.role}</div></td>
                  <td>{money(user.balance)}</td>
                  <td><button className="ghost" onClick={() => setCredit({ ...credit, id: user.id })}>Баланс</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {credit.id && (
            <form className="stat" onSubmit={async (event) => {
              event.preventDefault();
              await api(`/api/admin/users/${credit.id}/balance`, { method: "POST", body: JSON.stringify({ amount: Number(credit.amount), reason: credit.reason }) });
              setMessage("Баланс изменён");
              await load("users");
            }}>
              <label className="field"><span>Сумма, можно отрицательную</span><input type="number" value={credit.amount} onChange={(event) => setCredit({ ...credit, amount: Number(event.target.value) })} /></label>
              <label className="field"><span>Причина</span><input value={credit.reason} onChange={(event) => setCredit({ ...credit, reason: event.target.value })} /></label>
              <button className="btn">Применить</button>
            </form>
          )}
        </div>
      )}
      {tab === "payments" && (
        <table>
          <tbody>
            {payments.map((item) => (
              <tr key={item.id}>
                <td>{item.provider}<div className="muted">{item.user?.username || item.user?.telegramId}</div></td>
                <td>{money(item.amount)} · {item.status}</td>
                <td>{item.status === "pending" && <button className="ghost" onClick={() => api(`/api/admin/payments/${item.id}/confirm`, { method: "POST", body: JSON.stringify({}) }).then(() => load("payments"))}>Зачислить</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {tab === "templates" && (
        <div className="grid">
          {templates.map((item) => <article key={item.id} className="domain"><b>{item.name}</b><div className="muted">{item.slug} · {money(item.price)} · {item.inShop ? "в магазине" : "не в магазине"} · {item.published ? "опубликован" : "скрыт"}</div></article>)}
          <form className="stat" onSubmit={createTemplate}>
            <h3>Новый шаблон</h3>
            <label className="field"><span>Slug</span><input value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: event.target.value })} required /></label>
            <label className="field"><span>Название</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label>
            <label className="field"><span>Описание</span><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} required /></label>
            <div className="grid two">
              <label className="field"><span>Цена</span><input type="number" value={draft.price} onChange={(event) => setDraft({ ...draft, price: Number(event.target.value) })} /></label>
              <label className="field"><span>Категория</span><input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} /></label>
              <label className="field"><span>Тема</span><select value={draft.theme} onChange={(event) => setDraft({ ...draft, theme: event.target.value })}>{["aurora", "pulse", "linen", "noir", "harbor", "ember"].map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="field"><span>Макет</span><select value={draft.layout} onChange={(event) => setDraft({ ...draft, layout: event.target.value })}>{["app", "saas", "course", "product", "portfolio", "local"].map((item) => <option key={item}>{item}</option>)}</select></label>
            </div>
            <label className="field"><span>Заголовок</span><input value={draft.defaults.title} onChange={(event) => setDraft({ ...draft, defaults: { ...draft.defaults, title: event.target.value } })} /></label>
            <label className="field"><span>Подзаголовок</span><input value={draft.defaults.subtitle} onChange={(event) => setDraft({ ...draft, defaults: { ...draft.defaults, subtitle: event.target.value } })} /></label>
            <label className="field"><span>Пункты</span><textarea value={features} onChange={(event) => setFeatures(event.target.value)} /></label>
            <label className="row"><input type="checkbox" checked={draft.inShop} onChange={(event) => setDraft({ ...draft, inShop: event.target.checked })} /> В магазин</label>
            <button className="btn">Сохранить шаблон</button>
          </form>
        </div>
      )}
      {tab === "domains" && domains.map((domain) => (
        <article key={domain.id} className="domain">
          <div className="row"><b>{domain.hostname}</b><span className="badge">{domain.status}</span></div>
          <div className="muted">{domain.user?.username || domain.user?.telegramId}</div>
          {domain.status !== "active" && <button className="ghost" onClick={() => api(`/api/admin/domains/${domain.id}/activate`, { method: "POST" }).then(() => load("domains"))}>Подтвердить вручную</button>}
        </article>
      ))}
      {tab === "landings" && (
        <table><tbody>{landings.map((item) => <tr key={item.id}><td>{item.name}<div className="muted">/l/{item.slug}</div></td><td>{item.status}</td><td>{item.user?.telegramId}</td></tr>)}</tbody></table>
      )}
      {tab === "tickets" && tickets.map((ticket) => (
        <article key={ticket.id} className="domain"><b>{ticket.user?.firstName || ticket.user?.telegramId}</b><p>{ticket.message}</p><span className="muted">{when(ticket.createdAt)}</span></article>
      ))}
      {tab === "settings" && settings && (
        <form onSubmit={saveSettings}>
          <label className="field"><span>NS1</span><input value={settings.ns1} onChange={(event) => setSettings({ ...settings, ns1: event.target.value })} /></label>
          <label className="field"><span>NS2</span><input value={settings.ns2} onChange={(event) => setSettings({ ...settings, ns2: event.target.value })} /></label>
          <label className="field"><span>IP платформы для A-записи</span><input value={settings.platformIp} onChange={(event) => setSettings({ ...settings, platformIp: event.target.value })} /></label>
          <label className="field"><span>Контакт поддержки</span><input value={settings.supportContact} onChange={(event) => setSettings({ ...settings, supportContact: event.target.value })} /></label>
          <label className="field"><span>Минимальное пополнение</span><input type="number" value={settings.minTopup} onChange={(event) => setSettings({ ...settings, minTopup: Number(event.target.value) })} /></label>
          <label className="row"><input type="checkbox" checked={settings.cryptobotTestnet} onChange={(event) => setSettings({ ...settings, cryptobotTestnet: event.target.checked })} /> CryptoBot testnet</label>
          <label className="field"><span>CryptoBot token {settings.secrets.cryptobotToken && `(${settings.secrets.cryptobotToken})`}</span><input value={secrets.cryptobotToken} onChange={(event) => setSecrets({ ...secrets, cryptobotToken: event.target.value })} placeholder="новый токен, пусто = не менять" /></label>
          <label className="field"><span>xRocket token {settings.secrets.xrocketToken && `(${settings.secrets.xrocketToken})`}</span><input value={secrets.xrocketToken} onChange={(event) => setSecrets({ ...secrets, xrocketToken: event.target.value })} /></label>
          <label className="field"><span>xRocket webhook secret {settings.secrets.xrocketWebhookSecret && `(${settings.secrets.xrocketWebhookSecret})`}</span><input value={secrets.xrocketWebhookSecret} onChange={(event) => setSecrets({ ...secrets, xrocketWebhookSecret: event.target.value })} /></label>
          <label className="field"><span>Кошелёк TON</span><input value={settings.wallets.ton} onChange={(event) => setSettings({ ...settings, wallets: { ...settings.wallets, ton: event.target.value } })} /></label>
          <label className="field"><span>TON API key {settings.secrets.tonApiKey && `(${settings.secrets.tonApiKey})`}</span><input value={secrets.tonApiKey} onChange={(event) => setSecrets({ ...secrets, tonApiKey: event.target.value })} /></label>
          <label className="field"><span>Кошелёк USDT TRC20</span><input value={settings.wallets.trc20} onChange={(event) => setSettings({ ...settings, wallets: { ...settings.wallets, trc20: event.target.value } })} /></label>
          <label className="field"><span>TronGrid API key {settings.secrets.tronApiKey && `(${settings.secrets.tronApiKey})`}</span><input value={secrets.tronApiKey} onChange={(event) => setSecrets({ ...secrets, tronApiKey: event.target.value })} /></label>
          <button className="btn">Сохранить</button>
        </form>
      )}
    </section>
  );
}
