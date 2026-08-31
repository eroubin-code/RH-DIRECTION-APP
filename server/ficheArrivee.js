// Generation de la "Fiche d'arrivee" a la validation d'une saisie arrivant.
//
// Deux modes :
//  - si un PDF existe a RH_FICHE_ARRIVEE_TEMPLATE : on superpose les valeurs sur
//    ce modele (coordonnees dans OVERLAY_LAYOUT), les pages annexes sont gardees ;
//  - sinon : on compose une fiche "maison" (2 pages) avec les polices Liberation
//    embarquees et le bandeau IECB.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { appConfig } from "./config.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FONT_DIR = path.join(HERE, "assets", "fonts");

const PAGE = { w: 595.28, h: 841.89 };
const M = 54;
const RIGHT = PAGE.w - M;
const LABEL_W = 172;
const VALUE_X = M + LABEL_W + 14;
const ROW = 27;

const C = {
  accent: rgb(0.12, 0.34, 0.45),
  ink: rgb(0.11, 0.12, 0.13),
  muted: rgb(0.42, 0.46, 0.5),
  rule: rgb(0.79, 0.83, 0.86),
  white: rgb(1, 1, 1)
};

function formatFrDate(value) {
  const raw = String(value ?? "").trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : raw;
}

function isStagiaire(value) {
  return /stagiaire/i.test(String(value ?? ""));
}

async function loadFonts(pdfDoc) {
  try {
    pdfDoc.registerFontkit(fontkit);
    const [reg, bold, serifBold] = await Promise.all([
      readFile(path.join(FONT_DIR, "LiberationSans-Regular.ttf")),
      readFile(path.join(FONT_DIR, "LiberationSans-Bold.ttf")),
      readFile(path.join(FONT_DIR, "LiberationSerif-Bold.ttf"))
    ]);
    return {
      regular: await pdfDoc.embedFont(reg, { subset: true }),
      bold: await pdfDoc.embedFont(bold, { subset: true }),
      title: await pdfDoc.embedFont(serifBold, { subset: true })
    };
  } catch {
    return {
      regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
      bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
      title: await pdfDoc.embedFont(StandardFonts.TimesRomanBold)
    };
  }
}

// ------------------------------------------------------------------ helpers dessin

function drawHeader(page, F, pageLabel) {
  const top = PAGE.h - M;

  const bars = [3.2, 1.6, 4.8, 1.6, 2.4, 3.2, 1.6, 4, 2.4, 1.6];
  const shades = [0.14, 0.5, 0.14, 0.66, 0.32, 0.14, 0.56, 0.2, 0.42, 0.28];
  let bx = M;
  bars.forEach((w, i) => {
    page.drawRectangle({
      x: bx,
      y: top - 30,
      width: w,
      height: 30,
      color: rgb(shades[i], shades[i] + 0.05, shades[i] + 0.12)
    });
    bx += w + 1.7;
  });
  page.drawText("IECB", { x: M, y: top - 44, size: 11, font: F.title, color: C.accent });

  page.drawLine({
    start: { x: M + 122, y: top + 2 },
    end: { x: M + 122, y: top - 46 },
    thickness: 0.8,
    color: C.rule
  });

  page.drawText("FICHE D'ARRIVÉE", { x: M + 140, y: top - 14, size: 19, font: F.title, color: C.ink });
  page.drawText("Nouvel entrant — à compléter et à faire circuler", {
    x: M + 141,
    y: top - 30,
    size: 8.5,
    font: F.regular,
    color: C.muted
  });

  const refLines = [
    "Formulaire RH",
    `Date : ${new Date().toLocaleDateString("fr-FR")}`,
    `Page ${pageLabel}`
  ];
  refLines.forEach((t, i) => {
    const size = i === 0 ? 8 : 8.5;
    const w = (i === 0 ? F.bold : F.regular).widthOfTextAtSize(t, size);
    page.drawText(t, {
      x: RIGHT - w,
      y: top - 8 - i * 12,
      size,
      font: i === 0 ? F.bold : F.regular,
      color: i === 0 ? C.accent : C.muted
    });
  });

  const ruleY = top - 58;
  page.drawLine({ start: { x: M, y: ruleY }, end: { x: RIGHT, y: ruleY }, thickness: 1.2, color: C.accent });
  page.drawLine({ start: { x: M, y: ruleY - 2.6 }, end: { x: RIGHT, y: ruleY - 2.6 }, thickness: 0.4, color: C.accent });

  return ruleY - 30;
}

function drawFooter(page, F) {
  const y = M - 14;
  page.drawLine({ start: { x: M, y: y + 12 }, end: { x: RIGHT, y: y + 12 }, thickness: 0.4, color: C.rule });
  const t = "IECB · 2 rue Robert Escarpit · 33607 Pessac Cedex · Tél. 05 40 00 30 38";
  const w = F.regular.widthOfTextAtSize(t, 7);
  page.drawText(t, { x: (PAGE.w - w) / 2, y, size: 7, font: F.regular, color: C.muted });
}

function section(page, F, y, label) {
  const text = label.toUpperCase();
  const size = 9;
  const gap = 1.5;
  let x = M;
  for (const ch of text) {
    page.drawText(ch, { x, y, size, font: F.bold, color: C.accent });
    x += F.bold.widthOfTextAtSize(ch, size) + gap;
  }
  page.drawLine({ start: { x: x + 10, y: y + 3 }, end: { x: RIGHT, y: y + 3 }, thickness: 0.6, color: C.rule });
  return y - 26;
}

function labelText(page, F, y, label) {
  const w = F.regular.widthOfTextAtSize(label, 8.5);
  page.drawText(label, { x: M + LABEL_W - w, y, size: 8.5, font: F.regular, color: C.muted });
}

function field(page, F, y, label, value, { endX = RIGHT } = {}) {
  if (label) {
    labelText(page, F, y, label);
  }
  page.drawLine({ start: { x: VALUE_X, y: y - 3 }, end: { x: endX, y: y - 3 }, thickness: 0.5, color: C.rule });
  const v = String(value ?? "").trim();
  if (v) {
    page.drawText(v, { x: VALUE_X, y, size: 9.5, font: F.regular, color: C.ink });
  }
  return y - ROW;
}

function checkbox(page, F, x, y, checked, label) {
  page.drawRectangle({ x, y: y - 8.5, width: 9, height: 9, borderWidth: 0.9, borderColor: C.accent });
  if (checked) {
    page.drawLine({ start: { x: x + 1.6, y: y - 4.2 }, end: { x: x + 3.6, y: y - 6.6 }, thickness: 1.3, color: C.accent });
    page.drawLine({ start: { x: x + 3.6, y: y - 6.6 }, end: { x: x + 7.6, y: y - 1.4 }, thickness: 1.3, color: C.accent });
  }
  page.drawText(label, { x: x + 15, y: y - 7, size: 8.5, font: F.regular, color: C.ink });
}

// ------------------------------------------------------------------ fiche "maison"

function buildComposedPdf(pdfDoc, F, d) {
  const permanent = !d.depart;
  const stagiaire = isStagiaire(d.typePersonne) || isStagiaire(d.fonction);
  const civ = String(d.civilite ?? "").trim().toLowerCase();

  // ---------- PAGE 1 ----------
  const p1 = pdfDoc.addPage([PAGE.w, PAGE.h]);
  let y = drawHeader(p1, F, "1 / 2");

  y = section(p1, F, y, "Identité");
  labelText(p1, F, y, "Civilité");
  checkbox(p1, F, VALUE_X, y, civ === "monsieur" || civ === "m." || civ === "m", "Monsieur");
  checkbox(p1, F, VALUE_X + 120, y, civ === "madame" || civ === "mme", "Madame");
  y -= ROW;
  y = field(p1, F, y, "Nom", d.nom);
  y = field(p1, F, y, "Prénom", d.prenom);
  y = field(p1, F, y, "Date de naissance", formatFrDate(d.naissance));
  y = field(p1, F, y, "Adresse", "");
  y = field(p1, F, y, "", "");
  y = field(p1, F, y, "Téléphone", "");

  y -= 6;
  y = section(p1, F, y, "Statut & rattachement");
  labelText(p1, F, y, "Type de personnel");
  checkbox(p1, F, VALUE_X, y, permanent, "Permanent");
  checkbox(p1, F, VALUE_X + 120, y, !permanent, "Temporaire");
  y -= ROW;
  y = field(p1, F, y, "Date d'entrée", formatFrDate(d.arrivee), { endX: M + LABEL_W + 132 });
  {
    const lx = M + LABEL_W + 154;
    p1.drawText("Date de sortie", { x: lx, y: y + ROW, size: 8.5, font: F.regular, color: C.muted });
    p1.drawLine({ start: { x: lx + 78, y: y + ROW - 3 }, end: { x: RIGHT, y: y + ROW - 3 }, thickness: 0.5, color: C.rule });
    if (d.depart) {
      p1.drawText(formatFrDate(d.depart), { x: lx + 82, y: y + ROW, size: 9.5, font: F.regular, color: C.ink });
    }
  }
  y = field(p1, F, y, "Fonction / corps & grade", d.fonction);
  y = field(p1, F, y, "Statut (doctorant, stagiaire…)", stagiaire ? d.typePersonne || d.fonction : "");
  y = field(p1, F, y, "Organisme de rattachement", d.tutelle);
  y = field(p1, F, y, "Équipe / entité", d.entite);
  y = field(p1, F, y, "Nom du chef de groupe", d.chefDeGroupe);

  y -= 6;
  y = section(p1, F, y, "Accès & équipement");
  const colR = M + 258;
  let yl = y;
  checkbox(p1, F, M, yl, false, "Clé de la pièce n°  ....................");
  checkbox(p1, F, colR, yl, !stagiaire, "Création d'un compte de messagerie");
  yl -= 22;
  checkbox(p1, F, M, yl, false, "Localisé en pièce n°  ....................");
  checkbox(p1, F, colR, yl, false, "Attribution d'un numéro de téléphone");
  yl -= 22;
  checkbox(p1, F, M, yl, Boolean(d.badgeDemande), `Badge d'accès${d.numeroBadge ? `   —   n° ${d.numeroBadge}` : ""}`);
  checkbox(p1, F, colR, yl, false, "Joignable au poste n°  ..............");
  y = yl - 30;

  p1.drawText("Badge autorisé aux conditions suivantes :", { x: M, y, size: 8.5, font: F.regular, color: C.muted });
  y -= 20;
  checkbox(p1, F, M, y, stagiaire, "Stagiaire   —   accès 07h – 19h, 5j/7");
  checkbox(p1, F, colR, y, !stagiaire, "Autre   —   accès 06h – 21h, 5j/7");
  y -= 22;
  checkbox(p1, F, M, y, true, "Accès général à l'Institut IECB / Labos");

  drawFooter(p1, F);

  // ---------- PAGE 2 ----------
  const p2 = pdfDoc.addPage([PAGE.w, PAGE.h]);
  let y2 = drawHeader(p2, F, "2 / 2");

  y2 = section(p2, F, y2, "Accès spécifiques");
  checkbox(p2, F, M, y2, false, "Accès administration / Direction");
  y2 -= 22;
  checkbox(p2, F, M, y2, false, "Accès Bâtiment A, 1er étage, partie centrale");
  y2 -= 40;

  y2 = section(p2, F, y2, "Circuit de validation");
  p2.drawText(
    "À parcourir par le nouvel arrivant, accompagné de son chef de projet ou d'un permanent du groupe.",
    { x: M, y: y2, size: 8, font: F.regular, color: C.muted }
  );
  y2 -= 22;
  const cols = ["Corresp. sécurité", "Ressources info.", "Gestionnaire", "Chef de groupe", "Accueil"];
  const cw = (RIGHT - M) / cols.length;
  const tableTop = y2;
  const rowH = 96;
  p2.drawRectangle({ x: M, y: tableTop - 17, width: RIGHT - M, height: 17, color: C.accent });
  cols.forEach((c, i) => {
    p2.drawText(c, { x: M + i * cw + 6, y: tableTop - 12.5, size: 7, font: F.bold, color: C.white });
  });
  p2.drawRectangle({
    x: M,
    y: tableTop - 17 - rowH,
    width: RIGHT - M,
    height: rowH,
    borderWidth: 0.6,
    borderColor: C.rule
  });
  cols.forEach((_, i) => {
    if (i) {
      p2.drawLine({
        start: { x: M + i * cw, y: tableTop - 17 },
        end: { x: M + i * cw, y: tableTop - 17 - rowH },
        thickness: 0.5,
        color: C.rule
      });
    }
    p2.drawText("Nom", { x: M + i * cw + 6, y: tableTop - 34, size: 6.5, font: F.regular, color: C.muted });
    p2.drawText("Signature", { x: M + i * cw + 6, y: tableTop - 17 - rowH + 12, size: 6.5, font: F.regular, color: C.muted });
  });
  y2 = tableTop - 17 - rowH - 36;

  y2 = section(p2, F, y2, "Engagement du nouvel arrivant");
  p2.drawText("Je soussigné(e)", { x: M, y: y2, size: 8.5, font: F.regular, color: C.muted });
  p2.drawLine({ start: { x: M + 80, y: y2 - 3 }, end: { x: RIGHT, y: y2 - 3 }, thickness: 0.5, color: C.rule });
  if (d.prenom || d.nom) {
    p2.drawText(`${d.prenom ?? ""} ${d.nom ?? ""}`.trim(), { x: M + 84, y: y2, size: 9.5, font: F.regular, color: C.ink });
  }
  y2 -= 24;
  [
    "Avoir pris connaissance des règles d'utilisation des cartes d'accès et de la charte informatique CNRS.",
    "Avoir pris connaissance du plan d'évacuation et des consignes de sécurité incendie.",
    "Avoir reçu le badge et/ou les clés mentionnés ci-dessus."
  ].forEach((t) => {
    p2.drawText("•", { x: M, y: y2, size: 9, font: F.regular, color: C.accent });
    p2.drawText(t, { x: M + 13, y: y2, size: 8.5, font: F.regular, color: C.ink });
    y2 -= 16;
  });
  y2 -= 12;
  p2.drawText("48h avant le départ, penser à remplir la fiche de sortie.", {
    x: M,
    y: y2,
    size: 8.5,
    font: F.bold,
    color: C.accent
  });
  y2 -= 34;
  p2.drawText("Fait à Pessac, le", { x: M, y: y2, size: 8.5, font: F.regular, color: C.muted });
  p2.drawLine({ start: { x: M + 82, y: y2 - 3 }, end: { x: M + 210, y: y2 - 3 }, thickness: 0.5, color: C.rule });
  p2.drawText("Signature", { x: M + 250, y: y2, size: 8.5, font: F.regular, color: C.muted });
  p2.drawLine({ start: { x: M + 300, y: y2 - 3 }, end: { x: RIGHT, y: y2 - 3 }, thickness: 0.5, color: C.rule });

  drawFooter(p2, F);
}

// ------------------------------------------------------------------ overlay (modele externe)

const REF_WIDTH_PX = 950;
const OVERLAY_LAYOUT = {
  civiliteM: [0, 452, 339],
  civiliteMme: [0, 551, 339],
  nom: [0, 212, 375],
  prenom: [0, 236, 426],
  naissance: [0, 332, 477],
  personnelPermanent: [0, 425, 711],
  personnelTemporaire: [0, 616, 711],
  dateEntree: [0, 284, 743],
  dateSortie: [0, 707, 743],
  corpsGrade: [0, 300, 894],
  autreStatut: [0, 420, 945],
  organisme: [0, 571, 996],
  chefDeGroupe: [0, 364, 1093],
  boxBadge: [0, 153, 1231],
  numeroBadge: [0, 479, 1222],
  boxMessagerie: [0, 640, 1151],
  boxStagiaire: [0, 281, 1412],
  boxAutreAcces: [0, 688, 1412],
  boxAccesGeneral: [0, 377, 1475]
};

async function buildOverlayPdf(templateBytes, d) {
  const pdfDoc = await PDFDocument.load(templateBytes);
  const pages = pdfDoc.getPages();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.05, 0.1, 0.45);
  const stagiaire = isStagiaire(d.typePersonne) || isStagiaire(d.fonction);

  const put = (key, value, mark = false) => {
    const spec = OVERLAY_LAYOUT[key];
    const text = mark ? "X" : String(value ?? "").trim();
    if (!spec || !text) return;
    const [pi, xPx, yPx] = spec;
    const page = pages[pi];
    if (!page) return;
    const { width, height } = page.getSize();
    const s = width / REF_WIDTH_PX;
    page.drawText(text, {
      x: xPx * s,
      y: height - yPx * s,
      size: mark ? 11 : 9,
      font: mark ? bold : font,
      color: ink
    });
  };

  const civ = String(d.civilite ?? "").trim().toLowerCase();
  if (civ === "monsieur" || civ === "m." || civ === "m") put("civiliteM", null, true);
  else if (civ) put("civiliteMme", null, true);
  put("nom", d.nom);
  put("prenom", d.prenom);
  put("naissance", formatFrDate(d.naissance));
  if (d.depart) put("personnelTemporaire", null, true);
  else put("personnelPermanent", null, true);
  put("dateEntree", formatFrDate(d.arrivee));
  put("dateSortie", formatFrDate(d.depart));
  put("corpsGrade", d.fonction);
  if (stagiaire) put("autreStatut", d.typePersonne || d.fonction);
  put("organisme", d.tutelle);
  put("chefDeGroupe", d.chefDeGroupe);
  if (d.badgeDemande) {
    put("boxBadge", null, true);
    put("numeroBadge", d.numeroBadge);
  }
  if (!stagiaire) put("boxMessagerie", null, true);
  if (stagiaire) put("boxStagiaire", null, true);
  else put("boxAutreAcces", null, true);
  put("boxAccesGeneral", null, true);

  return Buffer.from(await pdfDoc.save());
}

// ------------------------------------------------------------------ API

// data : { civilite, nom, prenom, naissance, arrivee, depart, fonction,
//          typePersonne, tutelle, entite, badgeDemande, numeroBadge, chefDeGroupe }
export async function buildFicheArriveePdf(data) {
  const configured = String(appConfig.ficheArrivee.templatePath ?? "").trim();
  let templateBytes = null;

  if (configured) {
    try {
      templateBytes = await readFile(path.resolve(configured));
    } catch {
      templateBytes = null;
    }
  }

  if (templateBytes) {
    return buildOverlayPdf(templateBytes, data);
  }

  const pdfDoc = await PDFDocument.create();
  const F = await loadFonts(pdfDoc);
  buildComposedPdf(pdfDoc, F, data);
  pdfDoc.setTitle("Fiche d'arrivee");
  pdfDoc.setProducer("RH Direction App");
  return Buffer.from(await pdfDoc.save());
}
