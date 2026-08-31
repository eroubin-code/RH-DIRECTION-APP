// Alerte "nouvel arrivant a saisir dans RH Direction App".
//
// Sonde periodiquement les demandes du formulaire GLPI "Inscription nouvel
// arrivant" (via getGlpiNewArrivalSubmissions, deja filtrees : arrivee a venir,
// pas encore importees dans rh_personnel_pending) et envoie un email aux
// personnes chargees de la saisie, avec un lien direct vers l'onglet de saisie.
//
// Deduplication par glpi_formanswer_id dans un petit fichier JSON (etat vivant,
// non versionne, comme les stores awareness). Sans MySQL / sans compte GLPI, la
// liste des demandes est vide et il ne se passe rien.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { appConfig } from "./config.js";
import { getGlpiNewArrivalSubmissions } from "./data/index.js";
import { sendMail } from "./mailer.js";

function readNotifiedIds() {
  try {
    const parsed = JSON.parse(readFileSync(appConfig.arrivalNotify.storePath, "utf8"));
    return new Set((parsed.notified ?? []).map((value) => Number(value)));
  } catch {
    return new Set();
  }
}

function writeNotifiedIds(ids) {
  const target = appConfig.arrivalNotify.storePath;
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(
    target,
    `${JSON.stringify({ notified: [...ids].sort((left, right) => left - right) }, null, 2)}\n`
  );
}

function buildBody(submission) {
  const base = appConfig.arrivalNotify.baseUrl.replace(/\/+$/, "");

  return [
    'Un nouvel arrivant a ete declare via le formulaire GLPI "Inscription nouvel arrivant".',
    "",
    `  Nom     : ${submission.nom || "-"}`,
    `  Prenom  : ${submission.prenom || "-"}`,
    `  Equipe  : ${submission.entite || "-"}`,
    `  Tutelle : ${submission.tutelle || "-"}`,
    `  Arrivee : ${submission.arrivee || "-"}`,
    "",
    "A saisir dans RH Direction App :",
    `  ${base}/admin?section=saisie`,
    "",
    `(Reference GLPI : demande #${submission.glpiFormanswerId})`
  ].join("\n");
}

// Un passage : recupere les demandes GLPI, envoie une alerte pour chaque nouvelle
// (jamais notifiee), puis persiste les identifiants traites.
export async function runArrivalNotifierCheck() {
  const config = appConfig.arrivalNotify;

  if (!config.enabled || config.recipients.length === 0) {
    return { checked: false, sent: 0 };
  }

  const submissions = await getGlpiNewArrivalSubmissions();
  const notified = readNotifiedIds();
  const fresh = submissions.filter(
    (submission) =>
      submission.glpiFormanswerId &&
      !notified.has(Number(submission.glpiFormanswerId))
  );

  if (fresh.length === 0) {
    return { checked: true, sent: 0 };
  }

  let sent = 0;

  for (const submission of fresh) {
    const name = `${submission.prenom || ""} ${submission.nom || ""}`.trim();

    try {
      await sendMail({
        to: config.recipients,
        subject: `Nouvel arrivant a saisir dans RH Direction App${name ? ` - ${name}` : ""}`,
        text: buildBody(submission)
      });
      notified.add(Number(submission.glpiFormanswerId));
      sent += 1;
    } catch (error) {
      console.error(
        `[arrival-notify] Echec envoi pour la demande #${submission.glpiFormanswerId} : ${error.message}`
      );
    }
  }

  if (sent > 0) {
    writeNotifiedIds(notified);
  }

  return { checked: true, sent };
}
