import { useEffect, useState } from "react";
import { api, when } from "../api";

type Ticket = { id: string; message: string; createdAt: string };

export function SupportPage() {
  const [contact, setContact] = useState("");
  const [message, setMessage] = useState("");
  const [items, setItems] = useState<Ticket[]>([]);
  const [error, setError] = useState("");

  function load() {
    return api<{ contact: string; tickets: Ticket[] }>("/api/support").then((data) => {
      setContact(data.contact);
      setItems(data.tickets);
    });
  }
  useEffect(() => { load().catch((reason) => setError(reason.message)); }, []);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    await api("/api/support", { method: "POST", body: JSON.stringify({ message }) });
    setMessage("");
    await load();
  }

  return (
    <section className="page">
      <h1>Поддержка</h1>
      <p className="lede">Контакт: {contact || "ещё не задан"}</p>
      <form onSubmit={send}>
        <label className="field"><span>Сообщение</span><textarea value={message} onChange={(event) => setMessage(event.target.value)} required minLength={4} /></label>
        <button className="btn">Отправить</button>
      </form>
      {error && <p className="error">{error}</p>}
      <div className="grid">
        {items.map((item) => <article key={item.id} className="domain"><p>{item.message}</p><span className="muted">{when(item.createdAt)}</span></article>)}
      </div>
    </section>
  );
}
