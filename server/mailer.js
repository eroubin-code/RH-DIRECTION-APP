// Envoi d'email minimal, base sur nodemailer. Contrairement au provider awareness
// (campaignProvider.js), il n'y a ici qu'une seule implementation reelle : pas de
// hierarchie de classes, juste une garde sur appConfig.smtp.enabled pour le
// developpement local (aucun serveur SMTP configure -> message journalise, pas envoye).
import nodemailer from "nodemailer";
import { appConfig } from "./config.js";

let cachedTransporter = null;

function getTransporter() {
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: appConfig.smtp.host,
      port: appConfig.smtp.port,
      secure: appConfig.smtp.secure,
      auth: appConfig.smtp.user
        ? { user: appConfig.smtp.user, pass: appConfig.smtp.password }
        : undefined
    });
  }

  return cachedTransporter;
}

export async function sendMail({ to, subject, text, html }) {
  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean);

  if (recipients.length === 0) {
    console.warn(`[mailer] Aucun destinataire pour l'email "${subject}", envoi ignore.`);
    return { sent: false, reason: "no-recipients" };
  }

  if (!appConfig.smtp.enabled) {
    console.log(
      `[mailer] SMTP desactive (RH_SMTP_ENABLED=false) - email non envoye.\n` +
        `  A: ${recipients.join(", ")}\n  Sujet: ${subject}\n  Corps: ${text}`
    );
    return { sent: false, reason: "smtp-disabled" };
  }

  await getTransporter().sendMail({
    from: `"${appConfig.smtp.fromName}" <${appConfig.smtp.fromEmail}>`,
    to: recipients.join(", "),
    subject,
    text,
    html
  });

  return { sent: true };
}
