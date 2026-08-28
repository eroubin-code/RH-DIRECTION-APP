import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function parseEnvFile(content) {
  return content.split(/\r?\n/).reduce((accumulator, line) => {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith("#")) {
      return accumulator;
    }

    const separatorIndex = trimmedLine.indexOf("=");

    if (separatorIndex === -1) {
      return accumulator;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    let value = trimmedLine.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    accumulator[key] = value;
    return accumulator;
  }, {});
}

function loadDotEnv() {
  const envPath = path.resolve(process.cwd(), ".env");

  if (!fs.existsSync(envPath)) {
    return;
  }

  const fileContent = fs.readFileSync(envPath, "utf-8");
  const values = parseEnvFile(fileContent);

  Object.entries(values).forEach(([key, value]) => {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  });
}

loadDotEnv();

function readNumber(name, fallbackValue) {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallbackValue;
  }

  const parsedValue = Number(rawValue);
  return Number.isFinite(parsedValue) ? parsedValue : fallbackValue;
}

function readBoolean(name, fallbackValue) {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallbackValue;
  }

  return ["1", "true", "yes", "on"].includes(rawValue.toLowerCase());
}

function readString(name, fallbackValue) {
  return process.env[name] || fallbackValue;
}

// RH_AWARENESS_LINK_SECRET signe les liens de suivi (clic/signalement/desinscription)
// des campagnes de sensibilisation. Un secret par defaut fixe et public permettrait a
// quiconque connaissant un seul trackingId (visible dans un lien recu) de forger des
// evenements pour d'autres actions. On refuse donc un secret par defaut en production,
// et on genere un secret aleatoire ephemere en developpement en avertissant l'operateur.
function readAwarenessLinkSecret() {
  const configuredSecret = process.env.RH_AWARENESS_LINK_SECRET;

  if (configuredSecret) {
    return configuredSecret;
  }

  if (readString("NODE_ENV", "development") === "production") {
    throw new Error(
      "RH_AWARENESS_LINK_SECRET doit etre defini avant de demarrer en production."
    );
  }

  console.warn(
    "[awareness] RH_AWARENESS_LINK_SECRET n'est pas defini : un secret aleatoire " +
      "temporaire a ete genere pour cette instance (liens invalides apres redemarrage). " +
      "Definissez cette variable dans .env avant tout usage hors developpement local."
  );

  return crypto.randomBytes(32).toString("hex");
}

export const appConfig = {
  port: readNumber("PORT", 3001),
  auth: {
    salt: readString("RH_PASSWORD_SALT", "rh-direction-salt"),
    sessionTtlMs: readNumber("RH_SESSION_TTL_MS", 8 * 60 * 60 * 1000),
    initialAdmin: {
      username: readString("RH_INITIAL_ADMIN_USERNAME", ""),
      password: readString("RH_INITIAL_ADMIN_PASSWORD", "")
    },
    login: {
      windowMs: readNumber("RH_LOGIN_WINDOW_MS", 15 * 60 * 1000),
      maxAttempts: readNumber("RH_LOGIN_MAX_ATTEMPTS", 5)
    }
  },
  security: {
    exposeHealthDetails: readBoolean("RH_HEALTH_DETAILS", false),
    jsonLimit: readString("RH_JSON_LIMIT", "100kb"),
    csrfHeaderName: readString("RH_CSRF_HEADER_NAME", "x-csrf-token"),
    requestWindowMs: readNumber("RH_REQUEST_WINDOW_MS", 60 * 1000),
    requestMaxPerWindow: readNumber("RH_REQUEST_MAX_PER_WINDOW", 120)
  },
  dataSource: {
    mode: readString("RH_DATA_SOURCE", "mock"),
    mysql: {
      host: readString("MYSQL_HOST", "127.0.0.1"),
      port: readNumber("MYSQL_PORT", 3306),
      user: readString("MYSQL_USER", "root"),
      password: readString("MYSQL_PASSWORD", ""),
      database: readString("MYSQL_DATABASE", "iecbman2020"),
      waitForConnections: true,
      connectionLimit: readNumber("MYSQL_CONNECTION_LIMIT", 10),
      queueLimit: 0,
      ssl: readBoolean("MYSQL_SSL", false)
    }
  },
  views: {
    effectif: readString("MYSQL_VIEW_EFFECTIF", "vw_rh_effectif"),
    departs: readString("MYSQL_VIEW_DEPARTS", "vw_rh_departs"),
    badges: readString("MYSQL_VIEW_BADGES", "vw_rh_badges"),
    entites: readString("MYSQL_VIEW_ENTITES", "vw_rh_entites")
  },
  awareness: {
    enabled: readBoolean("RH_AWARENESS_ENABLED", true),
    storePath: readString(
      "RH_AWARENESS_STORE_PATH",
      "server/data/awareness-campaigns.store.json"
    ),
    outboxPath: readString(
      "RH_AWARENESS_OUTBOX_PATH",
      "server/data/awareness-outbox.store.json"
    ),
    cleanupIntervalMs: readNumber("RH_AWARENESS_CLEANUP_INTERVAL_MS", 60 * 60 * 1000),
    dispatchIntervalMs: readNumber("RH_AWARENESS_DISPATCH_INTERVAL_MS", 5 * 60 * 1000),
    allowedDomains: readString("RH_AWARENESS_ALLOWED_DOMAINS", "iecb.fr")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
    linkSecret: readAwarenessLinkSecret(),
    linkTtlHours: readNumber("RH_AWARENESS_LINK_TTL_HOURS", 24 * 45),
    retentionDays: readNumber("RH_AWARENESS_RETENTION_DAYS", 90),
    anonymizeReportsByDefault: readBoolean(
      "RH_AWARENESS_ANONYMIZE_REPORTS",
      true
    ),
    warningBanner: readString(
      "RH_AWARENESS_WARNING_BANNER",
      "Exercice interne de sensibilisation IECB."
    ),
    publicBaseUrl: readString("RH_AWARENESS_PUBLIC_BASE_URL", "http://127.0.0.1:3001"),
    fromEmail: readString("RH_AWARENESS_FROM_EMAIL", "communication-rh@iecb.fr"),
    fromName: readString("RH_AWARENESS_FROM_NAME", "Communication RH"),
    replyTo: readString("RH_AWARENESS_REPLY_TO", "communication-rh@iecb.fr"),
    provider: readString("RH_AWARENESS_PROVIDER", "preview")
  },
  publicDashboard: {
    enabled: readBoolean("RH_PUBLIC_DASHBOARD_ENABLED", false)
  },
  // Lecture seule des soumissions du formulaire GLPI "Inscription nouvel arrivant"
  // (plugin Formcreator) pour pre-remplir la saisie RH. Optionnel : sans
  // RH_GLPI_MYSQL_USER, la fonctionnalite se degrade silencieusement (liste vide).
  glpi: {
    host: readString("RH_GLPI_MYSQL_HOST", readString("MYSQL_HOST", "127.0.0.1")),
    port: readNumber("RH_GLPI_MYSQL_PORT", 3306),
    user: readString("RH_GLPI_MYSQL_USER", ""),
    password: readString("RH_GLPI_MYSQL_PASSWORD", ""),
    database: readString("RH_GLPI_MYSQL_DATABASE", "glpi-9.4.3"),
    formId: readNumber("RH_GLPI_ARRIVAL_FORM_ID", 1)
  },
  smtp: {
    enabled: readBoolean("RH_SMTP_ENABLED", false),
    host: readString("RH_SMTP_HOST", ""),
    port: readNumber("RH_SMTP_PORT", 587),
    secure: readBoolean("RH_SMTP_SECURE", false),
    user: readString("RH_SMTP_USER", ""),
    password: readString("RH_SMTP_PASSWORD", ""),
    fromEmail: readString("RH_SMTP_FROM_EMAIL", ""),
    fromName: readString("RH_SMTP_FROM_NAME", "RH Direction"),
    adminRecipients: readString("RH_SMTP_ADMIN_RECIPIENTS", "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  }
};
