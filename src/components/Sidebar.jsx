// Navigation principale affichee sous forme d'onglets.
import { Link, NavLink, useLocation } from "react-router-dom";

const mainLinks = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/effectif", label: "Effectif" },
  { to: "/entites", label: "Entités" },
  { to: "/statistique", label: "Statistique" },
  { to: "/departs", label: "Départs" },
  { to: "/badges", label: "Badges" }
];

const adminLinks = [
  { to: "/admin", label: "Utilisateurs", panel: "utilisateurs" },
  { to: "/admin?section=personnel", label: "Personnel", panel: "personnel" },
  { to: "/admin?section=batiments", label: "Bâtiments", panel: "batiments" },
  { to: "/admin?section=plans", label: "Plans", panel: "plans" }
];

export default function Sidebar() {
  const location = useLocation();
  const isAdminPage = location.pathname === "/admin";
  const selectedAdminPanel =
    new URLSearchParams(location.search).get("section") ?? "utilisateurs";

  return (
    <div className="tabs-shell">
      {isAdminPage ? (
        <nav className="tabs-nav admin-tabs-nav" aria-label="Navigation administration">
          {adminLinks.map((link) => {
            const isActive = selectedAdminPanel === link.panel;

            return (
              <Link
                key={link.to}
                to={link.to}
                className={isActive ? "tab-link active" : "tab-link"}
              >
                <span className="tab-link-label">{link.label}</span>
              </Link>
            );
          })}
        </nav>
      ) : (
        <nav className="tabs-nav" aria-label="Navigation principale">
          {mainLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                isActive ? "tab-link active" : "tab-link"
              }
            >
              <span className="tab-link-label">{link.label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}
