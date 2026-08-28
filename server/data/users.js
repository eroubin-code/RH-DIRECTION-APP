import fs from "node:fs";
import crypto from "node:crypto";
import { appConfig } from "../config.js";

const usersStorePath = new URL("./users.store.json", import.meta.url);

export const USER_ROLES = ["admin", "operateur", "operateur_saisie", "beta"];

export function hashPassword(password) {
  return crypto.scryptSync(password, appConfig.auth.salt, 64).toString("hex");
}

function getInitialUsers() {
  const username = appConfig.auth.initialAdmin.username.trim();
  const password = appConfig.auth.initialAdmin.password;

  if (!username || !password) {
    return [];
  }

  return [
    {
      id: 1,
      username,
      passwordHash: hashPassword(password),
      role: "admin",
      // L'admin initial est fourni via l'environnement au demarrage, pas saisi par
      // un tiers dans l'interface : pas de changement de mot de passe force ici.
      mustChangePassword: false
    }
  ];
}

function loadUsers() {
  const initialUsers = getInitialUsers();

  if (!fs.existsSync(usersStorePath)) {
    return initialUsers;
  }

  try {
    const storedUsers = JSON.parse(fs.readFileSync(usersStorePath, "utf-8"));
    return Array.isArray(storedUsers) ? storedUsers : initialUsers;
  } catch {
    return initialUsers;
  }
}

function saveUsers() {
  fs.writeFileSync(usersStorePath, `${JSON.stringify(users, null, 2)}\n`);
}

export const users = loadUsers();

export function createUser({ username, passwordHash, role }) {
  const nextId =
    users.reduce((largestId, user) => Math.max(largestId, Number(user.id)), 0) +
    1;
  const user = {
    id: nextId,
    username,
    passwordHash,
    role,
    // Mot de passe choisi par un tiers (l'admin qui cree le compte) : l'utilisateur
    // doit le changer a sa premiere connexion.
    mustChangePassword: true
  };

  users.push(user);
  saveUsers();

  return user;
}

// requireChange=true (par defaut) : le nouveau mot de passe a ete choisi par un
// tiers (reinitialisation admin) et doit etre change au prochain login. Le
// changement volontaire par l'utilisateur lui-meme (POST /api/auth/change-password)
// passe requireChange=false pour lever le flag.
export function updateUserPassword(userId, passwordHash, { requireChange = true } = {}) {
  const user = users.find((entry) => String(entry.id) === String(userId));

  if (!user) {
    return null;
  }

  user.passwordHash = passwordHash;
  user.mustChangePassword = requireChange;
  saveUsers();

  return user;
}
