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
import { createUser, hashPassword, USER_ROLES, users } from "./data/users.js";

const app = express();
const port = appConfig.port;
const sessions = new Map();
const loginAttempts = new Map();
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

function sendServerError(response) {
  response.status(500).json({ message: "Erreur serveur." });
}

app.use((_request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "same-origin");
  response.setHeader("Cache-Control", "no-store");
  next();
});

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
    expiresAt: Date.now() + SESSION_TTL_MS
  });

  response.json({
    token,
    user: sanitizeUser(user)
  });
});

app.get("/api/auth/me", requireAuth, (request, response) => {
  response.json({ user: request.user });
});

app.post("/api/auth/logout", requireAuth, (request, response) => {
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

app.get("/api/effectif", requireAuth, async (_request, response) => {
  try {
    const dataset = await getRhDataset();
    response.json(dataset.effectif);
  } catch {
    sendServerError(response);
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
