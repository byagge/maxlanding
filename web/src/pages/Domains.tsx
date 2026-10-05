import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Landing } from "../api";

type PublicSettings = { ns1: string; ns2: string; platformIp: string; originHost: string; cloudflare: boolean; platformDomain: string };

export function DomainsPage() {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [items, setItems] = useState<Landing[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function load() {
    api<PublicSettings>("/api/settings/public").then(setSettings).catch(() => undefined);
    api<{ items: Landing[] }>("/api/landings").then((data) => setItems(data.items)).catch((reason) => setError(reason.message));
  }

  useEffect(() => { load(); }, []);

  async function sync(id: string) {
    setError("");
    const data = await api<{ landing: Landing }>(`/api/landings/${id}/dns`, { method: "POST" });
    setMessage(data.landing.dnsDetail || "DNS обновлён");
    load();
  }

  return (
    <section className="page">
      <p className="kicker">Домены</p>
      <h1>Адреса воркера</h1>
      <p className="lede">У каждой ссылки свой поддомен. Свой домен смотрит на GI-сервер: A-запись или NS. Если в панели есть токен Cloudflare, запись создаётся через API.</p>
      {settings && (
        <article className="lime">
          <div>
            <span>NS</span>
            <b className="url">{settings.ns1}</b>
            <small>{settings.ns2} · GI {settings.platformIp || settings.originHost || "не задан"} · Cloudflare {settings.cloudflare ? "включён" : "выключен"}</small>
          </div>
        </article>
      )}
      {error && <p className="error">{error}</p>}
      {message && <p className="ok">{message}</p>}
      <div className="list">
        {items.length === 0 && <p className="muted">Ссылок ещё нет.</p>}
        {items.map((item) => (
          <article key={item.id} className="row-card">
            <span className="grow">
              <b>{item.publicHost || item.name}</b>
              <span className="muted">{item.dnsStatus || "pending"} · {item.customHost || "без своего домена"}</span>
            </span>
            <button className="ghost" onClick={() => sync(item.id)}>DNS</button>
            <Link to={`/landings/${item.id}`}>Открыть</Link>
          </article>
        ))}
      </div>
    </section>
  );
}
