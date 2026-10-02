import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type Landing } from "../api";

export function EditPage() {
  const { id } = useParams();
  const [landing, setLanding] = useState<Landing | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!id) return;
    api<{ landing: Landing }>(`/api/landings/${id}`).then((data) => setLanding(data.landing)).catch((reason) => setError(reason.message));
  }, [id]);

  if (!landing) return <section className="page">{error || "Загрузка…"}</section>;

  async function save(launch: boolean) {
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
      let next = data.landing;
      if (launch) next = (await api<{ landing: Landing }>(`/api/landings/${landing!.id}/launch`, { method: "POST" })).landing;
      setLanding(next);
      setMessage(launch ? "Запущен" : "Сохранено");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ошибка");
    }
  }

  return (
    <section className="page">
      <h1>{landing.name}</h1>
      <p className="lede"><a href={`/l/${landing.slug}`} target="_blank" rel="noreferrer">/l/{landing.slug}</a> · {landing.domain?.hostname || "без домена"} · {landing.status}</p>
      <label className="field"><span>Название</span><input value={landing.name} onChange={(event) => setLanding({ ...landing, name: event.target.value })} /></label>
      <label className="field"><span>Заголовок</span><input value={landing.title} onChange={(event) => setLanding({ ...landing, title: event.target.value })} /></label>
      <label className="field"><span>Подзаголовок</span><textarea value={landing.subtitle} onChange={(event) => setLanding({ ...landing, subtitle: event.target.value })} /></label>
      <label className="field"><span>Кнопка</span><input value={landing.buttonText} onChange={(event) => setLanding({ ...landing, buttonText: event.target.value })} /></label>
      <label className="field"><span>Ссылка на файл</span><input value={landing.downloadUrl || ""} onChange={(event) => setLanding({ ...landing, downloadUrl: event.target.value })} /></label>
      <label className="field"><span>Пункты</span><textarea value={landing.features.join("\n")} onChange={(event) => setLanding({ ...landing, features: event.target.value.split("\n") })} /></label>
      {error && <p className="error">{error}</p>}
      {message && <p className="ok">{message}</p>}
      <div className="row">
        <button className="ghost" onClick={() => save(false)}>Сохранить</button>
        <button className="btn" onClick={() => save(true)}>Запустить</button>
        {landing.status === "active" && <button className="ghost" onClick={() => api<{ landing: Landing }>(`/api/landings/${landing.id}/pause`, { method: "POST" }).then((data) => setLanding(data.landing))}>Пауза</button>}
        <Link to="/">К списку</Link>
      </div>
    </section>
  );
}
