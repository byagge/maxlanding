import { useEffect, useState } from "react";
import { api, money, type Template } from "../api";

export function ExamplesPage() {
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [items, setItems] = useState<Template[]>([]);

  useEffect(() => {
    api<{ items: Template[]; pages: number }>(`/api/templates?scope=examples&page=${page}&pageSize=3`).then((data) => {
      setItems(data.items);
      setPages(data.pages);
    }).catch(() => undefined);
  }, [page]);

  return (
    <section className="page">
      <h1>Примеры лендингов</h1>
      <p className="lede">Живые экраны шаблонов, по три на страницу.</p>
      <div className="grid">
        {items.map((item) => (
          <article key={item.id} className="shop-card">
            <div className="preview"><iframe title={item.name} src={`/t/${item.slug}`} /></div>
            <div className="row"><b>{item.name}</b><span className="badge">{item.price > 0 ? money(item.price) : "бесплатно"}</span></div>
            <p className="muted">{item.description}</p>
          </article>
        ))}
      </div>
      <div className="pager">
        <button className="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Назад</button>
        <span>{page} / {pages}</span>
        <button className="ghost" disabled={page >= pages} onClick={() => setPage(page + 1)}>Дальше</button>
      </div>
    </section>
  );
}
