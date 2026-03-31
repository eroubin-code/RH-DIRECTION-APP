// Composant de menu lateral pour naviguer entre les pages RH.
import { NavLink } from "react-router-dom";
import BrandLogo from "./BrandLogo";

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
    <aside className="sidebar">
      <div className="sidebar-brand">
        <BrandLogo alt="Logo IECB - navigation" />
        <div>
          <h1>RH Direction</h1>
          <p>IECB</p>
        </div>
      </div>

      <nav className="sidebar-nav">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
