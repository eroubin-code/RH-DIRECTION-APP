import { useEffect, useMemo, useState } from "react";
import PieChart from "../components/PieChart";
import { getAnnualStatistics } from "../services/api";

const DEFAULT_SNAPSHOT_DATE = new Date().toISOString().slice(0, 10);

function normalizeFunctionBucket(fonction) {
  const normalizedFunction = String(fonction ?? "").trim().toLowerCase();

  if (normalizedFunction.includes("post")) {
    return "Post-docs";
  }

  if (normalizedFunction.includes("doctorant")) {
    return "Doctorants";
  }

  if (normalizedFunction.includes("stagiaire")) {
    return "Stagiaires";
  }

  return "Autres";
}

function normalizeNationality(value) {
  return String(value ?? "").trim() || "Non renseignee";
}

function normalizeTutelle(value) {
  const normalizedValue = String(value ?? "").trim();
  const loweredValue = normalizedValue.toLowerCase();

  if (!normalizedValue || loweredValue === "non renseignee" || loweredValue === "iecb") {
    return "Autre";
  }

  return normalizedValue;
}

function formatDateLabel(value) {
  const normalizedValue = String(value ?? "").trim();

  if (!normalizedValue) {
    return "";
  }

  const date = new Date(`${normalizedValue}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return normalizedValue;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

function toCsvValue(value) {
  const normalizedValue = String(value ?? "").replaceAll('"', '""');
  return `"${normalizedValue}"`;
}

function downloadCsv(filename, rows) {
  const csvContent = rows.map((row) => row.map(toCsvValue).join(";")).join("\n");
  const blob = new Blob([`\uFEFF${csvContent}`], {
    type: "text/csv;charset=utf-8;"
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();

  window.URL.revokeObjectURL(url);
}

export default function StatistiquePage() {
  const [report, setReport] = useState({
    snapshotDate: DEFAULT_SNAPSHOT_DATE,
    summary: {
      totalPersonnel: 0,
      sexes: [],
      statuses: [],
      functions: [],
      nationalities: [],
      tutelles: [],
      rattachementTypes: []
    },
    rows: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadReport() {
      setIsLoading(true);
      setError("");

      try {
        const payload = await getAnnualStatistics(DEFAULT_SNAPSHOT_DATE);

        if (isMounted) {
          setReport(payload);
        }
      } catch (loadError) {
        if (isMounted) {
          setError(loadError.message);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadReport();

    return () => {
      isMounted = false;
    };
  }, []);

  const topFunctions = useMemo(
    () => report.summary.functions.slice(0, 6),
    [report.summary.functions]
  );

  const topNationalities = useMemo(
    () => report.summary.nationalities.slice(0, 8),
    [report.summary.nationalities]
  );

  const topTutelles = useMemo(
    () => report.summary.tutelles.slice(0, 8),
    [report.summary.tutelles]
  );

  function handleExport() {
    const csvRows = [
      ["Civilite", "Nom", "Prenom", "Sexe", "Statut", "Fonction", "Nationalite", "Tutelle", "Rattachement", "Date d'arrivee", "Date de depart"],
      ...report.rows.map((row) =>
        [
          row.civilite,
          row.nom,
          row.prenom,
          row.sexe,
          row.statut,
          row.fonction,
          row.nationalite,
          row.tutelle,
          row.rattachement,
          row.date_arrivee_raw ?? row.date_arrivee,
          row.date_depart_raw ?? row.date_depart
        ]
      )
    ];

    downloadCsv(`extraction-rh-${report.snapshotDate}.csv`, csvRows);
  }

  return (
    <section className="content-card rh-panel rh-section">
      <div className="section-title">
        <div>
          <h3 className="rh-panel-title">Statistique</h3>
          <p className="stats-intro">
            Extraction annuelle des personnels avec statut, nationalite,
            rattachement et repartition femme / homme.
          </p>
        </div>

        <div className="stats-actions">
          <button
            className="effectif-reset stats-export-button"
            onClick={handleExport}
            type="button"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="stats-toolbar">
        <div className="stats-current-date">
          <span>Perimetre</span>
          <strong>{`A ce jour - ${formatDateLabel(report.snapshotDate)}`}</strong>
          <p className="stats-headcount">{`${report.summary.totalPersonnel} personnel(s)`}</p>
        </div>
      </div>

      {error ? <p className="login-error">{error}</p> : null}

      <div className="stats-grid">
        <PieChart
          title="Repartition par fonction"
          items={topFunctions}
          emptyLabel="Aucune fonction a afficher"
        />

        <PieChart
          title="Repartition femme / homme"
          items={report.summary.sexes}
          emptyLabel="Aucune repartition disponible"
        />

        <PieChart
          title="Nationalites"
          items={topNationalities}
          emptyLabel="Aucune nationalite a afficher"
        />

        <PieChart
          title="Tutelles"
          items={topTutelles}
          emptyLabel="Aucune tutelle a afficher"
        />

        <PieChart
          title="Types de rattachement"
          items={report.summary.rattachementTypes}
          emptyLabel="Aucun rattachement a afficher"
        />
      </div>
    </section>
  );
}
