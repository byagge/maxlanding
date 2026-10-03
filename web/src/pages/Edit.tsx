import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type Landing } from "../api";

export function EditPage() {
  const { id } = useParams();
  const [landing, setLanding] = useState<Landing | null>(null);
  const [hostname, setHostname] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!id) return;
    let stop = false;
    async function load() {
      try {
        const data = await api<{ landing: Landing }>(`/api/landings/${id}`);
        if (stop) return;
        setLanding(data.landing);
        setHostname(data.landing.customHost || "");
        if (data.landing.status === "preparing") setTimeout(load, 700);
      } catch (reason) {
        if (!stop) setError(reason instanceof Error ? reason.message : "Ошибка");
      }
    }
    void load();
    return () => { stop = true; };
  }, [id]);

  if (!landing) return <section className="page">{error || "Загрузка…"}</section>;

  async function save() {
    setError("");
    try {
      const data = await api<{ landing: Landing }>(`/api/landings/${landing!.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: landing!.name,
          title: landing!.title,
          subtitle: landing!.subtitle,
          buttonText: landing!.buttonText,
          downloadUrl: landing!.downloadUrl || null,
          features: landing!.features,
        }),
      });
      setLanding(data.landing);
      setMessage("Сохранено");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ошибка");
    }
  }

  async function connect(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const data = await api<{ landing: Landing; message: string }>(`/api/landings/${landing!.id}/domain`, {
      method: "POST",
      body: JSON.stringify({ hostname }),
    });
    setLanding(data.landing);
    setMessage(data.message);
  }

  const status = landing.status === "preparing" ? "Готовим поддомен" : landing.status === "active" ? "Запущен" : landing.status;

  return (
    <section className="page">
      <p className="kicker">{status}</p>
      <h1>{landing.name}</h1>
      <article className="lime">
        <div>
          <span>Адрес</span>
          <b className="url">{landing.publicHost || "поддомен"}</b>
          <small>{landing.publicUrl}</small>
        </div>
      </article>
      <p className="lede">{landing.instruction}</p>
      {landing.publicUrl && <p><a href={`/l/${landing.slug}`}>Открыть локальную копию</a></p>}
      <form onSubmit={connect}>
        <label className="field"><span>Свой домен</span><input value={hostname} placeholder="landing.example.com" onChange={(event) => setHostname(event.target.value)} /></label>
        <button className="btn" type="submit">Проверить A-запись</button>
      </form>
      {landing.customHost && <p className="muted">{landing.customHost} · {landing.customStatus === "active" ? "подключён" : "ждём A-запись"}</p>}
      <div className="section-title">Текст страницы</div>
      <label className="field"><span>Название</span><input value={landing.name} onChange={(event) => setLanding({ ...landing, name: event.target.value })} /></label>
      <label className="field"><span>Заголовок</span><input value={landing.title} onChange={(event) => setLanding({ ...landing, title: event.target.value })} /></label>
      <label className="field"><span>Подзаголовок</span><textarea value={landing.subtitle} onChange={(event) => setLanding({ ...landing, subtitle: event.target.value })} /></label>
      <label className="field"><span>Кнопка</span><input value={landing.buttonText} onChange={(event) => setLanding({ ...landing, buttonText: event.target.value })} /></label>
      <label className="field"><span>Ссылка на файл</span><input value={landing.downloadUrl || ""} placeholder="https://" onChange={(event) => setLanding({ ...landing, downloadUrl: event.target.value })} /></label>
      <label className="field"><span>Пункты</span><textarea value={landing.features.join("\n")} onChange={(event) => setLanding({ ...landing, features: event.target.value.split("\n") })} /></label>
      {error && <p className="error">{error}</p>}
      {message && <p className="ok">{message}</p>}
      <div className="row">
        <button className="btn" onClick={() => save()}>Сохранить</button>
        {landing.status === "active" && <button className="ghost" onClick={() => api<{ landing: Landing }>(`/api/landings/${landing.id}/pause`, { method: "POST" }).then((data) => setLanding(data.landing))}>Пауза</button>}
        <Link to="/">К списку</Link>
      </div>
    </section>
  );
}
