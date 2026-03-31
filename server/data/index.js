import { appConfig } from "../config.js";
import { rhData } from "./rhData.js";

let mysqlPromiseModule = null;
let pool = null;

function normalizeRows(rows) {
  return rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, value ?? ""])
    )
  );
}

async function loadMysqlModule() {
  if (!mysqlPromiseModule) {
    mysqlPromiseModule = import("mysql2/promise");
  }

  return mysqlPromiseModule;
}

async function getPool() {
  if (pool) {
    return pool;
  }

  const mysql = await loadMysqlModule();
  pool = mysql.createPool(appConfig.dataSource.mysql);
  return pool;
}

function buildTableReference(viewName) {
  return `\`${viewName.replaceAll("`", "")}\``;
}

async function queryRows(sql) {
  const currentPool = await getPool();
  const [rows] = await currentPool.query(sql);
  return normalizeRows(rows);
}

async function readMysqlEffectif() {
  const rows = await queryRows(
    [
      "SELECT",
      "  p.id,",
      "  p.nom,",
      "  p.prenom,",
      "  '' AS categorie,",
      "  COALESCE(p.fonction, '') AS fonction,",
      "  COALESCE(",
      "    GROUP_CONCAT(DISTINCT e.nom ORDER BY e.nom SEPARATOR ' | '),",
      "    ''",
      "  ) AS entite,",
      "  '' AS badge,",
      "  '' AS statut_badge,",
      "  p.civilite AS civilite,",
      "  p.depart AS date_depart",
      "FROM personnes AS p",
      "LEFT JOIN typesPersonnes AS tp ON tp.id = p.typesPersonne_id",
      "LEFT JOIN personnes_entites AS pe ON pe.personne_id = p.id",
      "LEFT JOIN entites AS e",
      "  ON e.id = pe.entite_id",
      "LEFT JOIN typesEntites AS te ON te.id = e.typesEntite_id",
      "WHERE (p.depart IS NULL OR p.depart >= CURDATE())",
      "  AND COALESCE(p.civilite, '') <> ''",
      "  AND COALESCE(tp.nom, '') <> 'exterieur'",
      "  AND (e.id IS NULL OR COALESCE(te.nom, '') <> 'exterieur')",
      "GROUP BY p.id, p.nom, p.prenom, p.fonction, p.civilite",
      "ORDER BY p.nom, p.prenom"
    ].join(" ")
  );

  return rows;
}

async function readMysqlDeparts() {
  const rows = await queryRows(
    [
      "SELECT",
      "  nom,",
      "  prenom,",
      "  depart,",
      "  entite,",
      "  badge,",
      "  CASE",
      "    WHEN depart IS NULL THEN 'A completer'",
      "    WHEN depart < CURDATE() THEN 'Verifier restitution badge'",
      "    ELSE 'Preparer sortie et desactivation badge'",
      "  END AS action_recommandee",
      `FROM ${buildTableReference(appConfig.views.departs)}`,
      "WHERE depart BETWEEN CURDATE() - INTERVAL 30 DAY AND CURDATE() + INTERVAL 30 DAY",
      "ORDER BY depart ASC, nom ASC"
    ].join(" ")
  );

  return rows;
}

async function readMysqlBadges() {
  const rows = await queryRows(
    [
      "SELECT",
      "  nom,",
      "  prenom,",
      "  badge,",
      "  'Oui' AS interne,",
      "  'Badge acces' AS type_carte,",
      "  CASE",
      "    WHEN badge IS NULL OR badge = '' THEN 'Sans badge'",
      "    WHEN depart IS NOT NULL AND depart <= CURDATE() THEN 'A desactiver'",
      "    WHEN depart IS NOT NULL THEN 'A restituer'",
      "    ELSE 'Actif'",
      "  END AS statut",
      `FROM ${buildTableReference(appConfig.views.departs)}`,
      "ORDER BY nom, prenom"
    ].join(" ")
  );

  return rows;
}

async function readMysqlEntites() {
  const rows = await queryRows(
    [
      "SELECT",
      "  te.id AS type_entite_id,",
      "  COALESCE(NULLIF(te.description, ''), te.nom) AS type_entite,",
      "  e.nom AS entite,",
      "  '' AS responsable,",
      "  COUNT(DISTINCT p.id) AS effectif",
      "FROM entites AS e",
      "LEFT JOIN personnes_entites AS pe ON pe.entite_id = e.id",
      "LEFT JOIN personnes AS p ON p.id = pe.personne_id",
      "LEFT JOIN typesPersonnes AS tp ON tp.id = p.typesPersonne_id",
      "LEFT JOIN typesEntites AS te ON te.id = e.typesEntite_id",
      "WHERE (p.depart IS NULL OR p.depart >= CURDATE())",
      "  AND COALESCE(tp.nom, '') <> 'exterieur'",
      "  AND COALESCE(te.nom, '') <> 'exterieur'",
      "GROUP BY e.id, e.nom, te.id, te.nom, te.description",
      "HAVING COUNT(DISTINCT p.id) > 0",
      "ORDER BY te.id ASC, e.nom ASC"
    ].join(" ")
  );

  return rows;
}

function computeDashboard({ effectif, departs, badges, entites }) {
  const typeEntiteLabels = Object.entries(
    entites.reduce((accumulator, row) => {
      const label = String(row.type_entite ?? "").trim();

      if (!label) {
        return accumulator;
      }

      accumulator[label] = (accumulator[label] ?? 0) + 1;
      return accumulator;
    }, {})
  )
    .sort(([leftLabel], [rightLabel]) => leftLabel.localeCompare(rightLabel))
    .map(([label, count]) => `${label}: ${count}`);

  const recentDeparts = [...departs]
    .sort((left, right) => String(left.depart).localeCompare(String(right.depart)))
    .slice(0, 5)
    .map((row, index) => ({
      id: row.id ?? `depart-${index}`,
      nom: row.nom,
      prenom: row.prenom,
      date: row.depart,
      entite: row.entite
    }));

  const activeBadgesCount = badges.filter((row) =>
    String(row.statut).toLowerCase().includes("actif")
  ).length;

  return {
    kpis: [
      { label: "Effectif total", value: effectif.length, sub: "Suivi en temps reel" },
      { label: "Departs a suivre", value: departs.length, sub: "Perimetre a 30 jours" },
      { label: "Badges actifs", value: activeBadgesCount, sub: "Statut badges en cours" },
      {
        label: "Entites suivies",
        value: entites.length,
        sub: typeEntiteLabels.length
          ? typeEntiteLabels
          : ["Types d'entité suivis"]
      }
    ],
    recentDeparts
  };
}

export async function getRhDataset() {
  const mode = appConfig.dataSource.mode.toLowerCase();

  if (mode !== "mysql") {
    return {
      source: "mock",
      dashboard: rhData.dashboard,
      effectif: rhData.effectif,
      departs: rhData.departs,
      badges: rhData.badges,
      entites: rhData.entites
    };
  }

  const [effectif, departs, badges, entites] = await Promise.all([
    readMysqlEffectif(),
    readMysqlDeparts(),
    readMysqlBadges(),
    readMysqlEntites()
  ]);

  return {
    source: "mysql",
    dashboard: computeDashboard({ effectif, departs, badges, entites }),
    effectif,
    departs,
    badges,
    entites
  };
}

export async function getDataStatus() {
  const mode = appConfig.dataSource.mode.toLowerCase();

  if (mode !== "mysql") {
    return {
      mode: "mock",
      connected: false
    };
  }

  try {
    const currentPool = await getPool();
    await currentPool.query("SELECT 1");

    return {
      mode: "mysql",
      connected: true,
      database: appConfig.dataSource.mysql.database,
      host: appConfig.dataSource.mysql.host,
      views: appConfig.views
    };
  } catch (error) {
    return {
      mode: "mysql",
      connected: false,
      database: appConfig.dataSource.mysql.database,
      host: appConfig.dataSource.mysql.host,
      views: appConfig.views,
      error: error.message
    };
  }
}
