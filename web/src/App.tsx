import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { api, type User } from "./api";
import { AdminPage } from "./pages/Admin";
import { CreatePage } from "./pages/Create";
import { EditPage } from "./pages/Edit";
import { ExamplesPage } from "./pages/Examples";
import { DomainsPage } from "./pages/Domains";
import { HomePage } from "./pages/Home";
import { InvitePage } from "./pages/Invite";
import { LogsPage } from "./pages/Logs";
import { ProfilePage } from "./pages/Profile";
import { SupportPage } from "./pages/Support";

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [devAuth, setDevAuth] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const screen = new URLSearchParams(location.search).get("screen") || window.Telegram?.WebApp?.initDataUnsafe?.start_param;
    const startParam = window.Telegram?.WebApp?.initDataUnsafe?.start_param || "";
    if (startParam.startsWith("ref_")) sessionStorage.setItem("ml_ref", startParam.slice(4));
    if (screen) navigate(`/${screen === "admin" ? "admin" : screen}`, { replace: true });
    window.Telegram?.WebApp?.ready();
    window.Telegram?.WebApp?.expand();
    window.Telegram?.WebApp?.setHeaderColor?.("#f6f7f9");
    window.Telegram?.WebApp?.setBackgroundColor?.("#f6f7f9");
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
        const ref = sessionStorage.getItem("ml_ref");
        if (ref) {
          sessionStorage.removeItem("ml_ref");
          api("/api/referrals/apply", { method: "POST", body: JSON.stringify({ code: ref }) }).catch(() => undefined);
        }
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
          <p className="kicker">MaxLanding</p>
          <h1>Личный кабинет</h1>
          <p className="lede">В Telegram приложение откроется из бота. Здесь можно войти в локальный контур.</p>
          {devAuth ? (
            <div className="list">
              <button className="btn" onClick={() => enter("admin")}>Войти как админ</button>
              <button className="ghost" onClick={() => enter("user")}>Войти как пользователь</button>
            </div>
          ) : <p>Откройте бота и нажмите кнопку мини-приложения.</p>}
        </section>
      </main>
    );
  }

  const letter = (user.firstName || "M").slice(0, 1).toUpperCase();
  const adminMode = location.pathname.startsWith("/admin");

  return (
    <div className="phone">
      <header className="top">
        <NavLink to="/profile" className="avatar" aria-label="Профиль">{letter}</NavLink>
        <span className="brand">
          <strong>{adminMode ? "Админ" : "Кабинет"}</strong>
          {user.role === "admin" && (
            <NavLink to={adminMode ? "/" : "/admin"} className="switch">{adminMode ? "В кабинет" : "В админку"}</NavLink>
          )}
        </span>
        <NavLink to="/support" className="bell" aria-label="Поддержка">
          <Icon d="M6 9a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9 M10 21h4" />
        </NavLink>
      </header>
      <main>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/create" element={<CreatePage />} />
          <Route path="/domains" element={<DomainsPage />} />
          <Route path="/examples" element={<ExamplesPage />} />
          <Route path="/invite" element={<InvitePage />} />
          <Route path="/logs" element={<LogsPage user={user} onUser={setUser} />} />
          <Route path="/profile" element={<ProfilePage user={user} />} />
          <Route path="/support" element={<SupportPage />} />
          <Route path="/admin" element={user.role === "admin" ? <AdminPage section="overview" /> : <Navigate to="/" replace />} />
          <Route path="/admin/traffic" element={user.role === "admin" ? <AdminPage section="traffic" /> : <Navigate to="/" replace />} />
          <Route path="/admin/templates" element={user.role === "admin" ? <AdminPage section="templates" /> : <Navigate to="/" replace />} />
          <Route path="/admin/settings" element={user.role === "admin" ? <AdminPage section="settings" /> : <Navigate to="/" replace />} />
          <Route path="/landings/:id" element={<EditPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {adminMode ? (
        <nav className="dock">
          <NavLink to="/admin" end><Icon d="M4 10h7V4H4zM13 20h7v-6h-7zM13 10h7V4h-7zM4 20h7v-6H4z" />Обзор</NavLink>
          <NavLink to="/admin/traffic"><Icon d="M4 19V10M10 19V5M16 19v-7M22 19H2" />Трафик</NavLink>
          <NavLink to="/admin/templates"><Icon d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" />Шаблоны</NavLink>
          <NavLink to="/admin/settings"><Icon d="M4 7h16M4 12h16M4 17h10" />Настройки</NavLink>
        </nav>
      ) : (
        <nav className="dock">
          <NavLink to="/" end><Icon d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z" />Главная</NavLink>
          <NavLink to="/create"><Icon d="M12 5v14M5 12h14" />Создать</NavLink>
          <NavLink to="/domains"><Icon d="M4 7h16M4 12h16M4 17h10" />Домены</NavLink>
          <NavLink to="/invite"><Icon d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4zM19 8v6M22 11h-6" />Пригласить</NavLink>
        </nav>
      )}
    </div>
  );
}
