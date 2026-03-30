// Page qui presente les entites, leur responsable et leur effectif.
import { useEffect, useState } from "react";
import DataTable from "../components/DataTable";
import { getEntites } from "../services/api";

export default function EntitesPage() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    getEntites().then(setRows);
  }, []);

  const columns = [
    { key: "entite", label: "Entit\u00e9" },
    { key: "responsable", label: "Responsable" },
    { key: "effectif", label: "Effectif" }
  ];

  return (
    <section className="content-card rh-panel rh-section">
      <div className="section-title">
        <h3 className="rh-panel-title">{`Entit\u00e9s`}</h3>
      </div>
      <DataTable columns={columns} data={rows} />
    </section>
  );
}
