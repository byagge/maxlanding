import { useEffect, useState } from "react";
import { api, money, when, type User } from "../api";

type ProviderFlags = { cryptobot: boolean; xrocket: boolean; ton: boolean; trc20: boolean };
type Payment = { id: string; provider: string; amount: number; status: string; asset: string; payUrl?: string | null; address?: string | null; memo?: string | null; meta: string; createdAt: string };

const labels: Record<string, string> = { cryptobot: "CryptoBot", xrocket: "xRocket", ton: "TON", trc20: "USDT TRC20" };

export function ProfilePage({ user, onUser }: { user: User; onUser: (user: User) => void }) {
  const [providers, setProviders] = useState<ProviderFlags>({ cryptobot: false, xrocket: false, ton: false, trc20: false });
  const [minTopup, setMinTopup] = useState(5);
  const [amount, setAmount] = useState(10);
  const [items, setItems] = useState<Payment[]>([]);
  const [error, setError] = useState("");
  const [current, setCurrent] = useState<Payment | null>(null);
  const [detail, setDetail] = useState("");

  function loadPayments() {
    return api<{ items: Payment[] }>("/api/payments").then((data) => setItems(data.items));
  }

  useEffect(() => {
    api<{ providers: ProviderFlags; minTopup: number }>("/api/settings/public").then((data) => {
      setProviders(data.providers);
      setMinTopup(data.minTopup);
      setAmount(data.minTopup);
    }).catch(() => undefined);
    loadPayments().catch(() => undefined);
  }, []);

  async function pay(provider: string) {
    setError("");
    setDetail("");
    try {
      const data = await api<{ payment: Payment }>("/api/payments", { method: "POST", body: JSON.stringify({ provider, amount }) });
      setCurrent(data.payment);
      await loadPayments();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Счёт не создан");
    }
  }

  async function check(id: string) {
    const data = await api<{ payment: Payment; detail: string }>(`/api/payments/${id}/check`, { method: "POST" });
    setCurrent(data.payment);
    setDetail(data.detail);
    if (data.payment.status === "paid") {
      const me = await api<{ user: User }>("/api/me");
      onUser(me.user);
    }
    await loadPayments();
  }

  const meta = current ? JSON.parse(current.meta || "{}") as { display?: string; tonAmount?: number } : {};

  return (
    <section className="page">
      <h1>Профиль</h1>
      <article className="stat">
        <span>{user.firstName || "Пользователь"} · {user.telegramId}</span>
        <b>{money(user.balance)}</b>
      </article>
      <h2>Пополнение</h2>
      <p className="lede">CryptoBot, xRocket и ончейн. Токены провайдеров задаёт админ в панели, здесь их нет.</p>
      <label className="field"><span>Сумма, минимум {minTopup} USDT</span><input type="number" min={minTopup} value={amount} onChange={(event) => setAmount(Number(event.target.value))} /></label>
      <div className="row">
        {Object.entries(labels).map(([key, label]) => (
          <button key={key} className="ghost" disabled={!providers[key as keyof ProviderFlags]} onClick={() => pay(key)}>{label}{providers[key as keyof ProviderFlags] ? "" : " · нет"}</button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      {current && (
        <article className="stat">
          <b>{current.status}</b>
          {current.payUrl && <a href={current.payUrl}>Открыть счёт</a>}
          {current.address && <p>Адрес: {current.address}</p>}
          {(meta.display || meta.tonAmount) && <p>К оплате: {meta.display || meta.tonAmount} {current.asset}</p>}
          {current.memo && <p>Комментарий: {current.memo}</p>}
          <button className="btn" onClick={() => check(current.id)}>Проверить оплату</button>
          {detail && <p>{detail}</p>}
        </article>
      )}
      <div className="grid">
        {items.map((item) => (
          <article key={item.id} className="pay">
            <div><b>{labels[item.provider] || item.provider}</b><div className="muted">{when(item.createdAt)}</div></div>
            <div>{money(item.amount)} · {item.status}</div>
          </article>
        ))}
      </div>
    </section>
  );
}
