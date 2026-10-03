import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Template } from "../api";

export function CreatePage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    api<{ items: Template[] }>("/api/templates?scope=examples&pageSize=20").then((data) => {
      setTemplates(data.items);
      setTemplateId(data.items[0]?.id || "");
    }).catch((reason) => setError(reason.message));
  }, []);

  async function launch(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setPending(true);
    try {
      const data = await api<{ landing: { id: string } }>("/api/landings", {
        method: "POST",
        body: JSON.stringify({ name, templateId, launch: true }),
      });
      navigate(`/landings/${data.landing.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось создать");
      setPending(false);
    }
  }

  return (
    <section className="page">
      <p className="kicker">Новый лендинг</p>
      <h1>Шаблон и название</h1>
      <p className="lede">Страница запускается на поддомене платформы. Свой домен подключается позже одной A-записью.</p>
      <form onSubmit={launch}>
        <label className="field"><span>Название</span><input value={name} onChange={(event) => setName(event.target.value)} required minLength={2} placeholder="Кампания" /></label>
        <div className="list">
          {templates.map((template) => (
            <button key={template.id} type="button" className={`template${template.id === templateId ? " on" : ""}`} onClick={() => setTemplateId(template.id)}>
              <div className="swatch" style={{ background: template.previewHue }} />
              <b>{template.name}</b>
              <div className="muted">{template.category}</div>
            </button>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
        <button className="btn" type="submit" disabled={pending || !templateId}>{pending ? "Готовим…" : "Запустить"}</button>
      </form>
    </section>
  );
}
