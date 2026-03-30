// En-tete commun qui resume l'application et propose des actions globales.
export default function Header({ currentUser, onLogout }) {
  return (
    <header className="page-header">
      <div className="topbar">
        <div className="topbar-inner">
          <div className="topbar-left">
            <span className="header-user">{`Connect\u00e9 : ${currentUser}`}</span>
          </div>

          <div className="topbar-right header-actions">
            <button className="header-button" type="button">
              Exporter
            </button>
            <button className="header-button primary" type="button">
              Actualiser
            </button>
            <button className="header-button" onClick={onLogout} type="button">
              {`D\u00e9connexion`}
            </button>
          </div>
        </div>
      </div>

      <div className="main-header">
        <div className="main-header-inner">
          <div className="logo-zone">
            <div className="sidebar-logo">RH</div>
            <div className="logo-text">
              <p className="title">Tableau de bord RH</p>
              <p className="subtitle">
                {`Suivi synth\u00e9tique des effectifs, d\u00e9parts, badges et entit\u00e9s.`}
              </p>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
