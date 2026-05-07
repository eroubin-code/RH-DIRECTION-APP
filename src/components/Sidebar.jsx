// Navigation principale affichee sous forme d'onglets.
import { NavLink } from "react-router-dom";

const links = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/effectif", label: "Effectif" },
  { to: "/entites", label: "Entités" },
  { to: "/statistique", label: "Statistique" },
  { to: "/departs", label: "Départs" },
  { to: "/badges", label: "Badges" }
];

export default function Sidebar() {
  return (
    <div className="tabs-shell">
      <nav className="tabs-nav" aria-label="Navigation principale">
        {links.map((link) => (
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
    </div>
  );
}
