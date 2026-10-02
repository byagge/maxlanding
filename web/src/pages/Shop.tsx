import { useEffect, useState } from "react";
import { api, money, type Template } from "../api";

export function ShopPage({ onBalance }: { onBalance: (balance: number) => void }) {
  const [items, setItems] = useState<Template[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function load() {
    return api<{ items: Template[] }>("/api/templates?scope=shop&pageSize=20").then((data) => setItems(data.items));
  }
  useEffect(() => { load().catch((reason) => setError(reason.message)); }, []);

  async function buy(item: Template) {
    setError("");
    try {
      const result = await api<{ balance: number }>(`/api/templates/${item.id}/buy`, { method: "POST" });
      onBalance(result.balance);
      setMessage(`${item.name} теперь в ваших шаблонах`);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не купилось");
    }
  }

  return (
    <section className="page">
      <h1>Магазин лендов</h1>
      <p className="lede">Платные экраны списываются с баланса. После покупки шаблон появляется в создании лендинга.</p>
      {error && <p className="error">{error}</p>}
      {message && <p className="ok">{message}</p>}
      <div className="grid two">
        {items.map((item) => (
          <article key={item.id} className="shop-card">
            <div className="preview"><iframe title={item.name} src={`/t/${item.slug}`} /></div>
            <b>{item.name}</b>
            <p className="muted">{item.description}</p>
            <div className="row">
              <span>{money(item.price)}</span>
              {item.owned ? <span className="badge on">куплен</span> : <button className="btn" onClick={() => buy(item)}>Купить</button>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
