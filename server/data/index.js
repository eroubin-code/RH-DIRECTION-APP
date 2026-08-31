import { appConfig } from "../config.js";
import { rhData } from "./rhData.js";

let mysqlPromiseModule = null;
let pool = null;
const IECB_MAIL_DOMAIN = "iecb.u-bordeaux.fr";

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

async function getConnection() {
  const currentPool = await getPool();
  return currentPool.getConnection();
}

// Pool separe pour la base GLPI (glpi-9.4.3) : base distincte de iecbman2020,
// compte MySQL dedie en lecture seule (voir docs/CONFIGURATION.md, RH_GLPI_*).
let glpiPool = null;

async function getGlpiPool() {
  if (glpiPool) {
    return glpiPool;
  }

  const mysql = await loadMysqlModule();
  glpiPool = mysql.createPool({
    host: appConfig.glpi.host,
    port: appConfig.glpi.port,
    user: appConfig.glpi.user,
    password: appConfig.glpi.password,
    database: appConfig.glpi.database,
    charset: "utf8mb4",
    waitForConnections: true,
    connectionLimit: 2,
    queueLimit: 0
  });
  return glpiPool;
}

// Soumissions du formulaire GLPI "Inscription nouvel arrivant" (plugin
// Formcreator) pas encore importees dans rh_personnel_pending, pour
// pre-remplir la saisie RH sans re-taper les informations. Fonctionnalite
// optionnelle : sans compte GLPI configure, retourne simplement une liste vide
// plutot que d'echouer (RH app doit rester utilisable sans acces a GLPI).
export async function getGlpiNewArrivalSubmissions() {
  if (!appConfig.glpi.user || appConfig.dataSource.mode !== "mysql") {
    return [];
  }

  // Deux bases distinctes (glpi-9.4.3 / iecbman2020), deux comptes MySQL separes
  // (rh_glpi_reader n'a pas de droits sur iecbman2020) : le filtrage "deja
  // importe" ne peut pas se faire en une seule requete cote serveur MySQL, on le
  // fait en JS a partir des deux resultats.
  const currentPool = await getGlpiPool();
  const [answerRows] = await currentPool.query(
    [
      "SELECT fa.id AS formanswer_id, fa.request_date, q.name AS question, a.answer",
      "FROM glpi_plugin_formcreator_formanswers fa",
      "JOIN glpi_plugin_formcreator_answers a ON a.plugin_formcreator_formanswers_id = fa.id",
      "JOIN glpi_plugin_formcreator_questions q ON q.id = a.plugin_formcreator_questions_id",
      "WHERE fa.plugin_formcreator_forms_id = ?",
      "  AND fa.status = 'accepted'",
      "  AND fa.request_date >= (NOW() - INTERVAL 90 DAY)",
      "ORDER BY fa.id, q.order"
    ].join(" "),
    [appConfig.glpi.formId]
  );

  const alreadyImportedRows = await queryRows(
    "SELECT glpi_formanswer_id FROM rh_personnel_pending WHERE glpi_formanswer_id IS NOT NULL"
  );
  const alreadyImportedIds = new Set(
    alreadyImportedRows.map((row) => Number(row.glpi_formanswer_id))
  );

  const submissionsById = new Map();

  for (const row of answerRows) {
    if (!submissionsById.has(row.formanswer_id)) {
      submissionsById.set(row.formanswer_id, {
        glpiFormanswerId: row.formanswer_id,
        requestDate: row.request_date,
        civilite: "",
        nom: "",
        prenom: "",
        naissance: "",
        pays: "",
        tutelle: "",
        entite: "",
        fonction: "",
        arrivee: "",
        depart: "",
        isPermanent: null
      });
    }

    const submission = submissionsById.get(row.formanswer_id);
    const question = String(row.question ?? "").trim().toLowerCase();
    const answer = String(row.answer ?? "").trim();

    if (question.startsWith("civilité")) submission.civilite = answer;
    else if (question.startsWith("nom")) submission.nom = answer.toLocaleUpperCase("fr-FR");
    else if (question.startsWith("prénom")) submission.prenom = answer;
    else if (question.startsWith("date de naissance")) submission.naissance = answer;
    else if (question.startsWith("pays de naissance")) submission.pays = answer;
    else if (question.startsWith("tutelle")) submission.tutelle = answer;
    else if (question.startsWith("equipes")) submission.entite = answer;
    else if (question.startsWith("fonction")) submission.fonction = answer;
    else if (question.startsWith("date arrivée")) submission.arrivee = answer;
    else if (question.startsWith("date de départ")) submission.depart = answer;
    else if (question.startsWith("type de personnel")) {
      submission.isPermanent = answer.toLowerCase() === "personnel permanent";
    }
  }

  // On ne propose que les arrivees encore a venir (date d'arrivee >= aujourd'hui) :
  // les demandes GLPI dont la date est deja passee ne sont plus a importer. Une
  // date illisible est conservee par prudence (on ne masque pas ce qu'on ne sait
  // pas evaluer).
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  function isPastArrival(value) {
    const raw = String(value ?? "").trim();
    let date = null;

    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
      date = new Date(`${raw.slice(0, 10)}T00:00:00`);
    } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(raw)) {
      const [day, month, year] = raw.split("/");
      date = new Date(`${year}-${month}-${day}T00:00:00`);
    }

    return Boolean(date) && !Number.isNaN(date.getTime()) && date < startOfToday;
  }

  return [...submissionsById.values()].filter(
    (submission) =>
      !alreadyImportedIds.has(Number(submission.glpiFormanswerId)) &&
      !isPastArrival(submission.arrivee)
  );
}

// Demandeur (createur) d'une demande GLPI "Inscription nouvel arrivant" :
// { email, name } ou {} si introuvable / droits insuffisants (le compte
// rh_glpi_reader doit avoir SELECT sur glpi_users et glpi_useremails).
export async function getGlpiRequesterContact(formanswerId) {
  if (!formanswerId || !appConfig.glpi.user || appConfig.dataSource.mode !== "mysql") {
    return {};
  }

  try {
    const currentPool = await getGlpiPool();
    const [rows] = await currentPool.query(
      [
        "SELECT ue.email AS email,",
        "  TRIM(CONCAT(COALESCE(u.firstname, ''), ' ', COALESCE(u.realname, u.name))) AS name",
        "FROM glpi_plugin_formcreator_formanswers fa",
        "JOIN glpi_users u ON u.id = fa.requester_id",
        "LEFT JOIN glpi_useremails ue ON ue.users_id = u.id AND ue.is_default = 1",
        "WHERE fa.id = ? LIMIT 1"
      ].join(" "),
      [formanswerId]
    );

    const row = rows[0];
    if (!row || !String(row.email ?? "").trim()) {
      return {};
    }

    return { email: String(row.email).trim(), name: String(row.name ?? "").trim() };
  } catch (error) {
    console.warn(`[glpi] Demandeur #${formanswerId} non resolu : ${error.message}`);
    return {};
  }
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

function isStagiaireFunction(fonction) {
  return String(fonction ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .includes("stagiaire");
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

async function getUniquePersonUserId(connection, preferredUserId) {
  const baseUserId = String(preferredUserId ?? "").trim() || "personne";
  let candidateUserId = baseUserId;
  let suffix = 2;

  while (true) {
    const [rows] = await connection.query(
      "SELECT id FROM personnes WHERE userid = ? LIMIT 1",
      [candidateUserId]
    );

    if (rows.length === 0) {
      return candidateUserId;
    }

    candidateUserId = `${baseUserId}${suffix}`;
    suffix += 1;
  }
}

async function findTypePersonneId(connection, typePersonne) {
  const normalizedTypePersonne = String(typePersonne ?? "").trim();

  if (normalizedTypePersonne) {
    const [selectedRows] = await connection.query(
      [
        "SELECT id",
        "FROM typesPersonnes",
        "WHERE nom = ? OR description = ? OR id = ?",
        "ORDER BY id",
        "LIMIT 1"
      ].join(" "),
      [normalizedTypePersonne, normalizedTypePersonne, normalizedTypePersonne]
    );

    if (selectedRows[0]?.id) {
      return selectedRows[0].id;
    }
  }

  const [rows] = await connection.query(
    [
      "SELECT id",
      "FROM typesPersonnes",
      "WHERE LOWER(nom) IN ('employe', 'agent')",
      "ORDER BY CASE LOWER(nom) WHEN 'employe' THEN 0 WHEN 'agent' THEN 1 ELSE 2 END",
      "LIMIT 1"
    ].join(" ")
  );

  return rows[0]?.id ?? 1;
}

export async function getPersonnelTypes() {
  if (appConfig.dataSource.mode !== "mysql") {
    return [];
  }

  return queryRows(
    [
      "SELECT",
      "  id,",
      "  nom,",
      "  COALESCE(NULLIF(description, ''), nom) AS label",
      "FROM typesPersonnes",
      "ORDER BY id"
    ].join(" ")
  );
}

async function findTutelleId(connection, tutelle) {
  const normalizedTutelle = String(tutelle ?? "").trim();

  if (!normalizedTutelle) {
    return null;
  }

  const [rows] = await connection.query(
    [
      "SELECT id",
      "FROM tutellesPersonnes",
      "WHERE nom = ? OR description = ?",
      "ORDER BY id",
      "LIMIT 1"
    ].join(" "),
    [normalizedTutelle, normalizedTutelle]
  );

  return rows[0]?.id ?? null;
}

async function findEntiteId(connection, entite) {
  const normalizedEntite = String(entite ?? "").trim();

  if (!normalizedEntite) {
    return null;
  }

  const [rows] = await connection.query(
    "SELECT id FROM entites WHERE nom = ? ORDER BY id LIMIT 1",
    [normalizedEntite]
  );

  return rows[0]?.id ?? null;
}

export async function createPersonnel(personnel) {
  if (appConfig.dataSource.mode !== "mysql") {
    throw new Error("La creation de personnel necessite la base MySQL.");
  }

  const connection = await getConnection();

  try {
    await connection.beginTransaction();

    const typePersonneId = await findTypePersonneId(
      connection,
      personnel.typePersonne
    );
    const tutelleId = await findTutelleId(connection, personnel.tutelle);
    const entiteId = await findEntiteId(connection, personnel.entite);
    const uniqueUserId = await getUniquePersonUserId(connection, personnel.userid);

    if (!entiteId) {
      throw new Error("Entite introuvable.");
    }

    const [insertResult] = await connection.query(
      [
        "INSERT INTO personnes",
        "(",
        "  civilite, nom, prenom, naissance, pays, tutellesPersonne_id,",
        "  fonction, arrivee, depart, userid, mdp, typesPersonne_id,",
        "  contact_personne_id",
        ")",
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      ].join(" "),
      [
        personnel.civilite,
        personnel.nom,
        personnel.prenom,
        personnel.naissance || null,
        personnel.pays || null,
        tutelleId,
        personnel.fonction || null,
        personnel.arrivee || null,
        personnel.depart || null,
        uniqueUserId,
        personnel.password,
        typePersonneId,
        personnel.contactPersonneId || null
      ]
    );

    await connection.query(
      "INSERT INTO personnes_entites (personne_id, entite_id) VALUES (?, ?)",
      [insertResult.insertId, entiteId]
    );

    const email = isStagiaireFunction(personnel.fonction)
      ? null
      : `${uniqueUserId}@${IECB_MAIL_DOMAIN}`;

    if (email) {
      await connection.query(
        [
          "INSERT INTO messagerie",
          "(personne_id, email, alias, redirection, fin, typesMessagerie_id)",
          "VALUES (?, ?, NULL, NULL, NULL, NULL)"
        ].join(" "),
        [insertResult.insertId, email]
      );
    }

    await connection.commit();

    return {
      id: insertResult.insertId,
      civilite: personnel.civilite,
      nom: personnel.nom,
      prenom: personnel.prenom,
      fonction: personnel.fonction,
      typePersonne: personnel.typePersonne,
      entite: personnel.entite,
      userid: uniqueUserId,
      email
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

// File d'attente des saisies de nouveaux arrivants par un operateur_saisie, en
// attente de validation par un admin/operateur. Table dediee rh_personnel_pending
// dans iecbman2020 (hors schema gere par ce depot). MySQL uniquement, meme garde
// que createPersonnel : la saisie mock n'a pas de sens sans base a valider.
export async function createPendingPersonnel(entry) {
  if (appConfig.dataSource.mode !== "mysql") {
    throw new Error("La saisie de personnel necessite la base MySQL.");
  }

  const connection = await getConnection();

  try {
    const [insertResult] = await connection.query(
      [
        "INSERT INTO rh_personnel_pending",
        "(",
        "  civilite, nom, prenom, naissance, pays, fonction, type_personne,",
        "  entite, tutelle, arrivee, depart, badge_demande, numero_badge,",
        "  contact_personne_id, statut, submitted_by_username, glpi_formanswer_id",
        ")",
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'en_attente', ?, ?)"
      ].join(" "),
      [
        entry.civilite,
        entry.nom,
        entry.prenom,
        entry.naissance || null,
        entry.pays || null,
        entry.fonction || null,
        entry.typePersonne,
        entry.entite,
        entry.tutelle || null,
        entry.arrivee,
        entry.depart || null,
        entry.badgeDemande ? 1 : 0,
        entry.numeroBadge || null,
        entry.contactPersonneId || null,
        entry.submittedBy,
        entry.glpiFormanswerId || null
      ]
    );

    return { id: insertResult.insertId, ...entry, statut: "en_attente" };
  } finally {
    connection.release();
  }
}

export async function getPendingPersonnel({ statut, submittedBy } = {}) {
  if (appConfig.dataSource.mode !== "mysql") {
    throw new Error("La saisie de personnel necessite la base MySQL.");
  }

  const conditions = [];
  const params = [];

  if (statut) {
    conditions.push("statut = ?");
    params.push(statut);
  }

  if (submittedBy) {
    conditions.push("submitted_by_username = ?");
    params.push(submittedBy);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  return queryRows(
    `SELECT * FROM rh_personnel_pending ${whereClause} ORDER BY submitted_at DESC`.trim(),
    params
  );
}

export async function getPendingPersonnelById(id) {
  if (appConfig.dataSource.mode !== "mysql") {
    throw new Error("La saisie de personnel necessite la base MySQL.");
  }

  const rows = await queryRows(
    "SELECT * FROM rh_personnel_pending WHERE id = ? LIMIT 1",
    [id]
  );

  return rows[0] ?? null;
}

// Libelle "NOM Prenom" d'une personne de la base RH, pour affichage (ex. chef de
// groupe / contact sur la fiche d'arrivee). Chaine vide si introuvable ou hors MySQL.
export async function getPersonneLabel(id) {
  if (!id || appConfig.dataSource.mode !== "mysql") {
    return "";
  }

  const rows = await queryRows(
    "SELECT nom, prenom FROM personnes WHERE id = ? LIMIT 1",
    [id]
  );

  if (!rows[0]) {
    return "";
  }

  return `${String(rows[0].nom ?? "").trim()} ${String(rows[0].prenom ?? "").trim()}`.trim();
}

export async function markPendingPersonnelValidated(id, { decidedBy, createdPersonneId }) {
  if (appConfig.dataSource.mode !== "mysql") {
    throw new Error("La saisie de personnel necessite la base MySQL.");
  }

  const currentPool = await getPool();
  await currentPool.query(
    [
      "UPDATE rh_personnel_pending",
      "SET statut = 'validee', decided_by_username = ?, decided_at = NOW(), created_personne_id = ?",
      "WHERE id = ?"
    ].join(" "),
    [decidedBy, createdPersonneId, id]
  );
}

export async function markPendingPersonnelRejected(id, { decidedBy, comment }) {
  if (appConfig.dataSource.mode !== "mysql") {
    throw new Error("La saisie de personnel necessite la base MySQL.");
  }

  const currentPool = await getPool();
  await currentPool.query(
    [
      "UPDATE rh_personnel_pending",
      "SET statut = 'rejetee', decided_by_username = ?, decided_at = NOW(), decision_comment = ?",
      "WHERE id = ?"
    ].join(" "),
    [decidedBy, comment || null, id]
  );
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

function buildDepartureDateBuckets(rows) {
  const scopedRows = rows.filter((row) => {
    const normalizedFunction = String(row.fonction ?? "").trim().toLowerCase();
    return !normalizedFunction.includes("stagiaire");
  });
  const withDateCount = scopedRows.filter((row) =>
    String(row.date_depart_raw ?? "").trim()
  ).length;

  return [
    { label: "Contractuel", count: withDateCount },
    { label: "Titulaire", count: scopedRows.length - withDateCount }
  ];
}

function buildAssignmentUnitBuckets(rows) {
  return buildCountRows(
    rows.flatMap((row) =>
      String(row.unite_tutelle ?? "")
        .split(" | ")
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => value.toUpperCase())
    )
  );
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
      "  ) AS rattachement_types,",
      "  COALESCE(",
      "    GROUP_CONCAT(",
      "      DISTINCT NULLIF(TRIM(COALESCE(e.unite_tutelle, '')), '')",
      "      ORDER BY e.unite_tutelle SEPARATOR ' | '",
      "    ),",
      "    ''",
      "  ) AS unite_tutelle",
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
      rattachement_types: row.rattachement_types,
      unite_tutelle: row.unite_tutelle
    };
  });

  return {
    snapshotDate: normalizedSnapshotDate,
    rows: normalizedRows,
    summary: {
      totalPersonnel: normalizedRows.length,
      sexes: buildCountRows(normalizedRows.map((row) => row.sexe)),
      statuses: buildCountRows(normalizedRows.map((row) => row.statut)),
      departureDates: buildDepartureDateBuckets(normalizedRows),
      functions: buildFunctionBuckets(
        normalizedRows.map((row) => row.fonction)
      ),
      assignmentUnits: buildAssignmentUnitBuckets(normalizedRows),
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
      "  COALESCE(",
      "    GROUP_CONCAT(",
      "      DISTINCT NULLIF(TRIM(COALESCE(e.unite_tutelle, '')), '')",
      "      ORDER BY e.unite_tutelle SEPARATOR ' | '",
      "    ),",
      "    ''",
      "  ) AS unite_tutelle,",
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

async function readMysqlPhishingCandidates(limit) {
  const rows = await queryRows(
    [
      "SELECT",
      "  p.id,",
      "  p.nom,",
      "  p.prenom,",
      "  COALESCE(p.civilite, '') AS civilite,",
      "  COALESCE(p.fonction, '') AS fonction,",
      "  COALESCE(",
      "    GROUP_CONCAT(DISTINCT e.nom ORDER BY e.nom SEPARATOR ' | '),",
      "    ''",
      "  ) AS entite,",
      "  COALESCE(",
      "    MAX(CASE WHEN m.fin IS NULL OR m.fin >= CURDATE() THEN m.email END),",
      "    ''",
      "  ) AS email",
      "FROM personnes AS p",
      "LEFT JOIN typesPersonnes AS tp ON tp.id = p.typesPersonne_id",
      "LEFT JOIN personnes_entites AS pe ON pe.personne_id = p.id",
      "LEFT JOIN entites AS e ON e.id = pe.entite_id",
      "LEFT JOIN typesEntites AS te ON te.id = e.typesEntite_id",
      "LEFT JOIN messagerie AS m ON m.personne_id = p.id",
      "WHERE (p.depart IS NULL OR p.depart >= CURDATE())",
      "  AND COALESCE(tp.nom, '') <> 'exterieur'",
      "  AND (e.id IS NULL OR COALESCE(te.nom, '') <> 'exterieur')",
      "GROUP BY p.id, p.nom, p.prenom, p.civilite, p.fonction",
      "HAVING COALESCE(email, '') <> ''",
      "ORDER BY p.nom, p.prenom",
      "LIMIT ?"
    ].join(" "),
    [limit]
  );

  return rows;
}

async function readMysqlDeparts() {
  const rows = await queryRows(
    [
      "SELECT",
      "  d.nom,",
      "  d.prenom,",
      "  COALESCE(p.fonction, '') AS fonction,",
      "  d.depart,",
      "  d.entite,",
      "  d.badge,",
      "  CASE",
      "    WHEN d.depart IS NULL THEN 'A completer'",
      "    WHEN d.depart < CURDATE() THEN 'Verifier restitution badge'",
      "    ELSE 'Preparer sortie et desactivation badge'",
      "  END AS action_recommandee",
      `FROM ${buildTableReference(appConfig.views.departs)} AS d`,
      "LEFT JOIN personnes AS p",
      "  ON p.nom = d.nom",
      "  AND p.prenom = d.prenom",
      "  AND (",
      "    p.depart = d.depart",
      "    OR (p.depart IS NULL AND d.depart IS NULL)",
      "  )",
      "WHERE d.depart BETWEEN CURDATE() - INTERVAL 30 DAY AND CURDATE() + INTERVAL 30 DAY",
      "ORDER BY d.depart ASC, d.nom ASC"
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
      "  COALESCE(NULLIF(TRIM(e.unite_tutelle), ''), '') AS unite_tutelle,",
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
  const startupCount = entites.filter((row) =>
    String(row.type_entite ?? "").trim().toLowerCase() === "startup"
  ).length;

  const functionBuckets = buildFunctionBuckets(
    effectif.map((row) => row.fonction)
  );
  const tutelleBuckets = buildCountRows(
    effectif.map((row) => inferEffectifTutelle(row))
  ).slice(0, 5);
  const assignmentUnits = buildCountRows(
    effectif.flatMap((row) =>
      String(row.unite_tutelle ?? "")
        .split(" | ")
        .map((value) => value.trim())
        .filter(Boolean)
        .map((value) => value.toUpperCase())
    )
  ).slice(0, 5);
  const assignmentGroups = Object.values(
    entites.reduce((accumulator, row) => {
      const typeLabel = String(row.type_entite ?? "").trim().toLowerCase();
      const unitLabel = String(row.unite_tutelle ?? "").trim().toUpperCase();
      const entiteLabel = String(row.entite ?? "").trim();

      if (typeLabel !== "equipe" || !unitLabel || !entiteLabel) {
        return accumulator;
      }

      if (!accumulator[unitLabel]) {
        accumulator[unitLabel] = {
          label: unitLabel,
          items: []
        };
      }

      if (!accumulator[unitLabel].items.includes(entiteLabel)) {
        accumulator[unitLabel].items.push(entiteLabel);
      }

      return accumulator;
    }, {})
  )
    .map((group) => ({
      ...group,
      items: group.items.sort((left, right) => left.localeCompare(right, "fr"))
    }))
    .sort((left, right) => left.label.localeCompare(right.label, "fr"));
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
      value: startupCount
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
    tutelleBuckets,
    assignmentUnits,
    assignmentGroups,
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

export async function getPhishingCandidates(limit = 50) {
  const normalizedLimit = Math.max(1, Number(limit) || 50);
  const mode = appConfig.dataSource.mode.toLowerCase();

  if (mode !== "mysql") {
    return rhData.effectif
      .slice(0, normalizedLimit)
      .map((row, index) => ({
        id: row.id ?? index + 1,
        civilite: row.civilite ?? "",
        nom: row.nom ?? "",
        prenom: row.prenom ?? "",
        fonction: row.fonction ?? "",
        entite: row.entite ?? "",
        email: `${String(row.prenom ?? "personne")
          .trim()
          .toLowerCase()}.${String(row.nom ?? "demo")
          .trim()
          .toLowerCase()}@${IECB_MAIL_DOMAIN}`
      }));
  }

  return readMysqlPhishingCandidates(normalizedLimit);
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
