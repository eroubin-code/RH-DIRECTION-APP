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

export const appConfig = {
  port: readNumber("PORT", 3001),
  auth: {
    salt: readString("RH_PASSWORD_SALT", "rh-direction-salt")
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
  }
};
