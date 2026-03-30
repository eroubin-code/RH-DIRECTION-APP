// Page d'accueil qui affiche les KPI RH et les departs recents.
import { useEffect, useState } from "react";
import KpiCard from "../components/KpiCard";
import DataTable from "../components/DataTable";
import { getDashboardData } from "../services/api";

export default function Dashboard() {
  const [data, setData] = useState({ kpis: [], recentDeparts: [] });

  useEffect(() => {
    getDashboardData().then(setData);
  }, []);

  const columns = [
    { key: "nom", label: "Nom" },
    { key: "prenom", label: "Pr\u00e9nom" },
    { key: "date", label: "Date d\u00e9part" },
    { key: "entite", label: "Entit\u00e9" }
  ];

  return (
    <div className="page-section rh-section">
      <div className="kpi-grid">
        {data.kpis.map((item) => (
          <KpiCard key={item.label} label={item.label} value={item.value} />
        ))}
      </div>

      <section className="content-card rh-panel">
        <div className="section-title">
          <h3 className="rh-panel-title">{`D\u00e9parts r\u00e9cents / \u00e0 suivre`}</h3>
        </div>
        <DataTable columns={columns} data={data.recentDeparts} />
      </section>
    </div>
  );
}
