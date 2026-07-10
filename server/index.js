import crypto from "node:crypto";
import express from "express";
import { appConfig } from "./config.js";
import {
  createPersonnel,
  getAnnualSnapshotReport,
  getDataStatus,
  getPersonnelTypes,
  getRhDataset
} from "./data/index.js";
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
const port = appConfig.port;
const sessions = new Map();
const loginAttempts = new Map();
const requestWindowBuckets = new Map();
const SESSION_TTL_MS = appConfig.auth.sessionTtlMs;

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role
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

    if (password.length < 6) {
      response
        .status(400)
        .json({ message: "Le mot de passe doit contenir au moins 6 caracteres." });
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

    if (password.length < 6) {
      response
        .status(400)
        .json({ message: "Le mot de passe doit contenir au moins 6 caracteres." });
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
    response.json(dataset.dashboard);
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
