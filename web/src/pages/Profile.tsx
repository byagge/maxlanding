import type { User } from "../api";

export function ProfilePage({ user }: { user: User }) {
  return (
    <section className="page">
      <p className="kicker">Профиль</p>
      <h1>{user.firstName || "Аккаунт"}</h1>
      <article className="lime">
        <div>
          <span>Telegram</span>
          <b>{user.telegramId}</b>
          <small>{user.username ? `@${user.username}` : user.role === "admin" ? "Администратор" : "Личный кабинет"}</small>
        </div>
      </article>
      <div className="list">
        <article className="row-card"><span className="grow"><b>Роль</b><span className="muted">{user.role === "admin" ? "Администратор" : "Пользователь"}</span></span></article>
      </div>
    </section>
  );
}
