// Compose la structure principale de l'application et declare les routes RH.
import { useEffect, useState } from "react";
import { Routes, Route, Navigate, Link, useLocation, useNavigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Header from "./components/Header";
import BrandLogo from "./components/BrandLogo";
import {
  AUTH_EXPIRED_EVENT,
  changePassword,
  getCurrentUser,
  login,
  logout,
  requestPasswordResetCode,
  resetPasswordWithCode
} from "./services/api";

import Dashboard from "./pages/Dashboard";
import StatistiquePage from "./pages/StatistiquePage";
import EffectifPage from "./pages/EffectifPage";
import DepartsPage from "./pages/DepartsPage";
import BadgesPage from "./pages/BadgesPage";
import EntitesPage from "./pages/EntitesPage";
import AdministrationPage from "./pages/AdministrationPage";
import AwarenessPage from "./pages/AwarenessPage";

const APP_VERSION = "Version 1.3 Beta";
const FOOTER_NOTE = `RH Direction App - ${APP_VERSION}`;
const USERNAME_PLACEHOLDER = "Votre identifiant";
const PASSWORD_PLACEHOLDER = "Votre mot de passe";
const ADMIN_ROLES = ["admin", "operateur"];
// operateur_saisie n'a acces qu'a /admin (section "saisie", voir Sidebar/AdministrationPage),
// jamais a /awareness qui reste reserve a ADMIN_ROLES.
const PERSONNEL_ENTRY_ROLES = [...ADMIN_ROLES, "operateur_saisie"];
const PASSWORD_RULE_TEXT =
  "8 caractères minimum, avec au moins une lettre, un chiffre et un caractère spécial.";
const initialResetForm = { username: "", code: "", password: "", confirmation: "" };

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: "", password: "" });
  const [currentUser, setCurrentUser] = useState(null);
  const [error, setError] = useState("");
  const [isBooting, setIsBooting] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ password: "", confirmation: "" });
  const [passwordError, setPasswordError] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  // "idle" = formulaire de connexion normal, "request" = demande de code par
  // email, "confirm" = saisie du code + nouveau mot de passe.
  const [resetMode, setResetMode] = useState("idle");
  const [resetForm, setResetForm] = useState(initialResetForm);
  const [resetError, setResetError] = useState("");
  const [resetMessage, setResetMessage] = useState("");
  const [isResetSubmitting, setIsResetSubmitting] = useState(false);

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

  useEffect(() => {
    function handleAuthExpired() {
      setCurrentUser(null);
      setForm({ username: "", password: "" });
      setError("Session expiree. Merci de vous reconnecter.");
    }

    window.addEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);

    return () => {
      window.removeEventListener(AUTH_EXPIRED_EVENT, handleAuthExpired);
    };
  }, []);

  function handleChange(event) {
    const { name, value } = event.target;

    if (error) {
      setError("");
    }

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
        location.pathname === "/" ||
        location.pathname === "/admin" ||
        location.pathname === "/administration"
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

  function handlePasswordFieldChange(event) {
    const { name, value } = event.target;

    if (passwordError) {
      setPasswordError("");
    }

    setPasswordForm((previous) => ({ ...previous, [name]: value }));
  }

  async function handleChangePasswordSubmit(event) {
    event.preventDefault();

    if (passwordForm.password !== passwordForm.confirmation) {
      setPasswordError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setIsChangingPassword(true);
    setPasswordError("");

    try {
      const user = await changePassword(passwordForm.password);
      setCurrentUser(user);
      setPasswordForm({ password: "", confirmation: "" });
    } catch (changeError) {
      setPasswordError(changeError.message);
    } finally {
      setIsChangingPassword(false);
    }
  }

  function handleResetFieldChange(event) {
    const { name, value } = event.target;

    if (resetError) {
      setResetError("");
    }

    setResetForm((previous) => ({ ...previous, [name]: value }));
  }

  function openResetRequest() {
    setResetMode("request");
    setResetForm(initialResetForm);
    setResetError("");
    setResetMessage("");
  }

  function closeReset() {
    setResetMode("idle");
    setResetForm(initialResetForm);
    setResetError("");
    setResetMessage("");
  }

  async function handleResetRequestSubmit(event) {
    event.preventDefault();
    setIsResetSubmitting(true);
    setResetError("");
    setResetMessage("");

    try {
      const result = await requestPasswordResetCode(resetForm.username);
      setResetMessage(result.message);
      setResetMode("confirm");
    } catch (requestError) {
      setResetError(requestError.message);
    } finally {
      setIsResetSubmitting(false);
    }
  }

  async function handleResetConfirmSubmit(event) {
    event.preventDefault();

    if (resetForm.password !== resetForm.confirmation) {
      setResetError("Les deux mots de passe ne correspondent pas.");
      return;
    }

    setIsResetSubmitting(true);
    setResetError("");

    try {
      await resetPasswordWithCode(resetForm.username, resetForm.code, resetForm.password);
      closeReset();
      setError("");
      setForm({ username: resetForm.username, password: "" });
    } catch (requestError) {
      setResetError(requestError.message);
    } finally {
      setIsResetSubmitting(false);
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
    if (location.pathname === "/" || location.pathname === "/dashboard") {
      return (
        <main className="login-shell">
          <section className="login-card public-dashboard-shell">
            <div className="login-card-brand">
              <BrandLogo alt="Logo IECB - dashboard public interne" />
            </div>
            <div className="login-heading">
              <p className="login-eyebrow">Acces interne temporaire</p>
              <h1 className="login-title">RH Direction App</h1>
              <p className="login-text">Tableau de bord accessible sans authentification</p>
            </div>
            <div className="public-dashboard-actions">
              <Link className="btn-primary public-dashboard-login" to="/admin">
                Connexion
              </Link>
            </div>
            <Dashboard publicMode />
          </section>
          <p className="app-version-badge">{APP_VERSION}</p>
        </main>
      );
    }

    return (
      <main className="login-shell">
        <section className="login-card">
          <div className="login-card-brand">
            <BrandLogo alt="Logo IECB - authentification" />
          </div>

          {resetMode === "idle" ? (
            <>
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

                <button className="login-link-button" onClick={openResetRequest} type="button">
                  Mot de passe oublié ?
                </button>
              </form>
            </>
          ) : null}

          {resetMode === "request" ? (
            <>
              <div className="login-heading">
                <p className="login-eyebrow">Mot de passe oublié</p>
                <h1 className="login-title">Recevoir un code par email</h1>
                <p className="login-text">
                  Saisissez votre identifiant (adresse email) pour recevoir un code de
                  réinitialisation.
                </p>
              </div>
              <form className="login-form" onSubmit={handleResetRequestSubmit}>
                <label className="login-field">
                  <span>Utilisateur</span>
                  <input
                    autoComplete="username"
                    name="username"
                    onChange={handleResetFieldChange}
                    placeholder={USERNAME_PLACEHOLDER}
                    required
                    type="text"
                    value={resetForm.username}
                  />
                </label>

                {resetError ? <p className="login-error">{resetError}</p> : null}

                <button className="login-button" disabled={isResetSubmitting} type="submit">
                  {isResetSubmitting ? "Envoi..." : "Envoyer le code"}
                </button>

                <button className="login-link-button" onClick={closeReset} type="button">
                  Retour à la connexion
                </button>
              </form>
            </>
          ) : null}

          {resetMode === "confirm" ? (
            <>
              <div className="login-heading">
                <p className="login-eyebrow">Mot de passe oublié</p>
                <h1 className="login-title">Saisir le code reçu</h1>
                {resetMessage ? <p className="login-text">{resetMessage}</p> : null}
              </div>
              <form className="login-form" onSubmit={handleResetConfirmSubmit}>
                <label className="login-field">
                  <span>Code reçu par email</span>
                  <input
                    autoComplete="one-time-code"
                    name="code"
                    onChange={handleResetFieldChange}
                    required
                    type="text"
                    value={resetForm.code}
                  />
                </label>

                <label className="login-field">
                  <span>Nouveau mot de passe</span>
                  <input
                    autoComplete="new-password"
                    minLength="8"
                    name="password"
                    onChange={handleResetFieldChange}
                    required
                    type="password"
                    value={resetForm.password}
                  />
                  <small className="admin-form-hint">{PASSWORD_RULE_TEXT}</small>
                </label>

                <label className="login-field">
                  <span>Confirmation</span>
                  <input
                    autoComplete="new-password"
                    minLength="8"
                    name="confirmation"
                    onChange={handleResetFieldChange}
                    required
                    type="password"
                    value={resetForm.confirmation}
                  />
                </label>

                {resetError ? <p className="login-error">{resetError}</p> : null}

                <button className="login-button" disabled={isResetSubmitting} type="submit">
                  {isResetSubmitting ? "Enregistrement..." : "Réinitialiser le mot de passe"}
                </button>

                <button className="login-link-button" onClick={closeReset} type="button">
                  Retour à la connexion
                </button>
              </form>
            </>
          ) : null}
        </section>
        <p className="app-version-badge">{APP_VERSION}</p>
      </main>
    );
  }

  if (currentUser.mustChangePassword) {
    return (
      <main className="login-shell">
        <section className="login-card">
          <div className="login-card-brand">
            <BrandLogo alt="Logo IECB - changement de mot de passe" />
          </div>
          <div className="login-heading">
            <p className="login-eyebrow">Premiere connexion</p>
            <h1 className="login-title">Choisissez un nouveau mot de passe</h1>
            <p className="login-text">
              Votre mot de passe a ete defini par un administrateur. Merci d'en
              choisir un nouveau avant de continuer.
            </p>
          </div>
          <form className="login-form" onSubmit={handleChangePasswordSubmit}>
            <label className="login-field">
              <span>Nouveau mot de passe</span>
              <input
                autoComplete="new-password"
                minLength="8"
                name="password"
                onChange={handlePasswordFieldChange}
                required
                type="password"
                value={passwordForm.password}
              />
              <small className="admin-form-hint">{PASSWORD_RULE_TEXT}</small>
            </label>

            <label className="login-field">
              <span>Confirmation</span>
              <input
                autoComplete="new-password"
                minLength="8"
                name="confirmation"
                onChange={handlePasswordFieldChange}
                required
                type="password"
                value={passwordForm.confirmation}
              />
            </label>

            {passwordError ? <p className="login-error">{passwordError}</p> : null}

            <button className="login-button" disabled={isChangingPassword} type="submit">
              {isChangingPassword ? "Enregistrement..." : "Valider"}
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
        <Sidebar currentUser={currentUser} />
        <div className="workspace-main">
          <Header currentUser={currentUser} onLogout={handleLogout} />
          <main className="page-content">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/statistique" element={<StatistiquePage />} />
              <Route path="/effectif" element={<EffectifPage />} />
              <Route path="/departs" element={<DepartsPage />} />
              <Route path="/badges" element={<BadgesPage />} />
              <Route path="/entites" element={<EntitesPage />} />
              <Route
                path="/awareness"
                element={
                  ADMIN_ROLES.includes(currentUser.role) ? (
                    <AwarenessPage />
                  ) : (
                    <Navigate to="/dashboard" replace />
                  )
                }
              />
              <Route
                path="/admin"
                element={
                  PERSONNEL_ENTRY_ROLES.includes(currentUser.role) ? (
                    <AdministrationPage currentUser={currentUser} />
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
    </div>
  );
}
