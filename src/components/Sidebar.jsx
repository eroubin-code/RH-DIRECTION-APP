import { Link, NavLink, useLocation } from "react-router-dom";
import BrandLogo from "./BrandLogo";

const mainLinks = [
  { to: "/dashboard", label: "Dashboard", icon: "⌂" },
  { to: "/effectif", label: "Effectif", icon: "EF" },
  { to: "/entites", label: "Entités", icon: "▦" },
  { to: "/statistique", label: "Statistique", icon: "◔" },
  { to: "/departs", label: "Départs", icon: "↗" },
  { to: "/badges", label: "Badges", icon: "▣" },
  { to: "/awareness", label: "Awareness", icon: "⚑", roles: ["admin", "operateur"] },
  {
    to: "/admin?section=saisie",
    label: "Saisie arrivants",
    icon: "✎",
    roles: ["admin", "operateur", "operateur_saisie"]
  },
  {
    to: "/admin",
    label: "Administration",
    icon: "⚙",
    roles: ["admin", "operateur", "operateur_saisie"]
  }
];

const adminLinks = [
  { to: "/admin", label: "Utilisateurs", panel: "utilisateurs", icon: "◎", roles: ["admin", "operateur"] },
  { to: "/admin?section=personnel", label: "Personnel", panel: "personnel", icon: "＋", roles: ["admin", "operateur"] },
  { to: "/admin?section=batiments", label: "Bâtiments", panel: "batiments", icon: "▤", roles: ["admin", "operateur"] },
  { to: "/admin?section=plans", label: "Plans", panel: "plans", icon: "⌖", roles: ["admin", "operateur"] },
  {
    to: "/admin?section=saisie",
    label: "Saisie arrivants",
    panel: "saisie",
    icon: "✎",
    roles: ["admin", "operateur", "operateur_saisie"]
  }
];

export default function Sidebar({ currentUser }) {
  const location = useLocation();
  const isAdminPage = location.pathname === "/admin";
  const selectedAdminPanel =
    new URLSearchParams(location.search).get("section") ??
    (currentUser.role === "operateur_saisie" ? "saisie" : "utilisateurs");
  const links = (isAdminPage ? adminLinks : mainLinks).filter(
    (link) => !link.roles || link.roles.includes(currentUser.role)
  );

  return (
    <aside className="sidebar-shell">
      <div className="sidebar-brand">
        <BrandLogo alt="Logo IECB - navigation" />
        <div>
          <strong>IECB</strong>
          <span>Pilotage RH</span>
        </div>
      </div>

      <div className="sidebar-section">
        <p>{isAdminPage ? "Administration" : "Navigation"}</p>
        <nav className="tabs-nav" aria-label={isAdminPage ? "Navigation administration" : "Navigation principale"}>
          {links.map((link) => {
            const content = (
              <>
                <span className="tab-link-icon" aria-hidden="true">{link.icon}</span>
                <span className="tab-link-label">{link.label}</span>
              </>
            );

            if (isAdminPage) {
              const isActive = selectedAdminPanel === link.panel;

              return (
                <Link
                  key={link.to}
                  to={link.to}
                  className={isActive ? "tab-link active" : "tab-link"}
                >
                  {content}
                </Link>
              );
            }

            return (
              <NavLink
                key={link.to}
                to={link.to}
                className={({ isActive }) =>
                  isActive ? "tab-link active" : "tab-link"
                }
              >
                {content}
              </NavLink>
            );
          })}
        </nav>
      </div>

      <div className="sidebar-user">
        <span>{currentUser.role}</span>
        <strong>{currentUser.username}</strong>
      </div>
    </aside>
  );
}
