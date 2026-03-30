// Page qui recense les badges et leur statut pour chaque personne.
import { useEffect, useState } from "react";
import DataTable from "../components/DataTable";
import { getBadges } from "../services/api";

export default function BadgesPage() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    getBadges().then(setRows);
  }, []);

  const columns = [
    { key: "nom", label: "Nom" },
    { key: "prenom", label: "Pr\u00e9nom" },
    { key: "badge", label: "Badge" },
    { key: "statut", label: "Statut" }
  ];

  return (
    <section className="content-card rh-panel rh-section">
      <div className="section-title">
        <h3 className="rh-panel-title">Badges</h3>
      </div>
      <DataTable columns={columns} data={rows} />
    </section>
  );
}
