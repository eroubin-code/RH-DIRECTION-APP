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

async function queryRows(sql, params = []) {
  const currentPool = await getPool();
  const [rows] = await currentPool.query(sql, params);
  return normalizeRows(rows);
}

function normalizeSnapshotDate(value) {
  const normalizedValue = String(value ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    throw new Error("Date d'arrete invalide.");
  }

  return normalizedValue;
}

function inferSex(civilite) {
  const normalizedCivilite = String(civilite ?? "").trim().toLowerCase();

  if (normalizedCivilite.startsWith("mme")) {
    return "Femme";
  }

  if (normalizedCivilite.startsWith("m")) {
    return "Homme";
  }

  return "Non renseigne";
}

function inferStatus(fonction, typePersonne) {
  const normalizedFunction = String(fonction ?? "").trim().toLowerCase();
  const normalizedType = String(typePersonne ?? "").trim().toLowerCase();

  if (normalizedFunction.includes("post-doc")) {
    return "Post-doc";
  }

  if (
    normalizedFunction.includes("postdoctor") ||
    normalizedFunction.includes("post doctor")
  ) {
    return "Post-doc";
  }

  if (normalizedFunction.includes("doctorant")) {
    return "PhD";
  }

  if (normalizedFunction.includes("stagiaire")) {
    return "Stagiaire";
  }

  if (normalizedFunction.includes("group leader")) {
    return "Group Leader";
  }

  if (normalizedFunction.includes("ingenieur")) {
    return "Ingenieur";
  }

  if (normalizedFunction.includes("technicien")) {
    return "Technicien";
  }

  if (normalizedFunction.includes("agent")) {
    return "Agent";
  }

  if (normalizedFunction.includes("enseignant")) {
    return "Enseignant-Chercheur";
  }

  if (normalizedFunction.includes("chercheur")) {
    return "Chercheur";
  }

  if (String(fonction ?? "").trim()) {
    return String(fonction).trim();
  }

  if (normalizedType === "startup") {
    return "Non renseigne";
  }

  if (String(typePersonne ?? "").trim()) {
    return String(typePersonne).trim();
  }

  return "Non renseigne";
}

function inferTutelle(tutelle, typePersonne, rattachement, rattachementTypes) {
  const normalizedTutelle = String(tutelle ?? "").trim();
  const normalizedType = String(typePersonne ?? "").trim().toLowerCase();
  const normalizedRattachement = String(rattachement ?? "").trim().toLowerCase();
  const normalizedRattachementTypes = String(rattachementTypes ?? "")
    .trim()
    .toLowerCase();

  if (
    normalizedType === "startup" ||
    normalizedRattachement.includes("startup:") ||
    normalizedRattachementTypes.includes("startup")
  ) {
    return "Startup";
  }

  if (normalizedTutelle) {
    return normalizedTutelle;
  }

  return "Non renseignee";
}

function bucketTutelle(tutelle) {
  const normalizedTutelle = String(tutelle ?? "").trim().toLowerCase();

  if (!normalizedTutelle) {
    return "Autre";
  }

  if (
    normalizedTutelle === "non renseignee" ||
    normalizedTutelle === "iecb"
  ) {
    return "Autre";
  }

  return tutelle;
}

function buildCountRows(rows) {
  return Object.entries(
    rows.reduce((accumulator, row) => {
      const label = String(row ?? "").trim() || "Non renseigne";
      accumulator[label] = (accumulator[label] ?? 0) + 1;
      return accumulator;
    }, {})
  )
    .map(([label, count]) => ({ label, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.label.localeCompare(right.label, "fr")
    );
}

function bucketFunction(fonction) {
  const normalizedFunction = String(fonction ?? "").trim().toLowerCase();

  if (
    normalizedFunction.includes("post") ||
    normalizedFunction.includes("post-doc") ||
    normalizedFunction.includes("post-doctor") ||
    normalizedFunction.includes("postdoctor") ||
    normalizedFunction.includes("post doctor") ||
    normalizedFunction.includes("postdoctoral")
  ) {
    return "Post-docs";
  }

  if (normalizedFunction.includes("doctorant")) {
    return "Doctorants";
  }

  if (normalizedFunction.includes("stagiaire")) {
    return "Stagiaires";
  }

  return "Autres";
}

function buildFunctionBuckets(rows) {
  const order = ["Doctorants", "Post-docs", "Stagiaires", "Autres"];
  const counts = rows.reduce((accumulator, row) => {
    const label = bucketFunction(row);
    accumulator[label] = (accumulator[label] ?? 0) + 1;
    return accumulator;
  }, {});

  return order.map((label) => ({
    label,
    count: counts[label] ?? 0
  }));
}

function inferEffectifTutelle(row) {
  const normalizedTutelle = String(row.tutelle ?? "").trim();
  const normalizedRattachement = String(row.entite ?? "").trim().toLowerCase();

  if (normalizedRattachement.includes("start up") || normalizedRattachement.includes("startup")) {
    return "Startup";
  }

  if (!normalizedTutelle || normalizedTutelle.toLowerCase() === "iecb") {
    return "Autre";
  }

  return normalizedTutelle;
}

async function readMysqlAnnualSnapshot(snapshotDate) {
  const normalizedSnapshotDate = normalizeSnapshotDate(snapshotDate);
  const rows = await queryRows(
    [
      "SELECT",
      "  p.id,",
      "  p.civilite,",
      "  p.nom,",
      "  p.prenom,",
      "  p.pays AS nationalite,",
      "  COALESCE(NULLIF(tup.description, ''), tup.nom, '') AS tutelle,",
      "  p.fonction,",
      "  p.arrivee AS date_arrivee,",
      "  p.depart AS date_depart,",
      "  COALESCE(tp.nom, '') AS type_personne,",
      "  COALESCE(",
      "    GROUP_CONCAT(",
      "      DISTINCT CASE",
      "        WHEN COALESCE(te.nom, '') = 'exterieur' THEN NULL",
      "        WHEN COALESCE(te.nom, '') = 'unite' THEN CONCAT('UAR: ', e.nom)",
      "        WHEN COALESCE(te.nom, '') = 'equipe' THEN CONCAT('Equipe: ', e.nom)",
      "        WHEN COALESCE(te.nom, '') = 'unitesupport' THEN CONCAT('Unite de support: ', e.nom)",
      "        WHEN COALESCE(te.nom, '') = 'societe' THEN CONCAT('Societe: ', e.nom)",
      "        WHEN COALESCE(te.nom, '') = 'startup' OR COALESCE(te.nom, '') = 'Startup' THEN CONCAT('Startup: ', e.nom)",
      "        ELSE CONCAT(COALESCE(NULLIF(te.description, ''), te.nom), ': ', e.nom)",
      "      END",
      "      ORDER BY e.nom SEPARATOR ' | '",
      "    ),",
      "    ''",
      "  ) AS rattachement,",
      "  COALESCE(",
      "    GROUP_CONCAT(",
      "      DISTINCT CASE",
      "        WHEN COALESCE(te.nom, '') = 'exterieur' THEN NULL",
      "        ELSE COALESCE(NULLIF(te.description, ''), te.nom)",
      "      END",
      "      ORDER BY e.nom SEPARATOR ' | '",
      "    ),",
      "    ''",
      "  ) AS rattachement_types",
      "FROM personnes AS p",
      "LEFT JOIN typesPersonnes AS tp ON tp.id = p.typesPersonne_id",
      "LEFT JOIN tutellesPersonnes AS tup ON tup.id = p.tutellesPersonne_id",
      "LEFT JOIN personnes_entites AS pe ON pe.personne_id = p.id",
      "LEFT JOIN entites AS e",
      "  ON e.id = pe.entite_id",
      "LEFT JOIN typesEntites AS te ON te.id = e.typesEntite_id",
      "WHERE (p.depart IS NULL OR p.depart >= ?)",
      "  AND COALESCE(p.civilite, '') <> ''",
      "  AND COALESCE(tp.nom, '') <> 'exterieur'",
      "  AND (e.id IS NULL OR COALESCE(te.nom, '') <> 'exterieur')",
      "GROUP BY",
      "  p.id, p.civilite, p.nom, p.prenom, p.pays, tup.nom, tup.description,",
      "  p.fonction, p.arrivee, p.depart, tp.nom",
      "ORDER BY p.nom, p.prenom"
    ].join(" "),
    [normalizedSnapshotDate]
  );

  const normalizedRows = rows.map((row) => {
    const statut = inferStatus(row.fonction, row.type_personne);
    const nationalite = String(row.nationalite ?? "").trim() || "Non renseignee";
    const rattachement = String(row.rattachement ?? "").trim() || "Non renseigne";
    const tutelle = inferTutelle(
      row.tutelle,
      row.type_personne,
      rattachement,
      row.rattachement_types
    );
    const sexe = inferSex(row.civilite);

    return {
      id: row.id,
      civilite: row.civilite,
      nom: row.nom,
      prenom: row.prenom,
      sexe,
      statut,
      fonction: String(row.fonction ?? "").trim() || "Non renseignee",
      nationalite,
      tutelle,
      rattachement,
      date_arrivee: row.date_arrivee,
      date_arrivee_raw: row.date_arrivee,
      date_depart: String(row.date_depart ?? "").trim() ? row.date_depart : "Permanent",
      date_depart_raw: row.date_depart,
      rattachement_types: row.rattachement_types
    };
  });

  return {
    snapshotDate: normalizedSnapshotDate,
    rows: normalizedRows,
    summary: {
      totalPersonnel: normalizedRows.length,
      sexes: buildCountRows(normalizedRows.map((row) => row.sexe)),
      statuses: buildCountRows(normalizedRows.map((row) => row.statut)),
      functions: buildFunctionBuckets(
        normalizedRows.map((row) => row.fonction)
      ),
      nationalities: buildCountRows(normalizedRows.map((row) => row.nationalite)),
      tutelles: buildCountRows(
        normalizedRows.map((row) => bucketTutelle(row.tutelle))
      ),
      rattachementTypes: buildCountRows(
        normalizedRows.flatMap((row) =>
          String(row.rattachement_types ?? "")
            .split(" | ")
            .map((value) => value.trim())
            .filter(Boolean)
        )
      )
    }
  };
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
      "  COALESCE(p.pays, '') AS nationalite,",
      "  COALESCE(NULLIF(tup.description, ''), tup.nom, '') AS tutelle,",
      "  p.depart AS date_depart",
      "FROM personnes AS p",
      "LEFT JOIN typesPersonnes AS tp ON tp.id = p.typesPersonne_id",
      "LEFT JOIN tutellesPersonnes AS tup ON tup.id = p.tutellesPersonne_id",
      "LEFT JOIN personnes_entites AS pe ON pe.personne_id = p.id",
      "LEFT JOIN entites AS e",
      "  ON e.id = pe.entite_id",
      "LEFT JOIN typesEntites AS te ON te.id = e.typesEntite_id",
      "WHERE (p.depart IS NULL OR p.depart >= CURDATE())",
      "  AND COALESCE(p.civilite, '') <> ''",
      "  AND COALESCE(tp.nom, '') <> 'exterieur'",
      "  AND (e.id IS NULL OR COALESCE(te.nom, '') <> 'exterieur')",
      "GROUP BY p.id, p.nom, p.prenom, p.fonction, p.civilite, p.pays, tup.nom, tup.description",
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

  const functionBuckets = buildFunctionBuckets(
    effectif.map((row) => row.fonction)
  );
  const sexBuckets = buildCountRows(
    effectif.map((row) => inferSex(row.civilite))
  );
  const entiteBuckets = buildCountRows(
    effectif.flatMap((row) =>
      String(row.entite ?? "")
        .split(" | ")
        .map((value) => value.trim())
        .filter(Boolean)
    )
  ).slice(0, 5);
  const qualityItems = [
    {
      label: "Nationalites non renseignees",
      value: effectif.filter(
        (row) => !String(row.nationalite ?? "").trim()
      ).length
    },
    {
      label: "Tutelles a completer",
      value: effectif.filter(
        (row) => inferEffectifTutelle(row) === "Autre"
      ).length
    },
    {
      label: "Fonctions non renseignees",
      value: effectif.filter(
        (row) => !String(row.fonction ?? "").trim()
      ).length
    },
    {
      label: "Personnes sans entite",
      value: effectif.filter(
        (row) => !String(row.entite ?? "").trim()
      ).length
    }
  ];
  const alerts = [
    {
      label: "Departs dans les 30 jours",
      value: departs.filter((row) => {
        const rawDate = String(row.depart ?? "").trim();

        if (!rawDate) {
          return false;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const target = new Date(rawDate.includes("T") ? rawDate : `${rawDate}T00:00:00`);

        if (Number.isNaN(target.getTime())) {
          return false;
        }

        target.setHours(0, 0, 0, 0);
        const differenceInDays = Math.round(
          (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );

        return differenceInDays >= 0 && differenceInDays <= 30;
      }).length
    },
    {
      label: "Startups suivies",
      value: entites.filter((row) =>
        String(row.type_entite ?? "").trim().toLowerCase() === "startup"
      ).length
    },
    {
      label: "Tutelles non renseignees",
      value: effectif.filter(
        (row) => inferEffectifTutelle(row) === "Autre"
      ).length
    }
  ];

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
    recentDeparts,
    alerts,
    functionBuckets,
    sexBuckets,
    entiteBuckets,
    qualityItems
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

export async function getAnnualSnapshotReport(snapshotDate) {
  const mode = appConfig.dataSource.mode.toLowerCase();

  if (mode !== "mysql") {
    throw new Error(
      "L'extraction annuelle n'est disponible qu'avec une connexion MySQL active."
    );
  }

  return readMysqlAnnualSnapshot(snapshotDate);
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
