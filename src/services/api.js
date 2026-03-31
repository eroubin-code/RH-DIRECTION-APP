// Service frontend pour dialoguer avec le backend local RH.
const AUTH_TOKEN_KEY = "rh-auth-token";

function getStoredToken() {
  return window.localStorage.getItem(AUTH_TOKEN_KEY);
}

function setStoredToken(token) {
  window.localStorage.setItem(AUTH_TOKEN_KEY, token);
}

export function clearStoredToken() {
  window.localStorage.removeItem(AUTH_TOKEN_KEY);
}

async function request(path, options = {}) {
  const token = options.token ?? getStoredToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers ?? {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    ...options,
    headers
  });

  if (!response.ok) {
    let message = "Une erreur est survenue.";

    try {
      const payload = await response.json();
      message = payload.message ?? message;
    } catch {
      // Ignore les erreurs de parsing pour conserver le message par defaut.
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export async function login(username, password) {
  const payload = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
    token: null
  });

  setStoredToken(payload.token);
  return payload.user;
}

export async function logout() {
  const token = getStoredToken();

  if (!token) {
    return;
  }

  await request("/api/auth/logout", {
    method: "POST",
    token
  });

  clearStoredToken();
}

export async function getCurrentUser() {
  const token = getStoredToken();

  if (!token) {
    return null;
  }

  try {
    const payload = await request("/api/auth/me", { token });
    return payload.user;
  } catch {
    clearStoredToken();
    return null;
  }
}

export async function getDashboardData() {
  return request("/api/dashboard");
}

export async function getEffectif() {
  return request("/api/effectif");
}

export async function getDeparts() {
  return request("/api/departs");
}

export async function getBadges() {
  return request("/api/badges");
}

export async function getEntites() {
  return request("/api/entites");
}

export async function getAnnualStatistics(date) {
  const params = new URLSearchParams({ date });
  return request(`/api/statistiques/annuel?${params.toString()}`);
}
