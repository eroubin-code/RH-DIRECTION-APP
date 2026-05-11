// test codex local
// Compose la structure principale de l'application et declare les routes RH.
import { useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import BrandLogo from "./components/BrandLogo";
import { getCurrentUser, login, logout } from "./services/api";

import Dashboard from "./pages/Dashboard";
import StatistiquePage from "./pages/StatistiquePage";
import EffectifPage from "./pages/EffectifPage";
import DepartsPage from "./pages/DepartsPage";
import BadgesPage from "./pages/BadgesPage";
import EntitesPage from "./pages/EntitesPage";
import AdministrationPage from "./pages/AdministrationPage";

const APP_VERSION = "Version 1.3 Beta";
const FOOTER_NOTE = `RH Direction App - ${APP_VERSION}`;
const USERNAME_PLACEHOLDER = "Votre identifiant";
const PASSWORD_PLACEHOLDER = "Votre mot de passe";
const ADMIN_ROLES = ["admin", "operateur"];

export default function App() {
  const location = useLocation();
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
      const nextPath =
        location.pathname === "/"
          ? "/dashboard"
          : `${location.pathname}${location.search}`;
      navigate(nextPath, { replace: true });
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
        <p className="app-version-badge">{APP_VERSION}</p>
      </main>
    );
  }

  if (!currentUser) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <div className="login-card-brand">
            <BrandLogo alt="Logo IECB - authentification" />
          </div>
          <div className="login-heading">
            <p className="login-eyebrow">Espace sécurisé</p>
            <h1 className="login-title">RH Direction App</h1>
            <p className="login-text">Pilotage RH et indicateurs direction</p>
          </div>
          <form className="login-form" onSubmit={handleLogin}>
            <label className="login-field">
              <span>Utilisateur</span>
              <input
                autoComplete="username"
                name="username"
                onChange={handleChange}
                placeholder={USERNAME_PLACEHOLDER}
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
                placeholder={PASSWORD_PLACEHOLDER}
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
        <p className="app-version-badge">{APP_VERSION}</p>
      </main>
    );
  }

  return (
    <div className="app-shell app-rh">
      <div className="main-area">
        {/* En-tete partage par toutes les vues du projet. */}
        <Header currentUser={currentUser} onLogout={handleLogout} />
        {/* Navigation principale presentee sous forme d'onglets. */}
        <Sidebar currentUser={currentUser} />
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
            <Route
              path="/admin"
              element={
                ADMIN_ROLES.includes(currentUser.role) ? (
                  <AdministrationPage />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />
            <Route path="/administration" element={<Navigate to="/admin" replace />} />
          </Routes>
        </main>
        <footer className="app-version-footer">
          <span>{FOOTER_NOTE}</span>
        </footer>
      </div>
    </div>
  );
}
