import crypto from "node:crypto";
import express from "express";
import { appConfig } from "./config.js";
import {
  createPendingPersonnel,
  createPersonnel,
  getAnnualSnapshotReport,
  getDataStatus,
  getGlpiNewArrivalSubmissions,
  getPendingPersonnel,
  getPendingPersonnelById,
  getPersonnelTypes,
  getRhDataset,
  markPendingPersonnelRejected,
  markPendingPersonnelValidated
} from "./data/index.js";
import { sendMail } from "./mailer.js";
import { runArrivalNotifierCheck } from "./arrivalNotifier.js";
import {
  createUser,
  hashPassword,
  updateUserPassword,
  USER_ROLES,
  users
} from "./data/users.js";
import {
  activateAwarenessCampaign,
  buildAwarenessReportCsv,
  buildAwarenessReportPdf,
  cancelAwarenessCampaign,
  cleanupAwarenessData,
  createAwarenessGroup,
  createAwarenessTemplate,
  createAwarenessCampaign,
  dispatchDueAwarenessCampaigns,
  excludeAwarenessRecipients,
  getAwarenessDashboard,
  getAwarenessCampaign,
  handleAwarenessClick,
  handleAwarenessReport,
  handleAwarenessUnsubscribe,
  importAwarenessRecipientsFromCsv,
  importAwarenessRecipientsFromGroup,
  listAwarenessAuditEntries,
  listAwarenessGroups,
  listAwarenessCampaigns,
  listAwarenessTemplates,
  receiveCampaignProviderEvent,
  setAwarenessTemplate,
  setAwarenessTemplateFromLibrary,
  updateAwarenessGroup,
  updateAwarenessTemplate,
  updateAwarenessCampaign,
  validateAwarenessCampaign
} from "./awarenessCampaigns.js";
import { getCampaignProvider } from "./campaignProvider.js";

const app = express();
// Derriere le proxy Nginx local (voir docs/DEPLOYMENT.md), fait confiance uniquement
// au saut loopback pour lire l'adresse IP reelle du client via X-Forwarded-For.
// Sans ce reglage, request.ip vaut toujours l'adresse loopback de Nginx et les
// controles bases sur l'IP (isPrivateDashboardRequest) sont valides pour tout le monde.
app.set("trust proxy", "loopback");
const port = appConfig.port;
const sessions = new Map();
const loginAttempts = new Map();
const requestWindowBuckets = new Map();
const passwordResetCodes = new Map();
const SESSION_TTL_MS = appConfig.auth.sessionTtlMs;
const PASSWORD_RESET_CODE_TTL_MS = 15 * 60 * 1000;
const PASSWORD_RULE_MESSAGE =
  "Le mot de passe doit contenir au moins 8 caracteres, avec au moins une lettre, un chiffre et un caractere special.";

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    mustChangePassword: Boolean(user.mustChangePassword)
  };
}

function requireAuth(request, response, next) {
  const authorization = request.headers.authorization ?? "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;

  if (!token || !sessions.has(token)) {
    response.status(401).json({ message: "Authentification requise." });
    return;
  }

  const session = sessions.get(token);

  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    response.status(401).json({ message: "Session expiree." });
    return;
  }

  request.user = session.user;
  request.token = token;
  request.session = session;
  next();
}

function requireRole(allowedRoles) {
  return (request, response, next) => {
    if (!allowedRoles.includes(request.user?.role)) {
      response.status(403).json({ message: "Acces reserve." });
      return;
    }

    next();
  };
}

function isUsernameAvailable(username) {
  const normalizedUsername = username.toLocaleLowerCase();

  return !users.some(
    (user) => user.username.toLocaleLowerCase() === normalizedUsername
  );
}

function normalizeIdentifierPart(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLocaleLowerCase();
}

function buildPersonnelUserId(prenom, nom) {
  const prenomInitials = String(prenom ?? "")
    .trim()
    .split(/[\s'-]+/)
    .filter(Boolean)
    .map((part) => normalizeIdentifierPart(part).charAt(0))
    .join("");
  const normalizedNom = normalizeIdentifierPart(nom);

  if (prenomInitials && normalizedNom) {
    return `${prenomInitials}.${normalizedNom}`;
  }

  return `${prenomInitials}${normalizedNom}` || "personne";
}

function generatePersonnelPassword() {
  const lowercase = "abcdefghijkmnopqrstuvwxyz";
  const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const specials = "!@#$%&*?";
  const allCharacters = `${lowercase}${uppercase}${digits}${specials}`;
  const characters = [
    uppercase[crypto.randomInt(uppercase.length)],
    digits[crypto.randomInt(digits.length)],
    specials[crypto.randomInt(specials.length)]
  ];

  while (characters.length < 8) {
    characters.push(allCharacters[crypto.randomInt(allCharacters.length)]);
  }

  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(index + 1);
    [characters[index], characters[swapIndex]] = [
      characters[swapIndex],
      characters[index]
    ];
  }

  return characters.join("");
}

function normalizeDateInput(value) {
  const normalizedValue = String(value ?? "").trim();

  return /^\d{4}-\d{2}-\d{2}$/.test(normalizedValue) ? normalizedValue : "";
}

function isPasswordValid(password) {
  return (
    password.length >= 8 &&
    /[A-Za-z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

function normalizeCivilite(value) {
  const normalizedValue = String(value ?? "").trim().toLowerCase();

  if (normalizedValue === "madame" || normalizedValue === "mme") {
    return "Mme";
  }

  if (
    normalizedValue === "monsieur" ||
    normalizedValue === "m." ||
    normalizedValue === "m"
  ) {
    return "M.";
  }

  return "";
}

function normalizeUpperText(value) {
  return String(value ?? "").trim().toLocaleUpperCase("fr-FR");
}

function normalizePrenom(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("fr-FR")
    .replace(/(^|[\s'-])([\p{L}])/gu, (_match, separator, letter) =>
      `${separator}${letter.toLocaleUpperCase("fr-FR")}`
    );
}

function getLoginAttemptKey(request, username) {
  const remoteAddress = request.ip ?? request.socket?.remoteAddress ?? "unknown";
  return `${remoteAddress}:${String(username ?? "").toLocaleLowerCase()}`;
}

function getLoginAttempt(key) {
  const now = Date.now();
  const attempt = loginAttempts.get(key);

  if (!attempt || attempt.resetAt <= now) {
    const freshAttempt = { count: 0, resetAt: now + appConfig.auth.login.windowMs };
    loginAttempts.set(key, freshAttempt);
    return freshAttempt;
  }

  return attempt;
}

function recordFailedLogin(key) {
  const attempt = getLoginAttempt(key);
  attempt.count += 1;
}

function clearLoginAttempt(key) {
  loginAttempts.delete(key);
}

function revokeUserSessions(userId, exceptToken = null) {
  for (const [token, session] of sessions.entries()) {
    if (token !== exceptToken && Number(session.user?.id) === Number(userId)) {
      sessions.delete(token);
    }
  }
}

function sendServerError(response) {
  response.status(500).json({ message: "Erreur serveur." });
}

function generateCsrfToken() {
  return crypto.randomBytes(24).toString("hex");
}

function requireCsrf(request, response, next) {
  const expectedToken = request.session?.csrfToken;
  const headerName = appConfig.security.csrfHeaderName;
  const providedToken = request.headers[headerName];

  if (!expectedToken || providedToken !== expectedToken) {
    response.status(403).json({ message: "Jeton CSRF invalide." });
    return;
  }

  next();
}

function rateLimit(request, response, next) {
  const remoteAddress = request.ip ?? request.socket?.remoteAddress ?? "unknown";
  const now = Date.now();
  const bucket = requestWindowBuckets.get(remoteAddress);

  if (!bucket || bucket.resetAt <= now) {
    requestWindowBuckets.set(remoteAddress, {
      count: 1,
      resetAt: now + appConfig.security.requestWindowMs
    });
    next();
    return;
  }

  if (bucket.count >= appConfig.security.requestMaxPerWindow) {
    response.status(429).json({ message: "Trop de requetes. Merci de ralentir." });
    return;
  }

  bucket.count += 1;
  next();
}

function inferBaseUrl(request) {
  if (request) {
    return `${request.protocol}://${request.get("host")}`;
  }

  return appConfig.awareness.publicBaseUrl;
}

function sendHtml(response, html) {
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.status(200).send(html);
}

function sendDownload(response, filename, contentType, body) {
  response.setHeader("Content-Type", contentType);
  response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  response.status(200).send(body);
}

function isPrivateDashboardRequest(request) {
  const remoteAddress = String(
    request.ip ?? request.socket?.remoteAddress ?? ""
  ).toLowerCase();

  return (
    remoteAddress === "::1" ||
    remoteAddress === "127.0.0.1" ||
    remoteAddress.startsWith("::ffff:127.") ||
    remoteAddress.startsWith("172.16.") ||
    remoteAddress.startsWith("172.17.") ||
    remoteAddress.startsWith("172.18.") ||
    remoteAddress.startsWith("172.19.") ||
    remoteAddress.startsWith("172.20.") ||
    remoteAddress.startsWith("172.21.") ||
    remoteAddress.startsWith("172.22.") ||
    remoteAddress.startsWith("172.23.") ||
    remoteAddress.startsWith("172.24.") ||
    remoteAddress.startsWith("172.25.") ||
    remoteAddress.startsWith("172.26.") ||
    remoteAddress.startsWith("172.27.") ||
    remoteAddress.startsWith("172.28.") ||
    remoteAddress.startsWith("172.29.") ||
    remoteAddress.startsWith("172.30.") ||
    remoteAddress.startsWith("172.31.") ||
    remoteAddress.startsWith("::ffff:172.16.") ||
    remoteAddress.startsWith("::ffff:172.17.") ||
    remoteAddress.startsWith("::ffff:172.18.") ||
    remoteAddress.startsWith("::ffff:172.19.") ||
    remoteAddress.startsWith("::ffff:172.20.") ||
    remoteAddress.startsWith("::ffff:172.21.") ||
    remoteAddress.startsWith("::ffff:172.22.") ||
    remoteAddress.startsWith("::ffff:172.23.") ||
    remoteAddress.startsWith("::ffff:172.24.") ||
    remoteAddress.startsWith("::ffff:172.25.") ||
    remoteAddress.startsWith("::ffff:172.26.") ||
    remoteAddress.startsWith("::ffff:172.27.") ||
    remoteAddress.startsWith("::ffff:172.28.") ||
    remoteAddress.startsWith("::ffff:172.29.") ||
    remoteAddress.startsWith("::ffff:172.30.") ||
    remoteAddress.startsWith("::ffff:172.31.")
  );
}

// Defense en profondeur : meme si le filtrage IP echoue ou est mal configure,
// le dashboard public ne doit jamais exposer l'identite des personnes en depart.
function buildPublicDashboardPayload(dashboard) {
  return {
    ...dashboard,
    recentDeparts: (dashboard.recentDeparts ?? []).map((depart) => ({
      id: depart.id,
      date: depart.date,
      entite: depart.entite
    }))
  };
}

app.use((_request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "same-origin");
  response.setHeader("Cache-Control", "no-store");
  next();
});

app.use(rateLimit);
app.use(express.json({ limit: appConfig.security.jsonLimit }));

app.get("/api/health", async (_request, response) => {
  const dataStatus = await getDataStatus();
  const publicDataStatus = appConfig.security.exposeHealthDetails
    ? dataStatus
    : {
        mode: dataStatus.mode,
        connected: dataStatus.connected
      };

  response.json({
    status: "ok",
    dataSource: publicDataStatus
  });
});

app.post("/api/auth/login", (request, response) => {
  const { username, password } = request.body ?? {};
  const attemptKey = getLoginAttemptKey(request, username);
  const attempt = getLoginAttempt(attemptKey);

  if (attempt.count >= appConfig.auth.login.maxAttempts) {
    response.status(429).json({ message: "Trop de tentatives. Merci de reessayer plus tard." });
    return;
  }

  const user = users.find((entry) => entry.username === username);

  if (!user || hashPassword(password ?? "") !== user.passwordHash) {
    recordFailedLogin(attemptKey);
    response.status(401).json({ message: "Identifiants invalides." });
    return;
  }

  clearLoginAttempt(attemptKey);

  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, {
    user: sanitizeUser(user),
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL_MS,
    csrfToken: generateCsrfToken()
  });

  response.json({
    token,
    csrfToken: sessions.get(token).csrfToken,
    user: sanitizeUser(user)
  });
});

app.get("/api/auth/me", requireAuth, (request, response) => {
  response.json({ user: request.user, csrfToken: request.session.csrfToken });
});

app.post("/api/auth/logout", requireAuth, requireCsrf, (request, response) => {
  sessions.delete(request.token);
  response.status(204).end();
});

// Mot de passe oublie : demande un code envoye par email (l'identifiant doit
// ressembler a une adresse email, c'est deja la convention pour la plupart des
// comptes de ce depot). Reponse volontairement generique dans tous les cas
// (compte inexistant ou non-email) pour ne pas reveler quels identifiants
// existent. Reutilise le limiteur de tentatives de connexion (meme Map, cle
// prefixee) pour eviter l'abus d'envoi d'email.
app.post("/api/auth/request-password-reset", (request, response) => {
  const username = String(request.body?.username ?? "").trim();
  const attemptKey = `reset:${getLoginAttemptKey(request, username)}`;
  const attempt = getLoginAttempt(attemptKey);

  if (attempt.count >= appConfig.auth.login.maxAttempts) {
    response.status(429).json({ message: "Trop de demandes. Merci de reessayer plus tard." });
    return;
  }

  recordFailedLogin(attemptKey);

  const respondGeneric = () =>
    response.json({
      message:
        "Si un compte existe pour cet identifiant, un code de reinitialisation a ete envoye par email."
    });

  const user = users.find((entry) => entry.username === username);

  if (!user || !username.includes("@")) {
    respondGeneric();
    return;
  }

  const code = String(crypto.randomInt(100000, 1000000));
  passwordResetCodes.set(username, {
    code,
    userId: user.id,
    expiresAt: Date.now() + PASSWORD_RESET_CODE_TTL_MS,
    attempts: 0
  });

  sendMail({
    to: username,
    subject: "RH Direction App - Code de reinitialisation de mot de passe",
    text:
      `Voici votre code de reinitialisation de mot de passe : ${code}\n` +
      `Ce code est valable 15 minutes. Si vous n'etes pas a l'origine de cette demande, ignorez cet email.`
  }).catch((error) => {
    console.error("[auth/request-password-reset] Echec envoi email:", error.message);
  });

  respondGeneric();
});

app.post("/api/auth/reset-password-with-code", (request, response) => {
  const username = String(request.body?.username ?? "").trim();
  const code = String(request.body?.code ?? "").trim();
  const password = String(request.body?.password ?? "");
  const entry = passwordResetCodes.get(username);

  if (!entry || entry.expiresAt <= Date.now()) {
    passwordResetCodes.delete(username);
    response.status(400).json({ message: "Code invalide ou expire." });
    return;
  }

  entry.attempts += 1;

  if (entry.attempts > 5) {
    passwordResetCodes.delete(username);
    response.status(400).json({ message: "Trop de tentatives, redemandez un code." });
    return;
  }

  if (entry.code !== code) {
    response.status(400).json({ message: "Code invalide ou expire." });
    return;
  }

  if (!isPasswordValid(password)) {
    response.status(400).json({ message: PASSWORD_RULE_MESSAGE });
    return;
  }

  const user = updateUserPassword(entry.userId, hashPassword(password), {
    requireChange: false
  });
  passwordResetCodes.delete(username);
  revokeUserSessions(user.id);

  response.json({ message: "Mot de passe modifie. Vous pouvez vous connecter." });
});

// Changement de mot de passe volontaire par l'utilisateur lui-meme (notamment
// pour lever mustChangePassword apres une creation de compte ou une
// reinitialisation admin). Pas de verification de l'ancien mot de passe : la
// session authentifiee suffit, meme logique que la reinitialisation admin.
app.post("/api/auth/change-password", requireAuth, requireCsrf, (request, response) => {
  const password = String(request.body?.password ?? "");

  if (!isPasswordValid(password)) {
    response.status(400).json({ message: PASSWORD_RULE_MESSAGE });
    return;
  }

  const user = updateUserPassword(request.user.id, hashPassword(password), {
    requireChange: false
  });

  // La session en memoire garde sa propre copie de l'utilisateur (sanitizeUser
  // au login) : la rafraichir pour que mustChangePassword reflete le changement
  // sans attendre une reconnexion.
  request.session.user = sanitizeUser(user);

  response.json({ user: request.session.user });
});

app.get(
  "/api/admin/users",
  requireAuth,
  requireRole(["admin", "operateur"]),
  (_request, response) => {
    response.json(users.map(sanitizeUser));
  }
);

app.post(
  "/api/admin/users",
  requireAuth,
  requireRole(["admin", "operateur"]),
  requireCsrf,
  (request, response) => {
    const username = String(request.body?.username ?? "").trim();
    const password = String(request.body?.password ?? "");
    const role = String(request.body?.role ?? "beta").trim();

    if (username.length < 3) {
      response
        .status(400)
        .json({ message: "Le nom utilisateur doit contenir au moins 3 caracteres." });
      return;
    }

    if (!isPasswordValid(password)) {
      response.status(400).json({ message: PASSWORD_RULE_MESSAGE });
      return;
    }

    if (!USER_ROLES.includes(role)) {
      response.status(400).json({ message: "Role utilisateur invalide." });
      return;
    }

    if (role === "admin" && request.user.role !== "admin") {
      response.status(403).json({ message: "Seul un administrateur peut creer un administrateur." });
      return;
    }

    if (!isUsernameAvailable(username)) {
      response.status(409).json({ message: "Cet utilisateur existe deja." });
      return;
    }

    const user = createUser({
      username,
      passwordHash: hashPassword(password),
      role
    });

    response.status(201).json(sanitizeUser(user));
  }
);

app.patch(
  "/api/admin/users/:id/password",
  requireAuth,
  requireRole(["admin", "operateur"]),
  requireCsrf,
  (request, response) => {
    const userId = Number(request.params.id);
    const password = String(request.body?.password ?? "");
    const targetUser = users.find((entry) => Number(entry.id) === userId);

    if (!targetUser) {
      response.status(404).json({ message: "Utilisateur introuvable." });
      return;
    }

    if (!isPasswordValid(password)) {
      response.status(400).json({ message: PASSWORD_RULE_MESSAGE });
      return;
    }

    if (targetUser.role === "admin" && request.user.role !== "admin") {
      response.status(403).json({
        message: "Seul un administrateur peut modifier le mot de passe d'un administrateur."
      });
      return;
    }

    const user = updateUserPassword(userId, hashPassword(password));
    revokeUserSessions(user.id, request.token);

    response.json(sanitizeUser(user));
  }
);

app.get(
  "/api/admin/personnel/types",
  requireAuth,
  requireRole(["admin", "operateur"]),
  async (_request, response) => {
    try {
      response.json(await getPersonnelTypes());
    } catch {
      sendServerError(response);
    }
  }
);

app.post(
  "/api/admin/personnel",
  requireAuth,
  requireRole(["admin", "operateur"]),
  requireCsrf,
  async (request, response) => {
    const civilite = normalizeCivilite(request.body?.civilite);
    const nom = normalizeUpperText(request.body?.nom);
    const prenom = normalizePrenom(request.body?.prenom);
    const naissance = normalizeDateInput(request.body?.naissance);
    const pays = normalizeUpperText(
      request.body?.paysLibre || request.body?.pays || ""
    );
    const fonction = normalizeUpperText(
      request.body?.fonctionLibre || request.body?.fonction || ""
    );
    const typePersonne = String(request.body?.typePersonne ?? "").trim();
    const entite = String(request.body?.entite ?? "").trim();
    const tutelle = String(request.body?.tutelle ?? "").trim();
    const arrivee = normalizeDateInput(request.body?.arrivee);
    const isPermanent = request.body?.permanent !== false;
    const depart = isPermanent ? "" : normalizeDateInput(request.body?.depart);

    if (!civilite) {
      response.status(400).json({ message: "Civilite invalide." });
      return;
    }

    if (!nom || !prenom) {
      response.status(400).json({ message: "Nom et prenom sont obligatoires." });
      return;
    }

    if (!entite) {
      response.status(400).json({ message: "Entite obligatoire." });
      return;
    }

    if (!arrivee) {
      response.status(400).json({ message: "Date d'arrivee obligatoire." });
      return;
    }

    if (!isPermanent && !depart) {
      response.status(400).json({ message: "Date de depart obligatoire." });
      return;
    }

    try {
      const personnel = await createPersonnel({
        civilite,
        nom,
        prenom,
        naissance,
        pays,
        fonction,
        typePersonne,
        entite,
        tutelle,
        arrivee,
        depart,
        userid: buildPersonnelUserId(prenom, nom),
        password: generatePersonnelPassword()
      });

      response.status(201).json({
        id: personnel.id,
        civilite: personnel.civilite,
        nom: personnel.nom,
        prenom: personnel.prenom,
        fonction: personnel.fonction,
        typePersonne: personnel.typePersonne,
        entite: personnel.entite,
        userid: personnel.userid,
        email: personnel.email
      });
    } catch (error) {
      const statusCode = error.message === "Entite introuvable." ? 400 : 500;
      const message = statusCode === 400 ? error.message : "Erreur serveur.";
      response.status(statusCode).json({ message });
    }
  }
);

// Un operateur_saisie peut saisir un nouvel arrivant mais pas l'enregistrer
// directement : la saisie part dans rh_personnel_pending, un email previent les
// admins, qui valident (creation reelle via createPersonnel, comme /api/admin/personnel)
// ou rejettent (rien n'est cree). admin/operateur peuvent aussi saisir par ce
// chemin (utile s'ils veulent qu'un autre admin/operateur revalide une saisie).
app.post(
  "/api/personnel/pending",
  requireAuth,
  requireRole(["admin", "operateur", "operateur_saisie"]),
  requireCsrf,
  async (request, response) => {
    const civilite = normalizeCivilite(request.body?.civilite);
    const nom = normalizeUpperText(request.body?.nom);
    const prenom = normalizePrenom(request.body?.prenom);
    const naissance = normalizeDateInput(request.body?.naissance);
    const pays = normalizeUpperText(
      request.body?.paysLibre || request.body?.pays || ""
    );
    const fonction = normalizeUpperText(
      request.body?.fonctionLibre || request.body?.fonction || ""
    );
    const typePersonne = String(request.body?.typePersonne ?? "").trim();
    const entite = String(request.body?.entite ?? "").trim();
    const tutelle = String(request.body?.tutelle ?? "").trim();
    const arrivee = normalizeDateInput(request.body?.arrivee);
    const isPermanent = request.body?.permanent !== false;
    const depart = isPermanent ? "" : normalizeDateInput(request.body?.depart);

    if (!civilite) {
      response.status(400).json({ message: "Civilite invalide." });
      return;
    }

    if (!nom || !prenom) {
      response.status(400).json({ message: "Nom et prenom sont obligatoires." });
      return;
    }

    if (!entite) {
      response.status(400).json({ message: "Entite obligatoire." });
      return;
    }

    if (!arrivee) {
      response.status(400).json({ message: "Date d'arrivee obligatoire." });
      return;
    }

    if (!isPermanent && !depart) {
      response.status(400).json({ message: "Date de depart obligatoire." });
      return;
    }

    const badgeDemande = request.body?.badgeDemande === true;
    const numeroBadge = badgeDemande
      ? String(request.body?.numeroBadge ?? "").trim().slice(0, 50)
      : "";
    const contactPersonneId = Number(request.body?.contactPersonneId) || null;

    try {
      const pending = await createPendingPersonnel({
        civilite,
        nom,
        prenom,
        naissance,
        pays,
        fonction,
        typePersonne,
        entite,
        tutelle,
        arrivee,
        depart,
        badgeDemande,
        numeroBadge,
        contactPersonneId,
        submittedBy: request.user.username,
        glpiFormanswerId: request.body?.glpiFormanswerId
          ? Number(request.body.glpiFormanswerId)
          : null
      });

      sendMail({
        to: appConfig.smtp.adminRecipients,
        subject: "RH - Nouvelle saisie a valider",
        text:
          `${request.user.username} a saisi un nouvel arrivant a valider : ` +
          `${prenom} ${nom} (${fonction || "fonction non renseignee"}, ${entite}).\n` +
          `Controle d'acces : ${
            badgeDemande
              ? `badge demande${numeroBadge ? ` (n° ${numeroBadge})` : ""}`
              : "pas de badge demande"
          }.\n` +
          `A valider ou rejeter depuis /admin?section=saisie.`
      }).catch((error) => {
        console.error("[personnel/pending] Echec envoi email admins:", error.message);
      });

      response.status(201).json(pending);
    } catch (error) {
      const statusCode = error.message === "Entite introuvable." ? 400 : 500;
      const message = statusCode === 400 ? error.message : "Erreur serveur.";
      response.status(statusCode).json({ message });
    }
  }
);

app.get(
  "/api/personnel/pending",
  requireAuth,
  requireRole(["admin", "operateur", "operateur_saisie"]),
  async (request, response) => {
    try {
      const submittedBy =
        request.user.role === "operateur_saisie" ? request.user.username : undefined;

      response.json(await getPendingPersonnel({ submittedBy }));
    } catch {
      sendServerError(response);
    }
  }
);

app.get(
  "/api/personnel/glpi-arrivals",
  requireAuth,
  requireRole(["admin", "operateur", "operateur_saisie"]),
  async (_request, response) => {
    try {
      response.json(await getGlpiNewArrivalSubmissions());
    } catch (error) {
      console.error("[personnel/glpi-arrivals] Erreur:", error.message);
      response.json([]);
    }
  }
);

app.post(
  "/api/personnel/pending/:id/validate",
  requireAuth,
  requireRole(["admin", "operateur"]),
  requireCsrf,
  async (request, response) => {
    try {
      const pending = await getPendingPersonnelById(request.params.id);

      if (!pending) {
        response.status(404).json({ message: "Saisie introuvable." });
        return;
      }

      if (pending.statut !== "en_attente") {
        response.status(400).json({ message: "Cette saisie a deja ete traitee." });
        return;
      }

      const personnel = await createPersonnel({
        civilite: pending.civilite,
        nom: pending.nom,
        prenom: pending.prenom,
        naissance: pending.naissance,
        pays: pending.pays,
        fonction: pending.fonction,
        typePersonne: pending.type_personne,
        entite: pending.entite,
        tutelle: pending.tutelle,
        arrivee: pending.arrivee,
        depart: pending.depart,
        contactPersonneId: pending.contact_personne_id || null,
        userid: buildPersonnelUserId(pending.prenom, pending.nom),
        password: generatePersonnelPassword()
      });

      await markPendingPersonnelValidated(pending.id, {
        decidedBy: request.user.username,
        createdPersonneId: personnel.id
      });

      response.json({ id: pending.id, statut: "validee", personnelId: personnel.id });
    } catch (error) {
      const statusCode = error.message === "Entite introuvable." ? 400 : 500;
      const message = statusCode === 400 ? error.message : "Erreur serveur.";
      response.status(statusCode).json({ message });
    }
  }
);

app.post(
  "/api/personnel/pending/:id/reject",
  requireAuth,
  requireRole(["admin", "operateur"]),
  requireCsrf,
  async (request, response) => {
    try {
      const pending = await getPendingPersonnelById(request.params.id);

      if (!pending) {
        response.status(404).json({ message: "Saisie introuvable." });
        return;
      }

      if (pending.statut !== "en_attente") {
        response.status(400).json({ message: "Cette saisie a deja ete traitee." });
        return;
      }

      await markPendingPersonnelRejected(pending.id, {
        decidedBy: request.user.username,
        comment: String(request.body?.comment ?? "").trim()
      });

      response.json({ id: pending.id, statut: "rejetee" });
    } catch {
      sendServerError(response);
    }
  }
);

app.get("/api/dashboard", requireAuth, async (_request, response) => {
  try {
    const dataset = await getRhDataset();
    response.json(dataset.dashboard);
  } catch {
    sendServerError(response);
  }
});

app.get("/api/public/dashboard", async (request, response) => {
  if (!appConfig.publicDashboard.enabled || !isPrivateDashboardRequest(request)) {
    response.status(403).json({ message: "Acces public non autorise." });
    return;
  }

  try {
    const dataset = await getRhDataset();
    response.json(buildPublicDashboardPayload(dataset.dashboard));
  } catch {
    sendServerError(response);
  }
});

app.get("/api/effectif", requireAuth, async (_request, response) => {
  try {
    const dataset = await getRhDataset();
    response.json(dataset.effectif);
  } catch {
    sendServerError(response);
  }
});

app.get(
  "/api/awareness/dashboard",
  requireAuth,
  requireRole(["admin", "operateur"]),
  (_request, response) => {
    response.json(getAwarenessDashboard());
  }
);

app.get(
  "/api/awareness/campaigns",
  requireAuth,
  requireRole(["admin", "operateur"]),
  (request, response) => {
    const anonymized = request.query.anonymized !== "false";
    response.json(
      listAwarenessCampaigns().map((campaign) => ({
        ...campaign,
        anonymized
      }))
    );
  }
);

app.get(
  "/api/awareness/campaigns/:campaignId",
  requireAuth,
  requireRole(["admin", "operateur"]),
  (request, response) => {
    const campaign = getAwarenessCampaign(request.params.campaignId, {
      anonymized: request.query.anonymized !== "false"
    });

    if (!campaign) {
      response.status(404).json({ message: "Campagne introuvable." });
      return;
    }

    response.json(campaign);
  }
);

app.post(
  "/api/awareness/groups",
  requireAuth,
  requireRole(["admin", "operateur"]),
  requireCsrf,
  (request, response) => {
    try {
      response.status(201).json(createAwarenessGroup(request.body ?? {}, request.user));
    } catch (error) {
      response.status(400).json({ message: error.message });
    }
  }
);

app.get(
  "/api/awareness/groups",
  requireAuth,
  requireRole(["admin", "operateur"]),
  (_request, response) => {
    response.json(listAwarenessGroups());
  }
);

app.patch(
  "/api/awareness/groups/:groupId",
  requireAuth,
  requireRole(["admin", "operateur"]),
  requireCsrf,
  (request, response) => {
    try {
      response.json(
        updateAwarenessGroup(request.params.groupId, request.body ?? {})
      );
    } catch (error) {
      const statusCode = error.message === "Groupe introuvable." ? 404 : 400;
      response.status(statusCode).json({ message: error.message });
    }
  }
);

app.post(
  "/api/awareness/templates",
  requireAuth,
  requireRole(["admin", "operateur"]),
  requireCsrf,
  (request, response) => {
    try {
      response.status(201).json(createAwarenessTemplate(request.body ?? {}));
    } catch (error) {
      response.status(400).json({ message: error.message });
    }
  }
);

app.get(
  "/api/awareness/templates",
  requireAuth,
  requireRole(["admin", "operateur"]),
  (_request, response) => {
    response.json(listAwarenessTemplates());
  }
);

app.patch(
  "/api/awareness/templates/:templateId",
  requireAuth,
  requireRole(["admin", "operateur"]),
  requireCsrf,
  (request, response) => {
    try {
      response.json(
        updateAwarenessTemplate(request.params.templateId, request.body ?? {})
      );
    } catch (error) {
      const statusCode = error.message === "Modele introuvable." ? 404 : 400;
      response.status(statusCode).json({ message: error.message });
    }
  }
);

app.post(
  "/api/awareness/campaigns",
  requireAuth,
  requireRole(["admin", "operateur"]),
  requireCsrf,
  (request, response) => {
    try {
      const campaign = createAwarenessCampaign(request.body ?? {}, request.user);
      response.status(201).json(campaign);
    } catch (error) {
      const badRequestMessages = new Set([
        "Date invalide.",
        "La date de fin doit etre posterieure a la date de debut.",
        "Nom de campagne obligatoire.",
        "Description obligatoire.",
        "Responsable obligatoire.",
        "Reference d'autorisation obligatoire.",
        "Le module awareness est desactive."
      ]);
      const statusCode = badRequestMessages.has(error.message) ? 400 : 500;
      response.status(statusCode).json({
        message: statusCode === 400 ? error.message : "Erreur serveur."
      });
    }
  }
);

app.patch(
  "/api/awareness/campaigns/:campaignId",
  requireAuth,
  requireRole(["admin", "operateur"]),
  requireCsrf,
  (request, response) => {
    try {
      response.json(
        updateAwarenessCampaign(request.params.campaignId, request.body ?? {}, request.user)
      );
    } catch (error) {
      const statusCode =
        error.message === "Campagne introuvable." ? 404 : 400;
      response.status(statusCode).json({ message: error.message });
    }
  }
);

app.post(
  "/api/awareness/campaigns/:campaignId/recipients/import",
  requireAuth,
  requireRole(["admin", "operateur"]),
  requireCsrf,
  (request, response) => {
    try {
      response.json(
        importAwarenessRecipientsFromCsv(
          request.params.campaignId,
          request.body?.csv ?? "",
          request.user
        )
      );
    } catch (error) {
      const statusCode =
        error.message === "Campagne introuvable." ? 404 : 400;
      response.status(statusCode).json({ message: error.message });
    }
  }
);

app.post(
  "/api/awareness/campaigns/:campaignId/groups/:groupId/import",
  requireAuth,
  requireRole(["admin", "operateur"]),
  requireCsrf,
  (request, response) => {
    try {
      response.json(
        importAwarenessRecipientsFromGroup(
          request.params.campaignId,
          request.params.groupId,
          request.user
        )
      );
    } catch (error) {
      const statusCode =
        error.message === "Campagne introuvable." || error.message === "Groupe introuvable."
          ? 404
          : 400;
      response.status(statusCode).json({ message: error.message });
    }
  }
);

app.post(
  "/api/awareness/campaigns/:campaignId/recipients/exclude",
  requireAuth,
  requireRole(["admin", "operateur"]),
  requireCsrf,
  (request, response) => {
    try {
      response.json(
        excludeAwarenessRecipients(
          request.params.campaignId,
          request.body ?? {},
          request.user
        )
      );
    } catch (error) {
      const statusCode =
        error.message === "Campagne introuvable." ? 404 : 400;
      response.status(statusCode).json({ message: error.message });
    }
  }
);

app.put(
  "/api/awareness/campaigns/:campaignId/template",
  requireAuth,
  requireRole(["admin", "operateur"]),
  requireCsrf,
  (request, response) => {
    try {
      response.json(
        setAwarenessTemplate(request.params.campaignId, request.body ?? {}, request.user)
      );
    } catch (error) {
      const statusCode =
        error.message === "Campagne introuvable." ? 404 : 400;
      response.status(statusCode).json({ message: error.message });
    }
  }
);

app.post(
  "/api/awareness/campaigns/:campaignId/template/attach",
  requireAuth,
  requireRole(["admin", "operateur"]),
  requireCsrf,
  (request, response) => {
    try {
      response.json(
        setAwarenessTemplateFromLibrary(
          request.params.campaignId,
          request.body?.templateId ?? "",
          request.user
        )
      );
    } catch (error) {
      const statusCode =
        error.message === "Campagne introuvable." || error.message === "Modele introuvable."
          ? 404
          : 400;
      response.status(statusCode).json({ message: error.message });
    }
  }
);

app.post(
  "/api/awareness/campaigns/:campaignId/validate",
  requireAuth,
  requireRole(["admin"]),
  requireCsrf,
  (request, response) => {
    try {
      response.json(
        validateAwarenessCampaign(
          request.params.campaignId,
          request.body ?? {},
          request.user
        )
      );
    } catch (error) {
      const statusCode =
        error.message === "Campagne introuvable." ? 404 : 400;
      response.status(statusCode).json({ message: error.message });
    }
  }
);

app.post(
  "/api/awareness/campaigns/:campaignId/activate",
  requireAuth,
  requireRole(["admin"]),
  requireCsrf,
  (request, response) => {
    try {
      response.json(activateAwarenessCampaign(request.params.campaignId, request.user));
    } catch (error) {
      const statusCode =
        error.message === "Campagne introuvable." ? 404 : 400;
      response.status(statusCode).json({ message: error.message });
    }
  }
);

app.post(
  "/api/awareness/campaigns/:campaignId/cancel",
  requireAuth,
  requireRole(["admin"]),
  requireCsrf,
  (request, response) => {
    try {
      response.json(cancelAwarenessCampaign(request.params.campaignId, request.user));
    } catch (error) {
      const statusCode =
        error.message === "Campagne introuvable." ? 404 : 400;
      response.status(statusCode).json({ message: error.message });
    }
  }
);

app.post(
  "/api/awareness/dispatch",
  requireAuth,
  requireRole(["admin"]),
  requireCsrf,
  async (request, response) => {
    try {
      const dispatched = await dispatchDueAwarenessCampaigns(inferBaseUrl(request));
      response.json({
        dispatchedCount: dispatched.length,
        deliveries: dispatched
      });
    } catch {
      sendServerError(response);
    }
  }
);

app.get(
  "/api/awareness/outbox",
  requireAuth,
  requireRole(["admin", "operateur"]),
  (_request, response) => {
    response.json(getCampaignProvider().listPreviews());
  }
);

app.get(
  "/api/awareness/audit",
  requireAuth,
  requireRole(["admin", "operateur"]),
  (request, response) => {
    const limit = Number.parseInt(String(request.query.limit ?? "200"), 10);
    response.json(listAwarenessAuditEntries(Number.isInteger(limit) ? limit : 200));
  }
);

app.get(
  "/api/awareness/campaigns/:campaignId/report.csv",
  requireAuth,
  requireRole(["admin", "operateur"]),
  (request, response) => {
    try {
      sendDownload(
        response,
        `awareness-report-${request.params.campaignId}.csv`,
        "text/csv; charset=utf-8",
        buildAwarenessReportCsv(request.params.campaignId)
      );
    } catch (error) {
      const statusCode = error.message === "Campagne introuvable." ? 404 : 400;
      response.status(statusCode).json({ message: error.message });
    }
  }
);

app.get(
  "/api/awareness/campaigns/:campaignId/report.pdf",
  requireAuth,
  requireRole(["admin", "operateur"]),
  (request, response) => {
    try {
      sendDownload(
        response,
        `awareness-report-${request.params.campaignId}.pdf`,
        "application/pdf",
        buildAwarenessReportPdf(request.params.campaignId)
      );
    } catch (error) {
      const statusCode = error.message === "Campagne introuvable." ? 404 : 400;
      response.status(statusCode).json({ message: error.message });
    }
  }
);

app.post(
  "/api/awareness/provider/events",
  requireAuth,
  requireRole(["admin"]),
  requireCsrf,
  (request, response) => {
    try {
      response.status(201).json(receiveCampaignProviderEvent(request.body ?? {}));
    } catch (error) {
      const notFoundMessages = new Set(["Message provider introuvable."]);
      const statusCode = notFoundMessages.has(error.message) ? 404 : 400;
      response.status(statusCode).json({ message: error.message });
    }
  }
);

app.get("/awareness/click/:trackingId", (request, response) => {
  try {
    sendHtml(
      response,
      handleAwarenessClick({
        trackingId: request.params.trackingId,
        expiresAt: request.query.exp,
        signature: request.query.sig
      })
    );
  } catch (error) {
    response.status(400).send(error.message);
  }
});

app.get("/awareness/report/:trackingId", (request, response) => {
  try {
    sendHtml(
      response,
      handleAwarenessReport({
        trackingId: request.params.trackingId,
        expiresAt: request.query.exp,
        signature: request.query.sig
      })
    );
  } catch (error) {
    response.status(400).send(error.message);
  }
});

app.get("/awareness/unsubscribe/:trackingId", (request, response) => {
  try {
    sendHtml(
      response,
      handleAwarenessUnsubscribe({
        trackingId: request.params.trackingId,
        expiresAt: request.query.exp,
        signature: request.query.sig
      })
    );
  } catch (error) {
    response.status(400).send(error.message);
  }
});

app.get("/api/departs", requireAuth, async (_request, response) => {
  try {
    const dataset = await getRhDataset();
    response.json(dataset.departs);
  } catch {
    sendServerError(response);
  }
});

app.get("/api/badges", requireAuth, async (_request, response) => {
  try {
    const dataset = await getRhDataset();
    response.json(dataset.badges);
  } catch {
    sendServerError(response);
  }
});

app.get("/api/entites", requireAuth, async (_request, response) => {
  try {
    const dataset = await getRhDataset();
    response.json(dataset.entites);
  } catch {
    sendServerError(response);
  }
});

app.get("/api/statistiques/annuel", requireAuth, async (request, response) => {
  try {
    const snapshotDate = request.query.date ?? "";
    const report = await getAnnualSnapshotReport(snapshotDate);
    response.json(report);
  } catch (error) {
    const statusCode =
      error.message === "Date d'arrete invalide." ? 400 : 500;
    const message = statusCode === 400 ? error.message : "Erreur serveur.";
    response.status(statusCode).json({ message });
  }
});

app.listen(port, () => {
  console.log(`RH backend listening on http://localhost:${port}`);
});

if (appConfig.awareness.enabled) {
  const awarenessDispatchTimer = setInterval(async () => {
    const dispatched = await dispatchDueAwarenessCampaigns(
      appConfig.awareness.publicBaseUrl
    );

    if (dispatched.length > 0) {
      console.log(`[awareness] ${dispatched.length} message(s) prepares en mode preview.`);
    }
  }, appConfig.awareness.dispatchIntervalMs);

  awarenessDispatchTimer.unref?.();

  const awarenessCleanupTimer = setInterval(() => {
    const result = cleanupAwarenessData();

    if (result.removedCampaigns > 0) {
      console.log(`[awareness] ${result.removedCampaigns} campagne(s) purgee(s).`);
    }
  }, appConfig.awareness.cleanupIntervalMs);

  awarenessCleanupTimer.unref?.();
}

if (appConfig.arrivalNotify.enabled) {
  const runArrivalCheck = () => {
    runArrivalNotifierCheck()
      .then((result) => {
        if (result.sent > 0) {
          console.log(`[arrival-notify] ${result.sent} alerte(s) "nouvel arrivant" envoyee(s).`);
        }
      })
      .catch((error) => {
        console.error(`[arrival-notify] ${error.message}`);
      });
  };

  runArrivalCheck();
  const arrivalNotifierTimer = setInterval(
    runArrivalCheck,
    appConfig.arrivalNotify.intervalMs
  );
  arrivalNotifierTimer.unref?.();
}
