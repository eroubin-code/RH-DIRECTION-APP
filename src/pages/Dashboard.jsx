import { useEffect, useState } from "react";
import KpiCard from "../components/KpiCard";
import DataTable from "../components/DataTable";
import { getDashboardData } from "../services/api";

function formatTeamLabel(value) {
  const normalizedValue = String(value ?? "").trim().toLowerCase();

  if (!normalizedValue) {
    return "";
  }

  return normalizedValue.charAt(0).toUpperCase() + normalizedValue.slice(1);
}

function MetricList({ title, items, emptyLabel = "Aucune donnee disponible" }) {
  return (
    <section className="content-card rh-panel dashboard-panel">
      <div className="section-title">
        <h3 className="rh-panel-title">{title}</h3>
      </div>

      <div className="dashboard-list">
        {items.length > 0 ? (
          items.map((item) => (
            <div className="dashboard-list-row" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))
        ) : (
          <p className="stats-chart-empty-text">{emptyLabel}</p>
        )}
      </div>
    </section>
  );
}

function QuickBreakdown({
  title,
  items,
  detailsByLabel = {},
  emptyLabel = "Aucune donnee disponible"
}) {
  const safeItems = Array.isArray(items) ? items : [];
  const total = safeItems.reduce((sum, item) => sum + Number(item.count ?? item.value ?? 0), 0);

  return (
    <section className="dashboard-breakdown">
      <h4 className="dashboard-breakdown-title">{title}</h4>

      <div className="dashboard-breakdown-list">
        {safeItems.length > 0 ? (
          safeItems.map((item) => {
            const value = Number(item.count ?? item.value ?? 0);
            const percent = total > 0 ? Math.round((value / total) * 100) : 0;
            const width = `${percent}%`;
            const details = Array.isArray(detailsByLabel[item.label])
              ? detailsByLabel[item.label]
              : [];

            return (
              <div className="dashboard-breakdown-row" key={item.label}>
                <div className="dashboard-breakdown-head">
                  <span>{item.label}</span>
                  <strong>{`${value} (${percent}%)`}</strong>
                </div>
                <div className="dashboard-breakdown-track">
                  <div
                    className="dashboard-breakdown-fill"
                    style={{ width }}
                  />
                </div>
                {details.length > 0 ? (
                  <p className="dashboard-breakdown-details">
                    {details.map(formatTeamLabel).join(", ")}
                  </p>
                ) : null}
              </div>
            );
          })
        ) : (
          <p className="stats-chart-empty-text">{emptyLabel}</p>
        )}
      </div>
    </section>
  );
}

export default function Dashboard() {
  const [data, setData] = useState({
    kpis: [],
    recentDeparts: [],
    alerts: [],
    functionBuckets: [],
    tutelleBuckets: [],
    assignmentGroups: [],
    entiteBuckets: [],
    qualityItems: []
  });

  useEffect(() => {
    getDashboardData().then(setData);
  }, []);

  const assignmentDetailsByLabel = Object.fromEntries(
    (Array.isArray(data.assignmentGroups) ? data.assignmentGroups : []).map((group) => [
      group.label,
      group.items ?? []
    ])
  );

  const columns = [
    { key: "nom", label: "Nom" },
    { key: "prenom", label: "Prénom" },
    { key: "date", label: "Date départ" },
    { key: "entite", label: "Entité" }
  ];

  return (
    <div className="page-section rh-section">
      <div className="kpi-grid">
        {data.kpis.slice(0, 3).map((item) => (
          <KpiCard
            key={item.label}
            label={item.label}
            value={item.value}
            sub={item.sub}
          />
        ))}
      </div>

      <div className="dashboard-grid">
        <MetricList title="Alertes RH" items={data.alerts} />

        <section className="content-card rh-panel dashboard-panel">
          <div className="section-title">
            <h3 className="rh-panel-title">Repartition Tutelles / Unite d'affectation</h3>
          </div>

          <div className="dashboard-chart-grid">
            <QuickBreakdown
              title="Tutelles"
              items={data.tutelleBuckets}
              emptyLabel="Aucune tutelle a afficher"
            />
            <QuickBreakdown
              title="Unites d'affectation"
              items={data.assignmentUnits}
              detailsByLabel={assignmentDetailsByLabel}
              emptyLabel="Aucune unite a afficher"
            />
          </div>
        </section>

        <MetricList title="Qualité des données" items={data.qualityItems} />

        <MetricList title="Top entités" items={data.entiteBuckets} />
      </div>

      <section className="content-card rh-panel dashboard-panel">
        <div className="section-title">
          <h3 className="rh-panel-title">Départs à suivre</h3>
        </div>
        <DataTable columns={columns} data={data.recentDeparts} />
      </section>
    </div>
  );
}
