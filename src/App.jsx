// test codex local
// Compose la structure principale de l'application et declare les routes RH.
import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useNavigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import { getCurrentUser, login, logout } from "./services/api";

import Dashboard from "./pages/Dashboard";
import StatistiquePage from "./pages/StatistiquePage";
import EffectifPage from "./pages/EffectifPage";
import DepartsPage from "./pages/DepartsPage";
import BadgesPage from "./pages/BadgesPage";
import EntitesPage from "./pages/EntitesPage";

export default function App() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", password: "" });
  const [currentUser, setCurrentUser] = useState(null);
  const [error, setError] = useState("");
  const [isBooting, setIsBooting] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function restoreSession() {
      const user = await getCurrentUser();

      if (!isMounted) {
        return;
      }

      setCurrentUser(user);
      setIsBooting(false);
    }

    restoreSession();

    return () => {
      isMounted = false;
    };
  }, []);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((previous) => ({
      ...previous,
      [name]: value
    }));
  }

  async function handleLogin(event) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const user = await login(form.username, form.password);
      setCurrentUser(user);
      setForm({ username: "", password: "" });
      navigate("/dashboard", { replace: true });
    } catch (loginError) {
      setError(loginError.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleLogout() {
    try {
      await logout();
    } finally {
      setCurrentUser(null);
      setForm({ username: "", password: "" });
      setError("");
    }
  }

  if (isBooting) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <p className="login-eyebrow">Connexion securisee</p>
          <h1 className="login-title">Preparation de la session</h1>
          <p className="login-text">
            Verification de votre acces au backend local en cours.
          </p>
        </section>
      </main>
    );
  }

  if (!currentUser) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <p className="login-eyebrow">Connexion securisee</p>
          <h1 className="login-title">Acces a RH Direction</h1>
          <p className="login-text">
            Connectez-vous avec le compte administrateur configure sur le backend.
          </p>

          <form className="login-form" onSubmit={handleLogin}>
            <label className="login-field">
              <span>Utilisateur</span>
              <input
                autoComplete="username"
                name="username"
                onChange={handleChange}
                placeholder="sysadm"
                type="text"
                value={form.username}
              />
            </label>

            <label className="login-field">
              <span>Mot de passe</span>
              <input
                autoComplete="current-password"
                name="password"
                onChange={handleChange}
                placeholder="Tp0sana"
                type="password"
                value={form.password}
              />
            </label>

            {error ? <p className="login-error">{error}</p> : null}

            <button className="login-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? "Connexion..." : "Se connecter"}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell app-rh">
      {/* Navigation laterale commune a toutes les pages. */}
      <Sidebar />
      <div className="main-area">
        {/* En-tete partage par toutes les vues du projet. */}
        <Header currentUser={currentUser.username} onLogout={handleLogout} />
        <main className="page-content">
          {/* Routage principal vers les pages metier. */}
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/statistique" element={<StatistiquePage />} />
            <Route path="/effectif" element={<EffectifPage />} />
            <Route path="/departs" element={<DepartsPage />} />
            <Route path="/badges" element={<BadgesPage />} />
            <Route path="/entites" element={<EntitesPage />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
