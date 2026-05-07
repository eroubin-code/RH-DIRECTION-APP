// En-tete commun qui resume l'application et propose des actions globales.
import { NavLink } from "react-router-dom";
import BrandLogo from "./BrandLogo";

const adminRoles = ["admin", "operateur"];

export default function Header({ currentUser, onLogout }) {
  const canAccessAdministration = adminRoles.includes(currentUser?.role);

  return (
    <header className="page-header">
      <div className="topbar">
        <div className="topbar-inner">
          <div className="topbar-left">
            <span className="header-user">{`Connecté : ${currentUser.username}`}</span>
          </div>

          <div className="topbar-right header-actions">
            {canAccessAdministration ? (
              <NavLink className="header-button" to="/administration">
                Administration
              </NavLink>
            ) : null}
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
