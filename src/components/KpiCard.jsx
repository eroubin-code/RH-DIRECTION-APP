// Petite carte d'indicateur pour afficher un KPI sur le dashboard.
export default function KpiCard({ label, value, sub = "Suivi en temps reel" }) {
  const subLines = Array.isArray(sub) ? sub : [sub];

  return (
    <div className="kpi-card">
      <p className="kpi-label">{label}</p>
      <h3 className="kpi-value">{value}</h3>
      <div className="kpi-sub">
        {subLines.map((line, index) => (
          <p key={`${label}-${index}`}>{line}</p>
        ))}
      </div>
    </div>
  );
}
