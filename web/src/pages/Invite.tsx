import { useEffect, useState } from "react";
import { api, when } from "../api";

type Referral = {
  code: string;
  inviteUrl: string;
  items: Array<{ id: string; telegramId: string; username?: string | null; firstName?: string | null; role: string; createdAt: string }>;
};

export function InvitePage() {
  const [data, setData] = useState<Referral | null>(null);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const link = data?.inviteUrl || (data ? `/start ref_${data.code}` : "");

  useEffect(() => {
    api<Referral>("/api/referrals").then(setData).catch((reason) => setError(reason.message));
  }, []);

  async function apply(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const result = await api<{ message: string }>("/api/referrals/apply", { method: "POST", body: JSON.stringify({ code }) });
      setMessage(result.message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Код не принят");
    }
  }

  return (
    <section className="page">
      <p className="kicker">Рефералы</p>
      <h1>Пригласить</h1>
      <article className="lime stack">
        <div>
          <span>Ссылка приглашения</span>
          <b className="link">{link || "…"}</b>
          <small>Код {data?.code || "…"}</small>
        </div>
        <button type="button" className="pill" onClick={() => { if (link) navigator.clipboard?.writeText(link).then(() => setMessage("Ссылка скопирована")).catch(() => setMessage(link)); }}>Копировать</button>
      </article>
      <p className="lede">Приглашённый получает тот же кабинет: свои ссылки, домены, логи и своё приглашение. Отдельной урезанной роли нет. Статистика потоков остаётся у каждого своя и видна админу.</p>
      <form onSubmit={apply}>
        <label className="field"><span>Ввести чужой код</span><input value={code} onChange={(event) => setCode(event.target.value)} placeholder="ref_код" /></label>
        <button className="btn" type="submit">Принять</button>
      </form>
      {error && <p className="error">{error}</p>}
      {message && <p className="ok">{message}</p>}
      <div className="section-title">Приглашённые <span>{data?.items.length ?? 0}</span></div>
      <div className="list">
        {data?.items.map((item) => (
          <article key={item.id} className="row-card">
            <span className="grow"><b>{item.firstName || item.username || item.telegramId}</b><span className="muted">{item.telegramId} · {item.role === "admin" ? "админ" : "трафер"}</span></span>
            <span className="muted">{when(item.createdAt)}</span>
          </article>
        ))}
        {data && data.items.length === 0 && <p className="muted">Пока никого.</p>}
      </div>
    </section>
  );
}
