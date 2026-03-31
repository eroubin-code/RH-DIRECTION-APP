// En-tete commun qui resume l'application et propose des actions globales.
import BrandLogo from "./BrandLogo";

export default function Header({ currentUser, onLogout }) {
  return (
    <header className="page-header">
      <div className="topbar">
        <div className="topbar-inner">
          <div className="topbar-left">
            <span className="header-user">{`Connecté : ${currentUser}`}</span>
          </div>

          <div className="topbar-right header-actions">
            <button className="header-button" type="button">
              Exporter
            </button>
            <button className="header-button primary" type="button">
              Actualiser
            </button>
            <button className="header-button" onClick={onLogout} type="button">
              Déconnexion
            </button>
          </div>
        </div>
      </div>

      <div className="main-header">
        <div className="main-header-inner">
          <div className="logo-zone">
            <BrandLogo alt="Logo IECB - entete" />
            <div className="logo-text">
              <p className="title">Tableau de bord RH</p>
              <p className="subtitle">
                Suivi synthétique des effectifs, départs, badges et entités.
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
