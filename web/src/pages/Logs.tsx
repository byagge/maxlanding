import { useEffect, useState } from "react";
import { api, when, type User } from "../api";

type LogItem = { id: string; type: string; createdAt: string; meta?: string; ipHash?: string | null; userAgent?: string | null; referrer?: string | null; landing?: { name: string } | null };

function detail(item: LogItem): string {
  try {
    const meta = JSON.parse(item.meta || "{}") as { source?: string; element?: string; duration?: number };
    return [meta.source, meta.element, typeof meta.duration === "number" ? `${meta.duration} с` : ""].filter(Boolean).join(" · ");
  } catch {
    return "";
  }
}

export function LogsPage({ user, onUser }: { user: User; onUser: (user: User) => void }) {
  const [items, setItems] = useState<LogItem[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [flags, setFlags] = useState({ logIp: user.logIp, logUa: user.logUa, logReferrer: user.logReferrer });

  useEffect(() => {
    api<{ items: LogItem[]; pages: number }>(`/api/logs?page=${page}`).then((data) => {
      setItems(data.items);
      setPages(data.pages);
    }).catch(() => undefined);
  }, [page]);

  async function save(next: typeof flags) {
    setFlags(next);
    const data = await api<{ user: User }>("/api/me/logs", { method: "PATCH", body: JSON.stringify(next) });
    onUser(data.user);
  }

  return (
    <section className="page">
      <h1>Логи трафика</h1>
      <div className="notice">Пишутся источник, прямой заход, время на странице, клики по элементам и срабатывание пикселя. Содержимое полей форм не сохраняется.</div>
      <div className="row">
        <button className={flags.logIp ? "btn" : "ghost"} onClick={() => save({ ...flags, logIp: !flags.logIp })}>IP-хеш {flags.logIp ? "вкл" : "выкл"}</button>
        <button className={flags.logUa ? "btn" : "ghost"} onClick={() => save({ ...flags, logUa: !flags.logUa })}>User-Agent {flags.logUa ? "вкл" : "выкл"}</button>
        <button className={flags.logReferrer ? "btn" : "ghost"} onClick={() => save({ ...flags, logReferrer: !flags.logReferrer })}>Referrer {flags.logReferrer ? "вкл" : "выкл"}</button>
      </div>
      <div className="grid" style={{ marginTop: 14 }}>
        {items.map((item) => (
          <article key={item.id} className="log-row">
            <div><b>{item.type}</b><div className="muted">{item.landing?.name || "система"} {detail(item)}</div></div>
            <span className="muted">{when(item.createdAt)}</span>
          </article>
        ))}
        {items.length === 0 && <p className="muted">Событий пока нет.</p>}
      </div>
      <div className="pager">
        <button className="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Назад</button>
        <span>{page} / {pages}</span>
        <button className="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>Дальше</button>
      </div>
    </section>
  );
}
