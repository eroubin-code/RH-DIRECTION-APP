import crypto from "node:crypto";
import express from "express";
import { appConfig } from "./config.js";
import {
  getAnnualSnapshotReport,
  getDataStatus,
  getRhDataset
} from "./data/index.js";
import { createUser, USER_ROLES, users } from "./data/users.js";

const app = express();
const port = appConfig.port;
const sessions = new Map();
const PASSWORD_SALT = appConfig.auth.salt;

function hashPassword(password) {
  return crypto.scryptSync(password, PASSWORD_SALT, 64).toString("hex");
}

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

app.use(express.json());

app.get("/api/health", async (_request, response) => {
  const dataStatus = await getDataStatus();

  response.json({
    status: "ok",
    dataSource: dataStatus
  });
});

app.post("/api/auth/login", (request, response) => {
  const { username, password } = request.body ?? {};
  const user = users.find((entry) => entry.username === username);

  if (!user || hashPassword(password ?? "") !== user.passwordHash) {
    response.status(401).json({ message: "Identifiants invalides." });
    return;
  }

  const token = crypto.randomBytes(24).toString("hex");
  sessions.set(token, {
    user: sanitizeUser(user),
    createdAt: Date.now()
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

app.get("/api/dashboard", requireAuth, async (_request, response) => {
  try {
    const dataset = await getRhDataset();
    response.json(dataset.dashboard);
  } catch (error) {
    response.status(500).json({ message: error.message });
  }
});

app.get("/api/effectif", requireAuth, async (_request, response) => {
  try {
    const dataset = await getRhDataset();
    response.json(dataset.effectif);
  } catch (error) {
    response.status(500).json({ message: error.message });
  }
});

app.get("/api/departs", requireAuth, async (_request, response) => {
  try {
    const dataset = await getRhDataset();
    response.json(dataset.departs);
  } catch (error) {
    response.status(500).json({ message: error.message });
  }
});

app.get("/api/badges", requireAuth, async (_request, response) => {
  try {
    const dataset = await getRhDataset();
    response.json(dataset.badges);
  } catch (error) {
    response.status(500).json({ message: error.message });
  }
});

app.get("/api/entites", requireAuth, async (_request, response) => {
  try {
    const dataset = await getRhDataset();
    response.json(dataset.entites);
  } catch (error) {
    response.status(500).json({ message: error.message });
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
    response.status(statusCode).json({ message: error.message });
  }
});

app.listen(port, () => {
  console.log(`RH backend listening on http://localhost:${port}`);
});
