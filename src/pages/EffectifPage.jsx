// Page qui liste l'effectif et les informations principales des collaborateurs.
import { useEffect, useState } from "react";
import DataTable from "../components/DataTable";
import { getEffectif, getEntites } from "../services/api";

function toggleValueInList(values, targetValue) {
  return values.includes(targetValue)
    ? values.filter((value) => value !== targetValue)
    : [...values, targetValue];
}

function normalizeLabel(value, fallbackLabel = "Non renseigne") {
  return String(value ?? "").trim() || fallbackLabel;
}

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

function formatDepartLabel(value) {
  const normalizedValue = String(value ?? "").trim();
  return normalizedValue ? formatDateFr(normalizedValue) : "Permanent";
}

function sortRows(rows, sortBy, order) {
  const direction = order === "desc" ? -1 : 1;

  return [...rows].sort((left, right) => {
    const leftValue = normalizeLabel(left[sortBy], "").toLocaleLowerCase();
    const rightValue = normalizeLabel(right[sortBy], "").toLocaleLowerCase();

    if (leftValue < rightValue) {
      return -1 * direction;
    }

    if (leftValue > rightValue) {
      return 1 * direction;
    }

    return 0;
  });
}

export default function EffectifPage() {
  const [rows, setRows] = useState([]);
  const [entiteRows, setEntiteRows] = useState([]);
  const [search, setSearch] = useState("");
  const [selectedEntites, setSelectedEntites] = useState([]);
  const [selectedFonctions, setSelectedFonctions] = useState([]);
  const [sortBy, setSortBy] = useState("nom");
  const [sortOrder, setSortOrder] = useState("asc");
  const [groupBy, setGroupBy] = useState("none");

  useEffect(() => {
    getEffectif().then(setRows);
    getEntites().then(setEntiteRows);
  }, []);

  const columns = [
    { key: "civilite", label: "Civilité" },
    { key: "nom", label: "Nom" },
    { key: "prenom", label: "Prénom" },
    { key: "fonction", label: "Fonction" },
    { key: "entite", label: "Entité" },
    { key: "date_depart", label: "Date de départ" }
  ];

  const entites = [...new Set(rows.map((row) => normalizeLabel(row.entite)))].sort();
  const fonctions = [...new Set(rows.map((row) => normalizeLabel(row.fonction)))].sort();

  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredRows = rows.filter((row) => {
    const entiteLabel = normalizeLabel(row.entite);
    const fonctionLabel = normalizeLabel(row.fonction);
    const matchesEntite =
      selectedEntites.length === 0 || selectedEntites.includes(entiteLabel);
    const matchesFonction =
      selectedFonctions.length === 0 || selectedFonctions.includes(fonctionLabel);
    const searchableText = [
      row.civilite,
      row.nom,
      row.prenom,
      fonctionLabel,
      entiteLabel
    ]
      .join(" ")
      .toLocaleLowerCase();
    const matchesSearch =
      !normalizedSearch || searchableText.includes(normalizedSearch);

    return matchesEntite && matchesFonction && matchesSearch;
  });

  const sortedRows = sortRows(filteredRows, sortBy, sortOrder).map((row) => ({
    ...row,
    fonction: normalizeLabel(row.fonction),
    entite: normalizeLabel(row.entite),
    date_depart_raw: row.date_depart,
    date_depart: formatDepartLabel(row.date_depart)
  }));

  const groupedRows =
    groupBy === "none"
      ? []
      : Object.entries(
          sortedRows.reduce((accumulator, row) => {
            const key = groupBy === "fonction" ? row.fonction : row.entite;
            accumulator[key] = accumulator[key] ?? [];
            accumulator[key].push(row);
            return accumulator;
          }, {})
        )
          .map(([label, members]) => ({ label, effectif: members.length, members }))
          .filter((group) => group.effectif > 0)
          .sort((left, right) => {
            const direction = sortOrder === "desc" ? -1 : 1;
            return left.label.localeCompare(right.label) * direction;
          });

  const entiteTypeByName = entiteRows.reduce((accumulator, row) => {
    accumulator[String(row.entite ?? "").trim()] = normalizeLabel(
      row.type_entite,
      "Type non renseigne"
    );
    return accumulator;
  }, {});

  const groupedEntiteTypeRows =
    groupBy !== "entite"
      ? []
      : Object.values(
          groupedRows.reduce((accumulator, group) => {
            const typeLabel = entiteTypeByName[group.label] ??
              (group.label.includes("|")
                ? "Rattachements multiples"
                : "Type non renseigne");

            if (!accumulator[typeLabel]) {
              accumulator[typeLabel] = {
                typeLabel,
                totalEffectif: 0,
                groups: []
              };
            }

            accumulator[typeLabel].groups.push(group);
            accumulator[typeLabel].totalEffectif += group.effectif;
            return accumulator;
          }, {})
        ).sort((left, right) => {
          const direction = sortOrder === "desc" ? -1 : 1;
          return left.typeLabel.localeCompare(right.typeLabel) * direction;
        });

  function handleEntiteToggle(entite) {
    setSelectedEntites((currentValues) => toggleValueInList(currentValues, entite));
  }

  function handleFonctionToggle(fonction) {
    setSelectedFonctions((currentValues) =>
      toggleValueInList(currentValues, fonction)
    );
  }

  function resetFilters() {
    setSearch("");
    setSelectedEntites([]);
    setSelectedFonctions([]);
    setSortBy("nom");
    setSortOrder("asc");
    setGroupBy("none");
  }

  return (
    <section className="content-card rh-panel rh-section">
      <div className="section-title">
        <h3 className="rh-panel-title">Effectif</h3>
        <span className="effectif-meta">{`${filteredRows.length} collaborateur(s)`}</span>
      </div>

      <div className="effectif-toolbar">
        <label className="effectif-search">
          <span>Recherche</span>
          <input
            type="search"
            placeholder="Nom, prenom, equipe, fonction"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        <label className="effectif-select">
          <span>Trier par</span>
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
            <option value="nom">Nom</option>
            <option value="prenom">Prenom</option>
            <option value="fonction">Fonction</option>
            <option value="entite">Entite</option>
          </select>
        </label>

        <label className="effectif-select">
          <span>Ordre</span>
          <select
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
          >
            <option value="asc">Croissant</option>
            <option value="desc">Decroissant</option>
          </select>
        </label>

        <label className="effectif-select">
          <span>Regrouper</span>
          <select value={groupBy} onChange={(event) => setGroupBy(event.target.value)}>
            <option value="none">Aucun</option>
            <option value="entite">Par entite</option>
            <option value="fonction">Par fonction</option>
          </select>
        </label>

        <button className="effectif-reset" type="button" onClick={resetFilters}>
          Reinitialiser
        </button>
      </div>

      <div className="effectif-filters-grid">
        <details className="effectif-filter-card">
          <summary>
            <span>{`Entites (${selectedEntites.length || "toutes"})`}</span>
            <span className="effectif-filter-arrow" aria-hidden="true" />
          </summary>
          <div className="effectif-filter-options">
            {entites.map((entite) => (
              <label key={entite} className="effectif-check">
                <input
                  type="checkbox"
                  checked={selectedEntites.includes(entite)}
                  onChange={() => handleEntiteToggle(entite)}
                />
                <span>{entite}</span>
              </label>
            ))}
          </div>
        </details>

        <details className="effectif-filter-card">
          <summary>
            <span>{`Fonctions (${selectedFonctions.length || "toutes"})`}</span>
            <span className="effectif-filter-arrow" aria-hidden="true" />
          </summary>
          <div className="effectif-filter-options">
            {fonctions.map((fonction) => (
              <label key={fonction} className="effectif-check">
                <input
                  type="checkbox"
                  checked={selectedFonctions.includes(fonction)}
                  onChange={() => handleFonctionToggle(fonction)}
                />
                <span>{fonction}</span>
              </label>
            ))}
          </div>
        </details>
      </div>

      {groupBy === "none" ? (
        <DataTable columns={columns} data={sortedRows} />
      ) : groupBy === "entite" ? (
        <div className="effectif-type-groups">
          {groupedEntiteTypeRows.map((typeGroup) => (
            <details key={typeGroup.typeLabel} className="effectif-type-group-card">
              <summary className="effectif-type-group-summary">
                <span className="effectif-type-group-label">{typeGroup.typeLabel}</span>
                <span className="effectif-group-meta">
                  <span className="effectif-group-count">
                    {`${typeGroup.totalEffectif} personne(s)`}
                  </span>
                  <span className="effectif-filter-arrow" aria-hidden="true" />
                </span>
              </summary>

              <div className="effectif-groups">
                {typeGroup.groups.map((group) => (
                  <details key={group.label} className="effectif-group-card">
                    <summary className="effectif-group-summary">
                      <span className="effectif-group-label">{group.label}</span>
                      <span className="effectif-group-meta">
                        <span className="effectif-group-count">
                          {`${group.effectif} personne(s)`}
                        </span>
                        <span className="effectif-filter-arrow" aria-hidden="true" />
                      </span>
                    </summary>

                    <DataTable columns={columns} data={group.members} />
                  </details>
                ))}
              </div>
            </details>
          ))}
        </div>
      ) : (
        <div className="effectif-groups">
          {groupedRows.map((group) => (
            <details key={group.label} className="effectif-group-card">
              <summary className="effectif-group-summary">
                <span className="effectif-group-label">{group.label}</span>
                <span className="effectif-group-meta">
                  <span className="effectif-group-count">{`${group.effectif} personne(s)`}</span>
                  <span className="effectif-filter-arrow" aria-hidden="true" />
                </span>
              </summary>

              <DataTable columns={columns} data={group.members} />
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
