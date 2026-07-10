import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { appConfig } from "./config.js";
import { getCampaignProvider } from "./campaignProvider.js";

const storePath = path.resolve(process.cwd(), appConfig.awareness.storePath);

function ensureStoreDirectory() {
  fs.mkdirSync(path.dirname(storePath), { recursive: true });
}

function loadStore() {
  if (!fs.existsSync(storePath)) {
    return { campaigns: [], groups: [], templates: [] };
  }

  try {
    const content = fs.readFileSync(storePath, "utf-8");
    const parsed = JSON.parse(content);

    if (parsed && Array.isArray(parsed.campaigns)) {
      return {
        campaigns: Array.isArray(parsed.campaigns) ? parsed.campaigns : [],
        groups: Array.isArray(parsed.groups) ? parsed.groups : [],
        templates: Array.isArray(parsed.templates) ? parsed.templates : []
      };
    }
  } catch {
    // Ignore malformed local store and start clean.
  }

  return { campaigns: [], groups: [], templates: [] };
}

const store = loadStore();

function saveStore() {
  ensureStoreDirectory();
  fs.writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`);
}

function parseDateOnly(value) {
  const normalizedValue = String(value ?? "").trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    throw new Error("Date invalide.");
  }

  const parsedDate = new Date(`${normalizedValue}T00:00:00`);

  if (Number.isNaN(parsedDate.getTime())) {
    throw new Error("Date invalide.");
  }

  return parsedDate;
}

function formatDateOnly(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeText(value, maxLength = 500) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

function requireNonEmpty(value, message) {
  if (!String(value ?? "").trim()) {
    throw new Error(message);
  }
}

function addAuditEntry(campaign, user, action, details = {}) {
  campaign.auditLog.push({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    userId: user?.id ?? null,
    username: user?.username ?? "system",
    action,
    details
  });
}

function listBusinessDays(startDate, endDate) {
  const dates = [];
  const cursor = new Date(startDate);

  while (cursor <= endDate) {
    const day = cursor.getDay();

    if (day >= 1 && day <= 5) {
      dates.push(new Date(cursor));
    }

    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function parseTime(value, fallbackMinutes) {
  const normalizedValue = String(value ?? "").trim();

  if (!/^\d{2}:\d{2}$/.test(normalizedValue)) {
    return fallbackMinutes;
  }

  const [hours, minutes] = normalizedValue.split(":").map(Number);

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return fallbackMinutes;
  }

  return hours * 60 + minutes;
}

function toIsoAtMinutes(baseDate, minutes) {
  const date = new Date(baseDate);
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date.toISOString();
}

function randomInt(min, max) {
  return crypto.randomInt(min, max + 1);
}

function shuffle(items) {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(index + 1);
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

function distributeCounts(total, daysCount, maxPerDay) {
  const counts = new Array(daysCount).fill(0);
  let remaining = total;
  let index = 0;

  while (remaining > 0) {
    if (counts[index] < maxPerDay) {
      counts[index] += 1;
      remaining -= 1;
    }

    index = (index + 1) % daysCount;
  }

  return shuffle(counts);
}

function buildDaySlots(day, count, minGapMinutes, maxGapMinutes, dayStartMinutes, dayEndMinutes) {
  const slots = [];
  let cursor = dayStartMinutes;

  for (let index = 0; index < count; index += 1) {
    const remaining = count - index;
    const latest = dayEndMinutes - minGapMinutes * (remaining - 1);
    const minutes = randomInt(Math.min(cursor, latest), Math.max(cursor, latest));

    slots.push(toIsoAtMinutes(day, minutes));

    if (index < count - 1) {
      cursor = Math.min(minutes + randomInt(minGapMinutes, maxGapMinutes), dayEndMinutes);
    }
  }

  return slots;
}

function createTrackingSignature(trackingId, expiresAt, action) {
  return crypto
    .createHmac("sha256", appConfig.awareness.linkSecret)
    .update(`${trackingId}:${expiresAt}:${action}`)
    .digest("hex");
}

function buildSignedTrackingLink(baseUrl, trackingId, action) {
  const expiresAt = new Date(
    Date.now() + appConfig.awareness.linkTtlHours * 60 * 60 * 1000
  ).toISOString();
  const signature = createTrackingSignature(trackingId, expiresAt, action);
  const params = new URLSearchParams({
    exp: expiresAt,
    sig: signature
  });

  return `${baseUrl}/awareness/${action}/${trackingId}?${params.toString()}`;
}

function verifySignedTrackingLink(trackingId, expiresAt, signature, action) {
  if (!trackingId || !expiresAt || !signature) {
    throw new Error("Lien invalide.");
  }

  const expiryDate = new Date(expiresAt);

  if (Number.isNaN(expiryDate.getTime()) || expiryDate < new Date()) {
    throw new Error("Lien expire.");
  }

  const expectedSignature = createTrackingSignature(trackingId, expiresAt, action);
  const providedBuffer = Buffer.from(String(signature));
  const expectedBuffer = Buffer.from(expectedSignature);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    throw new Error("Signature invalide.");
  }
}

function pickSeparator(line) {
  const separators = [";", ",", "\t"];
  const winner = separators
    .map((separator) => ({
      separator,
      count: line.split(separator).length
    }))
    .sort((left, right) => right.count - left.count)[0];

  return winner?.separator ?? ";";
}

function parseCsv(csvContent) {
  const content = String(csvContent ?? "").trim();

  if (!content) {
    throw new Error("Le fichier CSV est vide.");
  }

  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error("Le CSV doit contenir un en-tete et au moins une ligne.");
  }

  const separator = pickSeparator(lines[0]);
  const headers = lines[0].split(separator).map((header) =>
    normalizeText(header)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
  );

  const rows = lines.slice(1).map((line) => {
    const cells = line.split(separator).map((cell) => normalizeText(cell, 300));
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""]));
  });

  return rows;
}

function findCsvValue(row, aliases) {
  return aliases.map((alias) => row[alias]).find((value) => value !== undefined) ?? "";
}

function validateRecipient(candidate, allowedDomains, seenEmails) {
  const email = normalizeEmail(candidate.email);
  const domain = email.split("@")[1] ?? "";

  if (!email.includes("@")) {
    return { status: "rejet", reason: "Adresse email invalide." };
  }

  if (!allowedDomains.includes(domain)) {
    return { status: "rejet", reason: "Domaine hors perimetre autorise." };
  }

  if (seenEmails.has(email)) {
    return { status: "doublon", reason: "Adresse presente en doublon." };
  }

  seenEmails.add(email);
  return { status: "ok", reason: "" };
}

function sanitizeRecipient(recipient) {
  return {
    id: recipient.id,
    firstName: recipient.firstName,
    lastName: recipient.lastName,
    email: recipient.email,
    service: recipient.service,
    group: recipient.group,
    excluded: recipient.excluded,
    exclusionReason: recipient.exclusionReason,
    unsubscribedAt: recipient.unsubscribedAt
  };
}

function sanitizeTemplate(template) {
  if (!template) {
    return null;
  }

  return {
    subject: template.subject,
    html: template.html,
    text: template.text,
    warningBanner: template.warningBanner,
    variables: template.variables
  };
}

function sanitizeLibraryTemplate(template) {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    category: template.category,
    updatedAt: template.updatedAt,
    template: sanitizeTemplate(template.template)
  };
}

function sanitizeGroup(group) {
  return {
    id: group.id,
    name: group.name,
    description: group.description,
    memberCount: group.members.length,
    members: [...group.members],
    updatedAt: group.updatedAt
  };
}

function summarizeCampaign(campaign, anonymized = appConfig.awareness.anonymizeReportsByDefault) {
  const summary = {
    recipients: campaign.recipients.filter((recipient) => !recipient.excluded).length,
    excluded: campaign.recipients.filter((recipient) => recipient.excluded).length,
    deliveriesPlanned: campaign.deliveries.filter((delivery) => delivery.status === "planifie").length,
    deliveriesDistributed: campaign.deliveries.filter((delivery) => delivery.status === "distribue").length,
    clicks: campaign.events.filter((event) => event.type === "clic").length,
    pedagogicalViews: campaign.events.filter((event) => event.type === "page_pedagogique").length,
    reports: campaign.events.filter((event) => event.type === "signalement").length
  };

  return {
    id: campaign.id,
    name: campaign.name,
    description: campaign.description,
    responsable: campaign.responsable,
    startDate: campaign.startDate,
    endDate: campaign.endDate,
    status: campaign.status,
    authorizationReference: campaign.authorizationReference,
    validation: campaign.validation,
    settings: campaign.settings,
    template: sanitizeTemplate(campaign.template),
    summary,
    recipients: anonymized
      ? []
      : campaign.recipients.map(sanitizeRecipient),
    deliveries: anonymized
      ? []
      : campaign.deliveries.map((delivery) => ({
          id: delivery.id,
          recipientId: delivery.recipientId,
          recipientName: delivery.recipientName,
          email: delivery.email,
          scheduledAt: delivery.scheduledAt,
          status: delivery.status,
          distributedAt: delivery.distributedAt,
          providerMessageId: delivery.providerMessageId
        })),
    recentAuditLog: campaign.auditLog.slice(-20),
    anonymized
  };
}

function findCampaign(campaignId) {
  return store.campaigns.find((campaign) => campaign.id === campaignId) ?? null;
}

function findGroup(groupId) {
  return store.groups.find((group) => group.id === groupId) ?? null;
}

function ensureGroup(groupId) {
  const group = findGroup(groupId);

  if (!group) {
    throw new Error("Groupe introuvable.");
  }

  return group;
}

function findLibraryTemplate(templateId) {
  return store.templates.find((template) => template.id === templateId) ?? null;
}

function ensureLibraryTemplate(templateId) {
  const template = findLibraryTemplate(templateId);

  if (!template) {
    throw new Error("Modele introuvable.");
  }

  return template;
}

function ensureCampaign(campaignId) {
  const campaign = findCampaign(campaignId);

  if (!campaign) {
    throw new Error("Campagne introuvable.");
  }

  return campaign;
}

function validateCampaignDates(startDate, endDate) {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);

  if (end < start) {
    throw new Error("La date de fin doit etre posterieure a la date de debut.");
  }

  return {
    startDate: formatDateOnly(start),
    endDate: formatDateOnly(end)
  };
}

function validateTemplatePayload(template) {
  requireNonEmpty(template.subject, "Sujet obligatoire.");
  requireNonEmpty(template.html, "Contenu HTML obligatoire.");
  requireNonEmpty(template.text, "Contenu texte obligatoire.");

  const html = String(template.html ?? "");
  const text = String(template.text ?? "");
  const joinedContent = `${template.subject}\n${html}\n${text}`.toLowerCase();

  if (/<form|<input|type=["']password["']/.test(html.toLowerCase())) {
    throw new Error("Les formulaires et champs de saisie sont interdits.");
  }

  if (
    /(mot de passe|password|identifiant|jeton|token|cookie)/.test(joinedContent)
  ) {
    throw new Error("Le modele ne doit pas demander d'identifiants ni de donnees sensibles.");
  }

  const allowedVariables = ["{{prenom}}", "{{nom}}", "{{service}}", "{{campagne_id}}"];
  const foundVariables = [...joinedContent.matchAll(/{{[^}]+}}/g)].map((match) => match[0]);

  if (foundVariables.some((variable) => !allowedVariables.includes(variable))) {
    throw new Error("Variables de modele non autorisees.");
  }

  return {
    subject: normalizeText(template.subject, 200),
    html,
    text,
    warningBanner: normalizeText(
      template.warningBanner || appConfig.awareness.warningBanner,
      200
    ),
    variables: allowedVariables
  };
}

function setCampaignTemplateInternal(campaign, payload, user, action = "template.updated") {
  campaign.template = validateTemplatePayload(payload);

  if (campaign.status === "validee") {
    campaign.status = "brouillon";
    campaign.validation = null;
  }

  addAuditEntry(campaign, user, action);
  saveStore();
  return summarizeCampaign(campaign, false);
}

function renderTemplateString(content, recipient, campaign) {
  return String(content ?? "")
    .replaceAll("{{prenom}}", recipient.firstName)
    .replaceAll("{{nom}}", recipient.lastName)
    .replaceAll("{{service}}", recipient.service)
    .replaceAll("{{campagne_id}}", campaign.id);
}

function buildMessageBodies(campaign, recipient, trackingBaseUrl) {
  const clickLink = buildSignedTrackingLink(
    trackingBaseUrl,
    recipient.trackingId,
    "click"
  );
  const reportLink = buildSignedTrackingLink(
    trackingBaseUrl,
    recipient.trackingId,
    "report"
  );
  const unsubscribeLink = buildSignedTrackingLink(
    trackingBaseUrl,
    recipient.trackingId,
    "unsubscribe"
  );

  const subject = renderTemplateString(campaign.template.subject, recipient, campaign);
  const textBody = `${campaign.template.warningBanner}\n\n${renderTemplateString(
    campaign.template.text,
    recipient,
    campaign
  )}\n\nLien de sensibilisation: ${clickLink}\nSignaler: ${reportLink}\nSe desinscrire: ${unsubscribeLink}`;
  const htmlBody = [
    `<div style="padding:12px;border:1px solid #d9c27a;background:#fff8db;color:#514100;font-family:Arial,sans-serif;">${campaign.template.warningBanner}</div>`,
    renderTemplateString(campaign.template.html, recipient, campaign),
    `<p><a href="${clickLink}">Ouvrir le message de sensibilisation</a></p>`,
    `<p><a href="${reportLink}">Signaler ce message</a> | <a href="${unsubscribeLink}">Se desinscrire</a></p>`
  ].join("");

  return {
    subject,
    text: textBody,
    html: htmlBody
  };
}

function buildDeliveries(campaign) {
  const startDate = parseDateOnly(campaign.startDate);
  const endDate = parseDateOnly(campaign.endDate);
  const recipients = shuffle(
    campaign.recipients.filter((recipient) => !recipient.excluded && !recipient.unsubscribedAt)
  );
  const businessDays = listBusinessDays(startDate, endDate);

  if (businessDays.length === 0) {
    throw new Error("Aucun jour ouvrable sur la periode selectionnee.");
  }

  if ((businessDays.length * campaign.settings.maxPerDay) < recipients.length) {
    throw new Error("La periode ne permet pas de planifier tous les envois.");
  }

  const counts = distributeCounts(
    recipients.length,
    businessDays.length,
    campaign.settings.maxPerDay
  );
  const deliveries = [];
  let recipientIndex = 0;
  const dayStartMinutes = parseTime(campaign.settings.dayStart, 8 * 60 + 30);
  const dayEndMinutes = parseTime(campaign.settings.dayEnd, 16 * 60 + 30);

  counts.forEach((count, dayIndex) => {
    if (count === 0) {
      return;
    }

    const slots = buildDaySlots(
      businessDays[dayIndex],
      count,
      campaign.settings.minGapMinutes,
      campaign.settings.maxGapMinutes,
      dayStartMinutes,
      dayEndMinutes
    );

    slots.forEach((scheduledAt) => {
      const recipient = recipients[recipientIndex];
      recipientIndex += 1;

      deliveries.push({
        id: crypto.randomUUID(),
        recipientId: recipient.id,
        trackingId: recipient.trackingId,
        recipientName: `${recipient.firstName} ${recipient.lastName}`.trim(),
        email: recipient.email,
        scheduledAt,
        status: "planifie",
        distributedAt: null,
        providerMessageId: null
      });
    });
  });

  return deliveries.sort((left, right) =>
    left.scheduledAt.localeCompare(right.scheduledAt)
  );
}

function buildPedagogicalHtml(title, bodyLines) {
  return `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { font-family: Arial, sans-serif; background: #f5f1e8; color: #1f2a37; margin: 0; padding: 32px; }
      main { max-width: 720px; margin: 0 auto; background: #ffffff; padding: 32px; border-radius: 18px; box-shadow: 0 16px 48px rgba(31,42,55,0.12); }
      h1 { margin-top: 0; font-size: 2rem; }
      ul { padding-left: 20px; }
      .notice { padding: 14px 16px; background: #eef8f1; border-left: 4px solid #2f855a; margin-bottom: 20px; }
    </style>
  </head>
  <body>
    <main>
      <div class="notice">Simulation interne de sensibilisation a la cybersécurité.</div>
      <h1>${title}</h1>
      <ul>${bodyLines.map((line) => `<li>${line}</li>`).join("")}</ul>
    </main>
  </body>
</html>`;
}

function recordEvent(campaign, recipientId, type, details = {}) {
  const existingEvent = campaign.events.find(
    (event) => event.recipientId === recipientId && event.type === type
  );

  if (existingEvent) {
    return existingEvent;
  }

  const event = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    recipientId,
    type,
    details
  };

  campaign.events.push(event);
  return event;
}

export function listAwarenessCampaigns() {
  return store.campaigns
    .map((campaign) => summarizeCampaign(campaign))
    .sort((left, right) => right.startDate.localeCompare(left.startDate));
}

export function listAwarenessGroups() {
  return store.groups
    .map(sanitizeGroup)
    .sort((left, right) => left.name.localeCompare(right.name, "fr"));
}

export function createAwarenessGroup(payload, user) {
  requireNonEmpty(payload.name, "Nom de groupe obligatoire.");
  const members = [...new Set((payload.members ?? [])
    .map((member) => normalizeEmail(member))
    .filter(Boolean))];

  if (
    members.some((member) => {
      const domain = member.split("@")[1] ?? "";
      return !appConfig.awareness.allowedDomains.includes(domain);
    })
  ) {
    throw new Error("Le groupe contient un membre hors domaine autorise.");
  }

  const group = {
    id: crypto.randomUUID(),
    name: normalizeText(payload.name, 120),
    description: normalizeText(payload.description, 400),
    members,
    updatedAt: new Date().toISOString()
  };

  store.groups.push(group);
  saveStore();

  for (const campaign of store.campaigns) {
    addAuditEntry(campaign, user, "group.catalog.changed", { groupId: group.id });
  }

  return sanitizeGroup(group);
}

export function updateAwarenessGroup(groupId, payload) {
  const group = ensureGroup(groupId);
  const members = payload.members
    ? [...new Set(payload.members.map((member) => normalizeEmail(member)).filter(Boolean))]
    : group.members;

  if (
    members.some((member) => {
      const domain = member.split("@")[1] ?? "";
      return !appConfig.awareness.allowedDomains.includes(domain);
    })
  ) {
    throw new Error("Le groupe contient un membre hors domaine autorise.");
  }

  group.name = normalizeText(payload.name ?? group.name, 120);
  group.description = normalizeText(payload.description ?? group.description, 400);
  group.members = members;
  group.updatedAt = new Date().toISOString();
  saveStore();
  return sanitizeGroup(group);
}

export function listAwarenessTemplates() {
  return store.templates
    .map(sanitizeLibraryTemplate)
    .sort((left, right) => left.name.localeCompare(right.name, "fr"));
}

export function createAwarenessTemplate(payload) {
  requireNonEmpty(payload.name, "Nom de modele obligatoire.");
  const template = {
    id: crypto.randomUUID(),
    name: normalizeText(payload.name, 120),
    description: normalizeText(payload.description, 400),
    category: normalizeText(payload.category || "general", 80),
    updatedAt: new Date().toISOString(),
    template: validateTemplatePayload(payload.template ?? payload)
  };

  store.templates.push(template);
  saveStore();
  return sanitizeLibraryTemplate(template);
}

export function updateAwarenessTemplate(templateId, payload) {
  const template = ensureLibraryTemplate(templateId);
  template.name = normalizeText(payload.name ?? template.name, 120);
  template.description = normalizeText(payload.description ?? template.description, 400);
  template.category = normalizeText(payload.category ?? template.category, 80);
  template.updatedAt = new Date().toISOString();
  template.template = validateTemplatePayload(payload.template ?? payload);
  saveStore();
  return sanitizeLibraryTemplate(template);
}

export function getAwarenessCampaign(campaignId, options = {}) {
  const campaign = findCampaign(campaignId);
  return campaign ? summarizeCampaign(campaign, options.anonymized) : null;
}

export function createAwarenessCampaign(payload, user) {
  if (!appConfig.awareness.enabled) {
    throw new Error("Le module awareness est desactive.");
  }

  requireNonEmpty(payload.name, "Nom de campagne obligatoire.");
  requireNonEmpty(payload.description, "Description obligatoire.");
  requireNonEmpty(payload.responsable, "Responsable obligatoire.");
  requireNonEmpty(payload.authorizationReference, "Reference d'autorisation obligatoire.");

  const { startDate, endDate } = validateCampaignDates(payload.startDate, payload.endDate);
  const campaign = {
    id: crypto.randomUUID(),
    name: normalizeText(payload.name, 120),
    description: normalizeText(payload.description, 1000),
    responsable: normalizeText(payload.responsable, 200),
    startDate,
    endDate,
    status: "brouillon",
    authorizationReference: normalizeText(payload.authorizationReference, 200),
    validation: null,
    settings: {
      allowedDomains: [...appConfig.awareness.allowedDomains],
      maxPerDay: Math.max(1, Number(payload.maxPerDay) || 4),
      minGapMinutes: Math.max(15, Number(payload.minGapMinutes) || 30),
      maxGapMinutes: Math.max(
        Math.max(15, Number(payload.minGapMinutes) || 30),
        Number(payload.maxGapMinutes) || 90
      ),
      dayStart: normalizeText(payload.dayStart || "08:30", 5),
      dayEnd: normalizeText(payload.dayEnd || "16:30", 5),
      anonymizeReports: payload.anonymizeReports !== false,
      retentionDays: Math.max(1, Number(payload.retentionDays) || appConfig.awareness.retentionDays)
    },
    recipients: [],
    deliveries: [],
    template: null,
    events: [],
    auditLog: []
  };

  addAuditEntry(campaign, user, "campaign.created", {
    authorizationReference: campaign.authorizationReference
  });
  store.campaigns.push(campaign);
  saveStore();
  return summarizeCampaign(campaign, false);
}

export function updateAwarenessCampaign(campaignId, payload, user) {
  const campaign = ensureCampaign(campaignId);

  if (!["brouillon", "validee"].includes(campaign.status)) {
    throw new Error("Seules les campagnes en brouillon ou validees sont modifiables.");
  }

  const { startDate, endDate } = validateCampaignDates(
    payload.startDate ?? campaign.startDate,
    payload.endDate ?? campaign.endDate
  );

  campaign.name = normalizeText(payload.name ?? campaign.name, 120);
  campaign.description = normalizeText(payload.description ?? campaign.description, 1000);
  campaign.responsable = normalizeText(payload.responsable ?? campaign.responsable, 200);
  campaign.authorizationReference = normalizeText(
    payload.authorizationReference ?? campaign.authorizationReference,
    200
  );
  campaign.startDate = startDate;
  campaign.endDate = endDate;
  campaign.settings.maxPerDay = Math.max(
    1,
    Number(payload.maxPerDay) || campaign.settings.maxPerDay
  );
  campaign.settings.minGapMinutes = Math.max(
    15,
    Number(payload.minGapMinutes) || campaign.settings.minGapMinutes
  );
  campaign.settings.maxGapMinutes = Math.max(
    campaign.settings.minGapMinutes,
    Number(payload.maxGapMinutes) || campaign.settings.maxGapMinutes
  );
  campaign.settings.dayStart = normalizeText(
    payload.dayStart ?? campaign.settings.dayStart,
    5
  );
  campaign.settings.dayEnd = normalizeText(payload.dayEnd ?? campaign.settings.dayEnd, 5);
  campaign.settings.anonymizeReports = payload.anonymizeReports ?? campaign.settings.anonymizeReports;

  if (campaign.status === "validee") {
    campaign.status = "brouillon";
    campaign.validation = null;
  }

  addAuditEntry(campaign, user, "campaign.updated");
  saveStore();
  return summarizeCampaign(campaign, false);
}

export function importAwarenessRecipientsFromCsv(campaignId, csvContent, user) {
  const campaign = ensureCampaign(campaignId);

  if (!["brouillon", "validee"].includes(campaign.status)) {
    throw new Error("Import autorise uniquement sur une campagne en brouillon ou validee.");
  }

  const rows = parseCsv(csvContent);
  const seenEmails = new Set(campaign.recipients.map((recipient) => recipient.email));
  const imported = [];
  const rejected = [];
  const duplicates = [];

  rows.forEach((row) => {
    const candidate = {
      firstName: normalizeText(findCsvValue(row, ["prenom", "first_name", "firstname"]), 100),
      lastName: normalizeText(findCsvValue(row, ["nom", "last_name", "lastname"]), 100),
      email: normalizeEmail(findCsvValue(row, ["email", "mail", "courriel"])),
      service: normalizeText(findCsvValue(row, ["service", "department"]), 150),
      group: normalizeText(findCsvValue(row, ["groupe", "group", "equipe"]), 150)
    };
    const validation = validateRecipient(
      candidate,
      campaign.settings.allowedDomains,
      seenEmails
    );

    if (validation.status === "rejet") {
      rejected.push({ email: candidate.email, reason: validation.reason });
      return;
    }

    if (validation.status === "doublon") {
      duplicates.push({ email: candidate.email, reason: validation.reason });
      return;
    }

    imported.push({
      id: crypto.randomUUID(),
      trackingId: crypto.randomUUID(),
      firstName: candidate.firstName || "Collegue",
      lastName: candidate.lastName || "",
      email: candidate.email,
      service: candidate.service || "Non renseigne",
      group: candidate.group || "Non renseigne",
      excluded: false,
      exclusionReason: "",
      unsubscribedAt: null
    });
  });

  campaign.recipients.push(...imported);
  addAuditEntry(campaign, user, "recipients.imported", {
    imported: imported.length,
    rejected: rejected.length,
    duplicates: duplicates.length
  });
  saveStore();

  return {
    imported: imported.map(sanitizeRecipient),
    rejected,
    duplicates,
    totals: {
      imported: imported.length,
      rejected: rejected.length,
      duplicates: duplicates.length,
      campaignRecipients: campaign.recipients.length
    }
  };
}

export function importAwarenessRecipientsFromGroup(campaignId, groupId, user) {
  const campaign = ensureCampaign(campaignId);
  const group = ensureGroup(groupId);

  if (!["brouillon", "validee"].includes(campaign.status)) {
    throw new Error("Import autorise uniquement sur une campagne en brouillon ou validee.");
  }

  const csv = [
    "prenom;nom;email;service;groupe",
    ...group.members.map((email) => `Collegue;;${email};Non renseigne;${group.name}`)
  ].join("\n");

  const result = importAwarenessRecipientsFromCsv(campaignId, csv, user);
  addAuditEntry(campaign, user, "group.imported", { groupId, imported: result.totals.imported });
  saveStore();
  return result;
}

export function excludeAwarenessRecipients(campaignId, payload, user) {
  const campaign = ensureCampaign(campaignId);
  const targetEmails = new Set(
    (payload.emails ?? []).map((email) => normalizeEmail(email)).filter(Boolean)
  );
  const targetIds = new Set((payload.recipientIds ?? []).map(String));
  const reason = normalizeText(payload.reason || "Exclusion manuelle", 200);
  let updated = 0;

  campaign.recipients.forEach((recipient) => {
    if (targetEmails.has(recipient.email) || targetIds.has(String(recipient.id))) {
      recipient.excluded = true;
      recipient.exclusionReason = reason;
      updated += 1;
    }
  });

  addAuditEntry(campaign, user, "recipients.excluded", { updated, reason });
  saveStore();
  return summarizeCampaign(campaign, false);
}

export function setAwarenessTemplate(campaignId, payload, user) {
  const campaign = ensureCampaign(campaignId);

  if (!["brouillon", "validee"].includes(campaign.status)) {
    throw new Error("Le modele est modifiable uniquement avant activation.");
  }

  return setCampaignTemplateInternal(campaign, payload, user);
}

export function setAwarenessTemplateFromLibrary(campaignId, templateId, user) {
  const campaign = ensureCampaign(campaignId);
  const template = ensureLibraryTemplate(templateId);

  if (!["brouillon", "validee"].includes(campaign.status)) {
    throw new Error("Le modele est modifiable uniquement avant activation.");
  }

  return setCampaignTemplateInternal(
    campaign,
    template.template,
    user,
    "template.attached"
  );
}

export function validateAwarenessCampaign(campaignId, payload, user) {
  const campaign = ensureCampaign(campaignId);

  if (campaign.recipients.filter((recipient) => !recipient.excluded).length === 0) {
    throw new Error("Aucun destinataire actif dans la campagne.");
  }

  if (!campaign.template) {
    throw new Error("Aucun modele de sensibilisation configure.");
  }

  requireNonEmpty(
    payload.authorizationReference || campaign.authorizationReference,
    "Reference d'autorisation obligatoire."
  );

  campaign.authorizationReference = normalizeText(
    payload.authorizationReference || campaign.authorizationReference,
    200
  );
  campaign.validation = {
    validatedAt: new Date().toISOString(),
    validatedBy: user?.username ?? "system",
    note: normalizeText(payload.note || "", 300)
  };
  campaign.status = "validee";
  addAuditEntry(campaign, user, "campaign.validated", {
    authorizationReference: campaign.authorizationReference
  });
  saveStore();

  return summarizeCampaign(campaign, false);
}

export function activateAwarenessCampaign(campaignId, user) {
  const campaign = ensureCampaign(campaignId);

  if (campaign.status !== "validee") {
    throw new Error("La campagne doit etre validee avant activation.");
  }

  campaign.deliveries = buildDeliveries(campaign);
  campaign.status = "active";
  addAuditEntry(campaign, user, "campaign.activated", {
    deliveries: campaign.deliveries.length
  });
  saveStore();
  return summarizeCampaign(campaign, false);
}

export function cancelAwarenessCampaign(campaignId, user) {
  const campaign = ensureCampaign(campaignId);
  campaign.status = "annulee";
  addAuditEntry(campaign, user, "campaign.cancelled");
  saveStore();
  return summarizeCampaign(campaign, false);
}

export async function dispatchDueAwarenessCampaigns(baseUrl) {
  if (!appConfig.awareness.enabled) {
    return [];
  }

  const provider = getCampaignProvider();
  const now = new Date();
  const dispatched = [];

  for (const campaign of store.campaigns) {
    if (campaign.status !== "active" || !campaign.template) {
      continue;
    }

    const dueDeliveries = campaign.deliveries.filter((delivery) => {
      if (delivery.status !== "planifie") {
        return false;
      }

      const scheduled = new Date(delivery.scheduledAt);
      return !Number.isNaN(scheduled.getTime()) && scheduled <= now;
    });

    if (dueDeliveries.length === 0) {
      continue;
    }

    const messages = dueDeliveries.map((delivery) => {
      const recipient = campaign.recipients.find(
        (entry) => entry.id === delivery.recipientId
      );
      return buildMessageBodies(campaign, recipient, baseUrl);
    });
    const queued = await provider.queueDeliveries({
      campaign,
      deliveries: dueDeliveries,
      messages
    });

    queued.forEach((result) => {
      const delivery = campaign.deliveries.find((entry) => entry.id === result.deliveryId);

      if (delivery) {
        delivery.status = "distribue";
        delivery.distributedAt = new Date().toISOString();
        delivery.providerMessageId = result.providerMessageId;
        recordEvent(campaign, delivery.recipientId, "message_distribue", {
          providerMessageId: result.providerMessageId
        });
      }
    });

    if (
      campaign.deliveries.length > 0 &&
      campaign.deliveries.every((delivery) => delivery.status !== "planifie")
    ) {
      campaign.status = "terminee";
    }

    addAuditEntry(campaign, null, "dispatch.preview", {
      count: queued.length
    });
    dispatched.push(
      ...queued.map((entry) => ({
        campaignId: campaign.id,
        ...entry
      }))
    );
  }

  if (dispatched.length > 0) {
    saveStore();
  }

  return dispatched;
}

function findDeliveryByProviderMessageId(providerMessageId) {
  for (const campaign of store.campaigns) {
    const delivery = campaign.deliveries.find(
      (entry) => entry.providerMessageId === providerMessageId
    );

    if (delivery) {
      return { campaign, delivery };
    }
  }

  return null;
}

function markCampaignCompletion(campaign) {
  if (
    campaign.deliveries.length > 0 &&
    campaign.deliveries.every((delivery) => ["distribue", "ouvert", "clique", "signale"].includes(delivery.status))
  ) {
    campaign.status = "terminee";
  }
}

export function receiveCampaignProviderEvent(payload) {
  requireNonEmpty(payload.providerMessageId, "Identifiant provider obligatoire.");
  requireNonEmpty(payload.type, "Type d'evenement obligatoire.");

  const target = findDeliveryByProviderMessageId(payload.providerMessageId);

  if (!target) {
    throw new Error("Message provider introuvable.");
  }

  const eventType = String(payload.type).trim().toLowerCase();

  if (eventType === "message_sent") {
    target.delivery.status = "distribue";
    recordEvent(target.campaign, target.delivery.recipientId, "message_distribue", {
      providerMessageId: payload.providerMessageId
    });
  } else if (eventType === "message_opened") {
    target.delivery.status = "ouvert";
    recordEvent(target.campaign, target.delivery.recipientId, "ouverture", {
      providerMessageId: payload.providerMessageId
    });
  } else if (eventType === "message_clicked") {
    target.delivery.status = "clique";
    recordEvent(target.campaign, target.delivery.recipientId, "clic", {
      providerMessageId: payload.providerMessageId
    });
  } else if (eventType === "message_reported") {
    target.delivery.status = "signale";
    recordEvent(target.campaign, target.delivery.recipientId, "signalement", {
      providerMessageId: payload.providerMessageId
    });
  } else if (eventType === "campaign_finished") {
    target.campaign.status = "terminee";
    recordEvent(target.campaign, null, "fin_campagne", {
      providerMessageId: payload.providerMessageId
    });
  } else {
    throw new Error("Type d'evenement provider non pris en charge.");
  }

  addAuditEntry(target.campaign, null, "provider.event.received", {
    providerMessageId: payload.providerMessageId,
    type: eventType
  });
  markCampaignCompletion(target.campaign);
  saveStore();

  return {
    campaignId: target.campaign.id,
    deliveryId: target.delivery.id,
    type: eventType
  };
}

export function getAwarenessDashboard() {
  const campaigns = store.campaigns;
  const activeCampaigns = campaigns.filter((campaign) => campaign.status === "active");
  const completedCampaigns = campaigns.filter((campaign) => campaign.status === "terminee");
  const allEvents = campaigns.flatMap((campaign) => campaign.events);
  const groups = store.groups;

  return {
    kpis: [
      { label: "Campagnes", value: campaigns.length },
      { label: "Actives", value: activeCampaigns.length },
      { label: "Terminees", value: completedCampaigns.length },
      { label: "Groupes", value: groups.length }
    ],
    eventCounts: [
      { label: "Messages distribues", value: allEvents.filter((event) => event.type === "message_distribue").length },
      { label: "Ouvertures", value: allEvents.filter((event) => event.type === "ouverture").length },
      { label: "Clics", value: allEvents.filter((event) => event.type === "clic").length },
      { label: "Signalements", value: allEvents.filter((event) => event.type === "signalement").length }
    ],
    campaigns: campaigns.map((campaign) => summarizeCampaign(campaign, true))
  };
}

function escapeCsvValue(value) {
  const normalized = String(value ?? "");
  if (/[;"\n]/.test(normalized)) {
    return `"${normalized.replaceAll("\"", "\"\"")}"`;
  }

  return normalized;
}

export function buildAwarenessReportCsv(campaignId) {
  const campaign = ensureCampaign(campaignId);
  const rows = [
    [
      "campaign_id",
      "recipient_id",
      "recipient_name",
      "email",
      "service",
      "group",
      "delivery_status",
      "scheduled_at",
      "distributed_at"
    ].join(";")
  ];

  campaign.deliveries.forEach((delivery) => {
    const recipient = campaign.recipients.find((entry) => entry.id === delivery.recipientId);
    rows.push(
      [
        campaign.id,
        delivery.recipientId,
        delivery.recipientName,
        delivery.email,
        recipient?.service ?? "",
        recipient?.group ?? "",
        delivery.status,
        delivery.scheduledAt,
        delivery.distributedAt ?? ""
      ]
        .map(escapeCsvValue)
        .join(";")
    );
  });

  return `\uFEFF${rows.join("\n")}\n`;
}

function escapePdfText(value) {
  return String(value ?? "")
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

export function buildAwarenessReportPdf(campaignId) {
  const campaign = ensureCampaign(campaignId);
  const lines = [
    `Rapport campagne: ${campaign.name}`,
    `Statut: ${campaign.status}`,
    `Responsable: ${campaign.responsable}`,
    `Periode: ${campaign.startDate} -> ${campaign.endDate}`,
    `Destinataires: ${campaign.recipients.length}`,
    `Messages distribues: ${campaign.events.filter((event) => event.type === "message_distribue").length}`,
    `Ouvertures: ${campaign.events.filter((event) => event.type === "ouverture").length}`,
    `Clics: ${campaign.events.filter((event) => event.type === "clic").length}`,
    `Signalements: ${campaign.events.filter((event) => event.type === "signalement").length}`
  ];
  const content = [
    "BT",
    "/F1 12 Tf",
    "50 780 Td",
    ...lines.flatMap((line, index) =>
      index === 0
        ? [`(${escapePdfText(line)}) Tj`]
        : ["0 -18 Td", `(${escapePdfText(line)}) Tj`]
    ),
    "ET"
  ].join("\n");

  const objects = [];
  objects.push("1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj");
  objects.push("2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj");
  objects.push(
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj"
  );
  objects.push("4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj");
  objects.push(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj`);

  let offset = "%PDF-1.4\n".length;
  const xref = ["0000000000 65535 f "];
  const body = objects
    .map((object) => {
      xref.push(`${String(offset).padStart(10, "0")} 00000 n `);
      offset += object.length + 1;
      return object;
    })
    .join("\n");
  const xrefOffset = offset;
  const trailer = `xref\n0 ${objects.length + 1}\n${xref.join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(`%PDF-1.4\n${body}\n${trailer}`);
}

export function listAwarenessAuditEntries(limit = 200) {
  return store.campaigns
    .flatMap((campaign) =>
      campaign.auditLog.map((entry) => ({
        ...entry,
        campaignId: campaign.id,
        campaignName: campaign.name
      }))
    )
    .sort((left, right) => right.at.localeCompare(left.at))
    .slice(0, limit);
}

function findTrackingTarget(trackingId) {
  for (const campaign of store.campaigns) {
    const recipient = campaign.recipients.find((entry) => entry.trackingId === trackingId);

    if (recipient) {
      return { campaign, recipient };
    }
  }

  return null;
}

export function handleAwarenessClick({ trackingId, expiresAt, signature }) {
  verifySignedTrackingLink(trackingId, expiresAt, signature, "click");
  const target = findTrackingTarget(trackingId);

  if (!target) {
    throw new Error("Destinataire introuvable.");
  }

  recordEvent(target.campaign, target.recipient.id, "clic");
  recordEvent(target.campaign, target.recipient.id, "page_pedagogique");
  saveStore();

  return buildPedagogicalHtml("Exercice interne de sensibilisation", [
    "Vous venez de cliquer sur un lien d'un exercice interne de sensibilisation a la cybersécurité.",
    "Indices a verifier : adresse d'expedition, domaine, urgence du message, coherence du contexte RH et lien propose.",
    "Ne saisissez jamais de mot de passe ou d'information sensible sur une page non verifiee.",
    "En cas de doute, signalez le message au service informatique selon la procedure interne IECB.",
    "Aucune information de connexion n'a ete demandee ni enregistree dans cet exercice."
  ]);
}

export function handleAwarenessReport({ trackingId, expiresAt, signature }) {
  verifySignedTrackingLink(trackingId, expiresAt, signature, "report");
  const target = findTrackingTarget(trackingId);

  if (!target) {
    throw new Error("Destinataire introuvable.");
  }

  recordEvent(target.campaign, target.recipient.id, "signalement");
  saveStore();

  return buildPedagogicalHtml("Signalement enregistre", [
    "Votre signalement a ete enregistre pour cet exercice interne.",
    "Vous avez applique la bonne pratique en signalant le message au lieu de poursuivre l'action.",
    "Continuez a verifier l'expediteur, le domaine et le contexte avant toute interaction."
  ]);
}

export function handleAwarenessUnsubscribe({ trackingId, expiresAt, signature }) {
  verifySignedTrackingLink(trackingId, expiresAt, signature, "unsubscribe");
  const target = findTrackingTarget(trackingId);

  if (!target) {
    throw new Error("Destinataire introuvable.");
  }

  target.recipient.excluded = true;
  target.recipient.exclusionReason = "Desinscription individuelle";
  target.recipient.unsubscribedAt = new Date().toISOString();
  addAuditEntry(target.campaign, null, "recipient.unsubscribed", {
    recipientId: target.recipient.id
  });
  saveStore();

  return buildPedagogicalHtml("Desinscription prise en compte", [
    "Vous avez ete retire de cette campagne de sensibilisation.",
    "Si cette desinscription concerne un profil sensible, merci d'en informer egalement l'equipe pilote."
  ]);
}

export function cleanupAwarenessData() {
  const now = new Date();
  const initialCount = store.campaigns.length;

  store.campaigns = store.campaigns.filter((campaign) => {
    if (!["terminee", "annulee"].includes(campaign.status)) {
      return true;
    }

    const endDate = parseDateOnly(campaign.endDate);
    const ageInDays =
      (now.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24);

    return ageInDays <= campaign.settings.retentionDays;
  });

  if (store.campaigns.length !== initialCount) {
    saveStore();
  }

  return {
    removedCampaigns: initialCount - store.campaigns.length
  };
}
