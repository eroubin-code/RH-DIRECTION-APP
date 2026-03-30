// Tableau generique reutilisable pour afficher des lignes de donnees.
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
                  <td key={column.key}>{row[column.key]}</td>
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
