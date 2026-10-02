import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Domain, type Template } from "../api";

export function CreatePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    templateId: "",
    domainId: "",
    title: "",
    subtitle: "",
    buttonText: "Скачать",
    downloadUrl: "",
    features: "",
  });

  useEffect(() => {
    api<{ items: Template[] }>("/api/templates?scope=usable&pageSize=20").then((data) => setTemplates(data.items)).catch((reason) => setError(reason.message));
    api<{ items: Domain[] }>("/api/domains").then((data) => setDomains(data.items)).catch(() => undefined);
  }, []);

  function pickTemplate(template: Template) {
    setForm({
      ...form,
      templateId: template.id,
      title: form.title || template.defaults.title,
      subtitle: form.subtitle || template.defaults.subtitle,
      buttonText: template.defaults.button || "Скачать",
      features: template.defaults.features.join("\n"),
    });
    setStep(2);
  }

  async function launch() {
    setError("");
    const domain = domains.find((item) => item.id === form.domainId);
    const launch = !domain || domain.status === "active";
    try {
      const data = await api<{ landing: { id: string } }>("/api/landings", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          templateId: form.templateId,
          domainId: form.domainId || null,
          title: form.title,
          subtitle: form.subtitle,
          buttonText: form.buttonText,
          downloadUrl: form.downloadUrl || null,
          features: form.features.split("\n").map((item) => item.trim()).filter(Boolean),
          launch,
        }),
      });
      if (!launch) {
        navigate(`/landings/${data.landing.id}`);
        return;
      }
      navigate(`/landings/${data.landing.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось создать");
    }
  }

  return (
    <section className="page">
      <h1>Создать ленд</h1>
      <p className="lede">Название, шаблон, домен и запуск.</p>
      <div className="steps">{[0, 1, 2, 3].map((item) => <b key={item} className={item <= step ? "on" : ""} />)}</div>
      {error && <p className="error">{error}</p>}
      {step === 0 && (
        <form onSubmit={(event) => { event.preventDefault(); setStep(1); }}>
          <label className="field"><span>Название внутри кабинета</span><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required minLength={2} /></label>
          <button className="btn" type="submit">Дальше</button>
        </form>
      )}
      {step === 1 && (
        <div className="grid">
          {templates.map((template) => (
            <button key={template.id} className="choice" onClick={() => pickTemplate(template)}>
              <i style={{ background: template.previewHue }} />
              <span><b>{template.name}</b><br /><span className="muted">{template.category}</span></span>
            </button>
          ))}
          {templates.length === 0 && <p className="muted">Нет доступных шаблонов. Купите экран в магазине.</p>}
        </div>
      )}
      {step === 2 && (
        <div className="grid">
          <button className="choice" onClick={() => { setForm({ ...form, domainId: "" }); setStep(3); }}>Без домена, на адресе платформы</button>
          {domains.map((domain) => (
            <button key={domain.id} className="choice" onClick={() => { setForm({ ...form, domainId: domain.id }); setStep(3); }}>
              <span>{domain.hostname}<br /><span className="muted">{domain.status === "active" ? "подключён" : "NS ещё не подтверждены, сохраним черновик"}</span></span>
            </button>
          ))}
        </div>
      )}
      {step === 3 && (
        <form onSubmit={(event) => { event.preventDefault(); void launch(); }}>
          <label className="field"><span>Заголовок</span><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} required /></label>
          <label className="field"><span>Подзаголовок</span><textarea value={form.subtitle} onChange={(event) => setForm({ ...form, subtitle: event.target.value })} required /></label>
          <label className="field"><span>Кнопка</span><input value={form.buttonText} onChange={(event) => setForm({ ...form, buttonText: event.target.value })} required /></label>
          <label className="field"><span>Ссылка на APK или файл</span><input value={form.downloadUrl} placeholder="https://" onChange={(event) => setForm({ ...form, downloadUrl: event.target.value })} /></label>
          <label className="field"><span>Пункты, каждый с новой строки</span><textarea value={form.features} onChange={(event) => setForm({ ...form, features: event.target.value })} /></label>
          <button className="btn" type="submit">Запустить</button>
        </form>
      )}
    </section>
  );
}
