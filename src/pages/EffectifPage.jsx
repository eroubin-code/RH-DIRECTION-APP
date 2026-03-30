// Page qui liste l'effectif et les informations principales des collaborateurs.
import { useEffect, useState } from "react";
import DataTable from "../components/DataTable";
import { getEffectif } from "../services/api";

export default function EffectifPage() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    getEffectif().then(setRows);
  }, []);

  const columns = [
    { key: "civilite", label: "Civilit\u00e9" },
    { key: "nom", label: "Nom" },
    { key: "prenom", label: "Pr\u00e9nom" },
    { key: "fonction", label: "Fonction" },
    { key: "entite", label: "Entit\u00e9" }
  ];

  return (
    <section className="content-card rh-panel rh-section">
      <div className="section-title">
        <h3 className="rh-panel-title">Effectif</h3>
      </div>
      <DataTable columns={columns} data={rows} />
    </section>
  );
}
