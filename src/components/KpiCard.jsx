const KPI_ICONS = {
  "effectif total": "EF",
  "departs a suivre": "↗",
  "départs a suivre": "↗",
  "departs à suivre": "↗",
  "badges actifs": "▣",
  "entites suivies": "▦",
  "entités suivies": "▦"
};

function getKpiIcon(label) {
  const normalizedLabel = String(label ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();

  return KPI_ICONS[normalizedLabel] ?? "•";
}

export default function KpiCard({ label, value, sub = "Suivi en temps reel" }) {
  const subLines = Array.isArray(sub) ? sub : [sub];

  return (
    <div className="kpi-card">
      <div className="kpi-card-head">
        <span className="kpi-icon" aria-hidden="true">{getKpiIcon(label)}</span>
        <p className="kpi-label">{label}</p>
      </div>
      <div className="kpi-value-row">
        <h3 className="kpi-value">{value}</h3>
        <span className="kpi-trend">Suivi actif</span>
      </div>
      <div className="kpi-sub">
        {subLines.map((line, index) => (
          <p key={`${label}-${index}`}>{line}</p>
        ))}
      </div>
    </div>
  );
}
