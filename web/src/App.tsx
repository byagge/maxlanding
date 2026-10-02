import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { api, money, type User } from "./api";
import { AdminPage } from "./pages/Admin";
import { CreatePage } from "./pages/Create";
import { DomainsPage } from "./pages/Domains";
import { EditPage } from "./pages/Edit";
import { ExamplesPage } from "./pages/Examples";
import { HomePage } from "./pages/Home";
import { LogsPage } from "./pages/Logs";
import { ProfilePage } from "./pages/Profile";
import { ShopPage } from "./pages/Shop";
import { SupportPage } from "./pages/Support";

const links = [
  ["/", "Главная"],
  ["/create", "Создать"],
  ["/domains", "Домены"],
  ["/examples", "Примеры"],
  ["/shop", "Магазин"],
  ["/logs", "Логи"],
  ["/profile", "Профиль"],
  ["/support", "Поддержка"],
];

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [devAuth, setDevAuth] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const screen = new URLSearchParams(location.search).get("screen") || window.Telegram?.WebApp?.initDataUnsafe?.start_param;
    if (screen) navigate(`/${screen === "admin" ? "admin" : screen}`, { replace: true });
    window.Telegram?.WebApp?.ready();
    window.Telegram?.WebApp?.expand();
    const initData = window.Telegram?.WebApp?.initData;
    const boot = initData
      ? api<{ token: string; user: User }>("/api/auth/telegram", { method: "POST", body: JSON.stringify({ initData }) })
      : localStorage.getItem("ml_token")
        ? api<{ user: User }>("/api/me").then((data) => ({ token: localStorage.getItem("ml_token") || "", user: data.user }))
        : null;
    api<{ devAuth: boolean }>("/api/health").then((health) => setDevAuth(health.devAuth)).catch(() => undefined);
    if (!boot) {
      setReady(true);
      return;
    }
    boot
      .then((data) => {
        localStorage.setItem("ml_token", data.token);
        setUser(data.user);
      })
      .catch(() => localStorage.removeItem("ml_token"))
      .finally(() => setReady(true));
  }, [navigate]);

  async function enter(role: "admin" | "user") {
    const data = await api<{ token: string; user: User }>("/api/auth/dev", { method: "POST", body: JSON.stringify({ role }) });
    localStorage.setItem("ml_token", data.token);
    setUser(data.user);
  }

  if (!ready) return <main className="gate"><p>Открываем MaxLanding…</p></main>;
  if (!user) {
    return (
      <main className="gate">
        <section className="card">
          <div className="brand"><span className="mark">M</span> MaxLanding</div>
          <h1>Студия лендингов</h1>
          <p className="lede">В Telegram приложение откроется само. Здесь можно войти в локальный контур.</p>
          {devAuth ? (
            <div className="row">
              <button className="btn" onClick={() => enter("admin")}>Войти как админ</button>
              <button className="ghost" onClick={() => enter("user")}>Войти как пользователь</button>
            </div>
          ) : <p>Откройте бота и нажмите кнопку мини-приложения.</p>}
        </section>
      </main>
    );
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><span className="mark">M</span> MaxLanding</div>
        <div className="balance">{money(user.balance)}</div>
      </header>
      <div className="layout">
        <aside className="nav">
          {links.map(([to, label]) => <NavLink key={to} to={to} end={to === "/"}>{label}</NavLink>)}
          {user.role === "admin" && <NavLink to="/admin">Панель</NavLink>}
        </aside>
        <main>
          <Routes>
            <Route path="/" element={<HomePage user={user} />} />
            <Route path="/create" element={<CreatePage />} />
            <Route path="/domains" element={<DomainsPage />} />
            <Route path="/examples" element={<ExamplesPage />} />
            <Route path="/shop" element={<ShopPage onBalance={(balance) => setUser({ ...user, balance })} />} />
            <Route path="/logs" element={<LogsPage user={user} onUser={setUser} />} />
            <Route path="/profile" element={<ProfilePage user={user} onUser={setUser} />} />
            <Route path="/support" element={<SupportPage />} />
            <Route path="/admin" element={user.role === "admin" ? <AdminPage /> : <Navigate to="/" replace />} />
            <Route path="/landings/:id" element={<EditPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      <nav className="dock">
        <NavLink to="/" end>Главная</NavLink>
        <NavLink to="/create">Ленд</NavLink>
        <NavLink to="/domains">Домены</NavLink>
        <NavLink to="/shop">Магазин</NavLink>
        <NavLink to="/profile">Профиль</NavLink>
      </nav>
    </div>
  );
}
