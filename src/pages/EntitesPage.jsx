// Page qui presente les entites, leur responsable et leur effectif.
import { useEffect, useState } from "react";
import { getEffectif, getEntites } from "../services/api";

function normalizeTypeLabel(value) {
  return String(value ?? "").trim() || "Type non renseigne";
}

function splitEntites(value) {
  return String(value ?? "")
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
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

function isEquipeType(value) {
  return String(value ?? "").trim().toLocaleLowerCase() === "equipe";
}

const RESPONSABLES_BY_ENTITE = {
  ADMINFRA: "Fabienne LASTERE ITCAINA",
  INFORMATIQUE: "Eric ROUBIN",
  PLATEAUBS: "Brice KAUFFMANN"
};

const ENTITE_LABEL_OVERRIDES = {
  PLATEAUBS: "Plateformes scientifiques"
};

function getEntiteDisplayLabel(value) {
  const normalizedValue = String(value ?? "").trim();
  return ENTITE_LABEL_OVERRIDES[normalizedValue] ?? normalizedValue;
}

export default function EntitesPage() {
  const [rows, setRows] = useState([]);
  const [effectifRows, setEffectifRows] = useState([]);

  useEffect(() => {
    getEntites().then(setRows);
    getEffectif().then(setEffectifRows);
  }, []);

  const groupedRows = Object.values(
    rows.reduce((accumulator, row) => {
      const typeId = Number(row.type_entite_id ?? 9999);
      const groupKey = `${typeId}-${normalizeTypeLabel(row.type_entite)}`;

      if (!accumulator[groupKey]) {
        accumulator[groupKey] = {
          typeId,
          typeLabel: normalizeTypeLabel(row.type_entite),
          rows: [],
          totalEffectif: 0
        };
      }

      accumulator[groupKey].rows.push(row);
      accumulator[groupKey].totalEffectif += Number(row.effectif ?? 0);
      return accumulator;
    }, {})
  )
    .sort((left, right) => left.typeId - right.typeId)
    .map((group) => ({
      ...group,
      rows: [...group.rows].sort((left, right) =>
        getEntiteDisplayLabel(left.entite).localeCompare(
          getEntiteDisplayLabel(right.entite)
        )
      )
    }));

  function getMembersForEntite(entiteName) {
    return effectifRows
      .filter((row) => splitEntites(row.entite).includes(entiteName))
      .sort((left, right) => {
        const leftLabel = `${left.nom} ${left.prenom}`.trim();
        const rightLabel = `${right.nom} ${right.prenom}`.trim();
        return leftLabel.localeCompare(rightLabel);
      });
  }

  function getResponsableLabel(row, members) {
    const entityOverride = RESPONSABLES_BY_ENTITE[row.entite];

    if (entityOverride) {
      return entityOverride;
    }

    if (!isEquipeType(row.type_entite)) {
      return row.responsable || "Responsable non renseigné";
    }

    const leader = members.find(
      (member) =>
        String(member.fonction ?? "").trim().toLocaleLowerCase() ===
        "group leader"
    );

    if (!leader) {
      return row.responsable || "Responsable non renseigné";
    }

    return `${leader.prenom} ${leader.nom}`.trim();
  }

  return (
    <section className="content-card rh-panel rh-section">
      <div className="section-title">
        <h3 className="rh-panel-title">Entités</h3>
      </div>

      {groupedRows.length > 0 ? (
        <div className="entites-groups">
          {groupedRows.map((group) => (
            <details
              key={`${group.typeId}-${group.typeLabel}`}
              className="entites-type-group"
            >
              <summary className="entites-group-row">
                <div className="entites-group-header">
                  <span>{group.typeLabel}</span>
                  <span className="entites-group-meta">
                    <span className="entites-group-total">
                      {`${group.totalEffectif} personne(s)`}
                    </span>
                    <span className="effectif-filter-arrow" aria-hidden="true" />
                  </span>
                </div>
              </summary>

              <div className="entites-accordion-list">
                {group.rows.map((row) => {
                  const members = getMembersForEntite(row.entite);
                  const responsableLabel = getResponsableLabel(row, members);

                  return (
                    <details
                      key={`${group.typeId}-${row.entite}`}
                      className="entites-accordion-item"
                    >
                      <summary className="entites-accordion-summary">
                        <span className="entites-accordion-main">
                          <span className="entites-accordion-title">
                            {getEntiteDisplayLabel(row.entite)}
                          </span>
                          <span className="entites-accordion-subtitle">
                            {responsableLabel}
                          </span>
                        </span>
                        <span className="entites-accordion-meta">
                          <span className="entites-accordion-count">
                            {`${row.effectif} personne(s)`}
                          </span>
                          <span className="effectif-filter-arrow" aria-hidden="true" />
                        </span>
                      </summary>

                      <div className="table-wrapper rh-table-wrapper entites-detail-table">
                        <table className="data-table rh-table">
                          <thead>
                            <tr>
                              <th>Civilité</th>
                              <th>Nom</th>
                              <th>Prénom</th>
                              <th>Fonction</th>
                              <th>Date de départ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {members.length > 0 ? (
                              members.map((member) => (
                                <tr key={`${row.entite}-${member.id}`}>
                                  <td>{member.civilite || "-"}</td>
                                  <td>{member.nom}</td>
                                  <td>{member.prenom}</td>
                                  <td>{member.fonction || "-"}</td>
                                  <td>{formatDepartLabel(member.date_depart)}</td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan="5">Aucun détail disponible</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </details>
                  );
                })}
              </div>
            </details>
          ))}
        </div>
      ) : (
        <div className="table-wrapper rh-table-wrapper">
          <table className="data-table rh-table entites-table">
            <tbody>
              <tr>
                <td colSpan="3">Aucune entité disponible</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
