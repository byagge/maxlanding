import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Landing, type Stats } from "../api";

const actions = [
  ["/create", "🔗", "Создать ленд"],
  ["/domains", "📁", "Мои домены"],
  ["/examples", "🏷", "Примеры лендингов"],
  ["/logs", "🔔", "Настройки логов"],
  ["/profile", "👤", "Профиль"],
  ["/shop", "🛒", "Магазин лендов"],
];

export function HomePage({ user }: { user: { role: string } }) {
  const [stats, setStats] = useState<Stats>({ visits: 0, downloads: 0, conversion: "0%" });
  const [landings, setLandings] = useState<Landing[]>([]);

  useEffect(() => {
    api<{ stats: Stats }>("/api/dashboard").then((data) => setStats(data.stats)).catch(() => undefined);
    api<{ items: Landing[] }>("/api/landings").then((data) => setLandings(data.items)).catch(() => undefined);
  }, []);

  return (
    <section className="page">
      <h1>Статистика по доменам</h1>
      <p className="lede">Переходов: {stats.visits} | Скачивание АПК: {stats.downloads} | Конверсия: {stats.conversion}</p>
      <div className="grid two">
        <article className="stat"><span>Переходы</span><b>{stats.visits}</b></article>
        <article className="stat"><span>Скачивания</span><b>{stats.downloads}</b></article>
        <article className="stat span-2"><span>Конверсия</span><b>{stats.conversion}</b></article>
      </div>
      <h2>Выберите действие</h2>
      <div className="grid actions">
        {actions.map(([to, icon, label]) => (
          <Link key={to} to={to} className={`choice${label === "Примеры лендингов" || label === "Магазин лендов" ? " wide" : ""}`}>
            <i>{icon}</i>{label}
          </Link>
        ))}
        {user.role === "admin" && <Link to="/admin" className="choice wide"><i>🎛</i>Панель управления</Link>}
        <Link to="/support" className="choice wide"><i>💬</i>Поддержка</Link>
      </div>
      <h2>Мои лендинги</h2>
      <div className="grid">
        {landings.length === 0 && <p className="muted">Пока пусто. Создайте первый экран.</p>}
        {landings.map((landing) => (
          <Link key={landing.id} to={`/landings/${landing.id}`} className="domain">
            <div className="row"><b>{landing.name}</b><span className={`badge ${landing.status === "active" ? "on" : "wait"}`}>{landing.status}</span></div>
            <div className="muted">{landing.domain?.hostname || `/l/${landing.slug}`} · {landing.visits || 0} / {landing.downloads || 0}</div>
          </Link>
        ))}
      </div>
    </section>
  );
}
