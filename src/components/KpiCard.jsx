// Petite carte d'indicateur pour afficher un KPI sur le dashboard.
export default function KpiCard({ label, value }) {
  return (
    <div className="kpi-card">
      <p className="kpi-label">{label}</p>
      <h3 className="kpi-value">{value}</h3>
      <p className="kpi-sub">Suivi en temps reel</p>
    </div>
  );
}
