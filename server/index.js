import crypto from "node:crypto";
import express from "express";
import { rhData } from "./data/rhData.js";
import { users } from "./data/users.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);
const sessions = new Map();
const PASSWORD_SALT = "rh-direction-salt";

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

app.use(express.json());

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok" });
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

app.get("/api/dashboard", requireAuth, (_request, response) => {
  response.json(rhData.dashboard);
});

app.get("/api/effectif", requireAuth, (_request, response) => {
  response.json(rhData.effectif);
});

app.get("/api/departs", requireAuth, (_request, response) => {
  response.json(rhData.departs);
});

app.get("/api/badges", requireAuth, (_request, response) => {
  response.json(rhData.badges);
});

app.get("/api/entites", requireAuth, (_request, response) => {
  response.json(rhData.entites);
});

app.listen(port, () => {
  console.log(`RH backend listening on http://localhost:${port}`);
});
