const DEFAULT_COLORS = [
  "#1f4f7a",
  "#3d7aa5",
  "#5b95b8",
  "#7fb0ca",
  "#9fc5d8",
  "#c0d9e6",
  "#dbe8f0",
  "#7b8ea3"
];

function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;

  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians)
  };
}

function describeArc(centerX, centerY, radius, startAngle, endAngle) {
  const start = polarToCartesian(centerX, centerY, radius, endAngle);
  const end = polarToCartesian(centerX, centerY, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return [
    `M ${centerX} ${centerY}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`,
    "Z"
  ].join(" ");
}

function formatPercent(count, total) {
  if (!total) {
    return "0%";
  }

  return `${Math.round((count / total) * 100)}%`;
}

export default function PieChart({
  title,
  items,
  emptyLabel = "Aucune donnee"
}) {
  const legendItems = items
    .map((item, index) => ({
      ...item,
      color: DEFAULT_COLORS[index % DEFAULT_COLORS.length]
    }));
  const total = legendItems.reduce((sum, item) => sum + Number(item.count ?? 0), 0);
  const visibleItems = legendItems.filter((item) => Number(item.count ?? 0) > 0);

  let startAngle = 0;

  return (
    <section className="stats-panel">
      <h4 className="stats-panel-title">{title}</h4>

      <div className="stats-chart-layout">
        <div className="stats-chart-shell" aria-hidden="true">
          {total > 0 ? (
            <svg
              className="stats-chart-svg"
              viewBox="0 0 220 220"
              role="img"
              aria-label={title}
            >
              <circle
                cx="110"
                cy="110"
                fill="#eef4f9"
                r="86"
              />

              {visibleItems.map((item) => {
                const sweep = (Number(item.count) / total) * 360;
                const endAngle = startAngle + sweep;
                const path = describeArc(110, 110, 86, startAngle, endAngle);
                const currentStartAngle = startAngle;

                startAngle = endAngle;

                return (
                  <path
                    key={`${item.label}-${currentStartAngle}`}
                    d={path}
                    fill={item.color}
                    stroke="#f8fbfe"
                    strokeWidth="3"
                  />
                );
              })}

              <circle cx="110" cy="110" fill="#ffffff" r="52" />
              <text
                className="stats-chart-total-label"
                textAnchor="middle"
                x="110"
                y="102"
              >
                Total
              </text>
              <text
                className="stats-chart-total-value"
                textAnchor="middle"
                x="110"
                y="126"
              >
                {total}
              </text>
            </svg>
          ) : (
            <div className="stats-chart-empty">{emptyLabel}</div>
          )}
        </div>

        <div className="stats-chart-legend">
          {legendItems.length > 0 ? (
            legendItems.map((item) => (
              <div className="stats-chart-legend-row" key={item.label}>
                <span
                  className="stats-chart-swatch"
                  style={{ backgroundColor: item.color }}
                />
                <span className="stats-chart-label">{item.label}</span>
                <strong className="stats-chart-value">
                  {`${item.count} (${formatPercent(item.count, total)})`}
                </strong>
              </div>
            ))
          ) : (
            <p className="stats-chart-empty-text">{emptyLabel}</p>
          )}
        </div>
      </div>
    </section>
  );
}
