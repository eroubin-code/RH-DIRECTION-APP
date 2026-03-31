// Page de suivi des departs avec les informations de badge associees.
import { useEffect, useState } from "react";
import DataTable from "../components/DataTable";
import { getDeparts } from "../services/api";

function formatDateFr(value) {
  const normalizedValue = String(value ?? "").trim();

  if (!normalizedValue) {
    return "";
  }

  const date = normalizedValue.includes("T")
    ? new Date(normalizedValue)
    : new Date(`${normalizedValue}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return normalizedValue;
  }

  return new Intl.DateTimeFormat("fr-FR").format(date);
}

export default function DepartsPage() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    getDeparts().then((data) =>
      setRows(
        data.map((row) => ({
          ...row,
          depart_raw: row.depart,
          depart: formatDateFr(row.depart)
        }))
      )
    );
  }, []);

  const columns = [
    { key: "nom", label: "Nom" },
    { key: "prenom", label: "Prénom" },
    { key: "depart", label: "Date départ" },
    { key: "entite", label: "Entité" },
    { key: "badge", label: "Badge" }
  ];

  return (
    <section className="content-card rh-panel rh-section">
      <div className="section-title">
        <h3 className="rh-panel-title">Départs</h3>
      </div>
      <DataTable columns={columns} data={rows} />
    </section>
  );
}
