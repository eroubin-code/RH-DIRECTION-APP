// Tableau generique reutilisable pour afficher des lignes de donnees.
function parseDateValue(value) {
  const normalizedValue = String(value ?? "").trim();

  if (!normalizedValue) {
    return null;
  }

  const date = normalizedValue.includes("T")
    ? new Date(normalizedValue)
    : /^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)
      ? new Date(`${normalizedValue}T00:00:00`)
      : null;

  if (!date || Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function formatDateFr(value) {
  const normalizedValue = String(value ?? "").trim();

  if (!normalizedValue) {
    return "";
  }

  const date = parseDateValue(normalizedValue);

  if (!date) {
    return normalizedValue;
  }

  return new Intl.DateTimeFormat("fr-FR").format(date);
}

function isDateWithinDepartureWindow(value) {
  const date = parseDateValue(value);

  if (!date) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const differenceInDays = Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
  );

  return differenceInDays >= -30 && differenceInDays <= 30;
}

function formatCellValue(column, row) {
  const value = row[column.key];
  const isDateColumn =
    column.key === "depart" ||
    column.key === "date" ||
    column.key === "date_depart" ||
    column.key === "date_arrivee";

  if (isDateColumn) {
    const rawValue = row[`${column.key}_raw`] ?? value;
    const formattedValue = formatDateFr(rawValue) || value;

    if (!String(rawValue ?? "").trim()) {
      return value;
    }

    return isDateWithinDepartureWindow(rawValue) ? (
      <span className="date-alert">{formattedValue}</span>
    ) : (
      formattedValue
    );
  }

  return value;
}

export default function DataTable({ columns, data }) {
  return (
    <div className="table-wrapper rh-table-wrapper">
      <table className="data-table rh-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length > 0 ? (
            data.map((row, index) => (
              <tr key={row.id ?? index}>
                {columns.map((column) => (
                  <td key={column.key}>{formatCellValue(column, row)}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length}>{`Aucune donn\u00e9e disponible`}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
