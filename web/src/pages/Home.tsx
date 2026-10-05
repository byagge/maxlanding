import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Landing, type Stats } from "../api";

const actions = [
  ["/create", "Создать ссылку", "Шаблон и уникальный адрес"],
  ["/domains", "Домены", "NS, A-запись и Cloudflare"],
  ["/examples", "Примеры лендингов", "Живые экраны шаблонов"],
  ["/invite", "Пригласить", "Тот же кабинет, свои ссылки и статистика"],
  ["/logs", "Логи", "Источник, время и клики"],
  ["/support", "Поддержка", "Написать в сервис"],
];

export function HomePage() {
  const [stats, setStats] = useState<Stats>({ visits: 0, downloads: 0, conversion: "0%" });
  const [landings, setLandings] = useState<Landing[]>([]);

  useEffect(() => {
    api<{ stats: Stats }>("/api/dashboard").then((data) => setStats(data.stats)).catch(() => undefined);
    api<{ items: Landing[] }>("/api/landings").then((data) => setLandings(data.items)).catch(() => undefined);
  }, []);

  return (
    <section className="page">
      <p className="kicker">Статистика</p>
      <div className="hero-num">{stats.visits}</div>
      <p className="lede" style={{ marginTop: -8 }}>Переходов · прямых {stats.direct ?? 0} · кликов {stats.clicks ?? 0}</p>
      <article className="lime">
        <div>
          <span>Среднее время</span>
          <b>{stats.avgSeconds ?? 0} с</b>
          <small>Конверсия клика {stats.conversion}</small>
        </div>
        <Link to="/create" className="pill">Ссылка</Link>
      </article>
      <div className="section-title">Разделы</div>
      <div className="list">
        {actions.map(([to, title, hint]) => (
          <Link key={to} to={to} className="row-card">
            <span className="glyph">{title.slice(0, 1)}</span>
            <span className="grow"><b>{title}</b><span className="muted">{hint}</span></span>
            <span className="chevron">›</span>
          </Link>
        ))}
      </div>
      <div className="section-title">Мои лендинги <span>{landings.length}</span></div>
      <div className="list">
        {landings.length === 0 && <p className="muted">Пока пусто. Создайте первый экран.</p>}
        {landings.map((landing) => (
          <Link key={landing.id} to={`/landings/${landing.id}`} className="row-card">
            <span className="grow">
              <b>{landing.name}</b>
              <span className="muted">{landing.publicHost || `/l/${landing.slug}`}</span>
            </span>
            <span className={`badge ${landing.status === "active" ? "on" : "wait"}`}>{landing.status === "preparing" ? "готовится" : landing.status === "active" ? "активен" : landing.status}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
