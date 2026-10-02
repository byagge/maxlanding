import { useEffect, useState } from "react";
import { api, type Domain } from "../api";

type PublicSettings = { ns1: string; ns2: string; platformIp: string };

export function DomainsPage() {
  const [items, setItems] = useState<Domain[]>([]);
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [hostname, setHostname] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const [domains, config] = await Promise.all([
      api<{ items: Domain[] }>("/api/domains"),
      api<PublicSettings>("/api/settings/public"),
    ]);
    setItems(domains.items);
    setSettings(config);
  }

  useEffect(() => { load().catch((reason) => setError(reason.message)); }, []);

  async function add(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await api("/api/domains", { method: "POST", body: JSON.stringify({ hostname }) });
      setHostname("");
      setMessage("Домен добавлен. Пропишите NS у регистратора и нажмите проверку.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ошибка");
    }
  }

  async function verify(id: string) {
    setError("");
    const data = await api<{ domain: Domain }>(`/api/domains/${id}/verify`, { method: "POST" });
    setMessage(data.domain.lastError || "Домен подключён");
    await load();
  }

  return (
    <section className="page">
      <h1>Мои домены</h1>
      <p className="lede">Домен подключается внутри сервиса: у регистратора указываются наши NS, затем проверка читает DNS.</p>
      {settings && (
        <article className="stat">
          <span>NS-серверы</span>
          <b>{settings.ns1}</b>
          <b>{settings.ns2}</b>
          {settings.platformIp && <span>Либо A-запись на {settings.platformIp}</span>}
          <div className="row">
            <button className="ghost" onClick={() => navigator.clipboard.writeText(`${settings.ns1}\n${settings.ns2}`)}>Скопировать NS</button>
          </div>
        </article>
      )}
      <form onSubmit={add}>
        <label className="field"><span>Домен</span><input value={hostname} placeholder="landing.example.com" onChange={(event) => setHostname(event.target.value)} required /></label>
        <button className="btn" type="submit">Подключить</button>
      </form>
      {error && <p className="error">{error}</p>}
      {message && <p className="ok">{message}</p>}
      <div className="grid">
        {items.map((domain) => (
          <article key={domain.id} className="domain">
            <div className="row"><b>{domain.hostname}</b><span className={`badge ${domain.status === "active" ? "on" : "wait"}`}>{domain.status}</span></div>
            <p className="muted">{domain.ns1} · {domain.ns2}</p>
            {domain.lastError && <p>{domain.lastError}</p>}
            <div className="row">
              <button className="ghost" onClick={() => verify(domain.id)}>Проверить DNS</button>
              <button className="ghost" onClick={() => api(`/api/domains/${domain.id}`, { method: "DELETE" }).then(load)}>Удалить</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
