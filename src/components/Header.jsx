// En-tete commun qui resume l'application et propose des actions globales.
import BrandLogo from "./BrandLogo";

export default function Header({ currentUser, onLogout }) {
  return (
    <header className="page-header">
      <div className="main-header">
        <div className="main-header-inner">
          <div className="logo-zone">
            <BrandLogo alt="Logo IECB - entete" />
            <div className="logo-text">
              <p className="title">RH Direction App</p>
              <p className="subtitle">
                Centre de pilotage RH, effectifs, départs, badges et entités
              </p>
            </div>
          </div>

          <div className="header-user-card">
            <span className="header-user-label">Connecté</span>
            <strong>{currentUser.username}</strong>
            <span>{currentUser.role}</span>
          </div>
        </div>
      </div>

      <div className="topbar">
        <div className="topbar-inner">
          <p className="page-kicker">Tableau de bord institutionnel</p>
          <div className="topbar-right header-actions">
            <button className="header-button" type="button">
              <span aria-hidden="true">⇩</span>
              Exporter
            </button>
            <button className="header-button primary" type="button">
              <span aria-hidden="true">↻</span>
              Actualiser
            </button>
            <button className="header-button danger" onClick={onLogout} type="button">
              <span aria-hidden="true">⏻</span>
              Déconnexion
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
