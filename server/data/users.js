import fs from "node:fs";
import crypto from "node:crypto";
import { appConfig } from "../config.js";

const usersStorePath = new URL("./users.store.json", import.meta.url);

export const USER_ROLES = ["admin", "operateur", "beta"];

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
      role: "admin"
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
    role
  };

  users.push(user);
  saveUsers();

  return user;
}

export function updateUserPassword(userId, passwordHash) {
  const user = users.find((entry) => String(entry.id) === String(userId));

  if (!user) {
    return null;
  }

  user.passwordHash = passwordHash;
  saveUsers();

  return user;
}
