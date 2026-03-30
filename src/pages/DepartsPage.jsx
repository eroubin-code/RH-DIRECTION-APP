// Page de suivi des departs avec les informations de badge associees.
import { useEffect, useState } from "react";
import DataTable from "../components/DataTable";
import { getDeparts } from "../services/api";

export default function DepartsPage() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    getDeparts().then(setRows);
  }, []);

  const columns = [
    { key: "nom", label: "Nom" },
    { key: "prenom", label: "Pr\u00e9nom" },
    { key: "depart", label: "Date d\u00e9part" },
    { key: "entite", label: "Entit\u00e9" },
    { key: "badge", label: "Badge" }
  ];

  return (
    <section className="content-card rh-panel rh-section">
      <div className="section-title">
        <h3 className="rh-panel-title">{`D\u00e9parts`}</h3>
      </div>
      <DataTable columns={columns} data={rows} />
    </section>
  );
}
