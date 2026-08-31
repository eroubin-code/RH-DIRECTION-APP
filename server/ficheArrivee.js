// Generation de la "Fiche d'arrivee" pre-remplie a la validation d'une saisie
// arrivant : on superpose les valeurs de la personne sur un PDF modele (non
// fourni par ce depot, cf. RH_FICHE_ARRIVEE_TEMPLATE), les pages annexes du
// modele sont conservees telles quelles.
//
// Les coordonnees ci-dessous sont exprimees en pixels sur un rendu de reference
// large de REF_WIDTH_PX ; elles sont mises a l'echelle de la taille reelle de la
// page. A ajuster apres un premier rendu reel (repere : origine en HAUT a gauche,
// comme a l'ecran).
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { appConfig } from "./config.js";

const REF_WIDTH_PX = 950;

// { champ: [pageIndex, xPx, yPx] } — origine haut-gauche.
const LAYOUT = {
  civiliteM: [0, 452, 274],
  civiliteMme: [0, 523, 274],
  nom: [0, 185, 305],
  prenom: [0, 195, 337],
  naissance: [0, 265, 370],
  personnelPermanent: [0, 392, 500],
  personnelTemporaire: [0, 537, 500],
  dateEntree: [0, 232, 524],
  dateSortie: [0, 553, 524],
  corpsGrade: [0, 250, 665],
  autreStatut: [0, 350, 697],
  organisme: [0, 560, 730],
  chefDeGroupe: [0, 300, 795],
  boxBadge: [0, 129, 877],
  numeroBadge: [0, 610, 877],
  boxMessagerie: [0, 476, 825],
  boxStagiaire: [0, 227, 1025],
  boxAutreAcces: [0, 547, 1025],
  boxAccesGeneral: [0, 281, 1086]
};

function formatFrDate(value) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : raw;
}

function isStudentStatus(fonction) {
  return /stagiaire|doctora|th[eè]se|apprenti|alternan/i.test(String(fonction ?? ""));
}

// data : { civilite, nom, prenom, naissance, permanent, arrivee, depart,
//          fonction, typePersonne, tutelle, entite, badgeDemande, numeroBadge,
//          chefDeGroupe }
// -> Buffer du PDF pre-rempli, ou null si le modele est indisponible.
export async function buildFicheArriveePdf(data) {
  const templatePath = path.resolve(appConfig.ficheArrivee.templatePath);
  let templateBytes;

  try {
    templateBytes = await readFile(templatePath);
  } catch {
    console.warn(
      `[fiche-arrivee] Modele introuvable (${templatePath}) - fiche non generee.`
    );
    return null;
  }

  const pdfDoc = await PDFDocument.load(templateBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pages = pdfDoc.getPages();
  const ink = rgb(0.05, 0.1, 0.45);

  const put = (key, value, { mark = false } = {}) => {
    const spec = LAYOUT[key];
    const text = mark ? "X" : String(value ?? "").trim();

    if (!spec || !text) {
      return;
    }

    const [pageIndex, xPx, yPx] = spec;
    const page = pages[pageIndex];

    if (!page) {
      return;
    }

    const { width, height } = page.getSize();
    const scale = width / REF_WIDTH_PX;

    page.drawText(text, {
      x: xPx * scale,
      y: height - yPx * scale,
      size: mark ? 11 : 9,
      font: mark ? bold : font,
      color: ink
    });
  };

  const civ = String(data.civilite ?? "").trim().toLowerCase();
  if (civ.startsWith("m") && !civ.startsWith("mme") && civ !== "madame") {
    put("civiliteM", null, { mark: true });
  } else if (civ) {
    put("civiliteMme", null, { mark: true });
  }

  put("nom", data.nom);
  put("prenom", data.prenom);
  put("naissance", formatFrDate(data.naissance));

  if (data.permanent) {
    put("personnelPermanent", null, { mark: true });
  } else {
    put("personnelTemporaire", null, { mark: true });
  }

  put("dateEntree", formatFrDate(data.arrivee));
  put("dateSortie", formatFrDate(data.depart));
  put("organisme", data.tutelle);
  put("chefDeGroupe", data.chefDeGroupe);

  if (isStudentStatus(data.fonction)) {
    put("autreStatut", data.fonction);
    put("boxStagiaire", null, { mark: true });
  } else {
    put("corpsGrade", data.fonction);
    put("boxAutreAcces", null, { mark: true });
  }

  if (data.badgeDemande) {
    put("boxBadge", null, { mark: true });
    put("numeroBadge", data.numeroBadge);
  }

  if (!isStudentStatus(data.fonction)) {
    put("boxMessagerie", null, { mark: true });
  }

  put("boxAccesGeneral", null, { mark: true });

  const bytes = await pdfDoc.save();
  return Buffer.from(bytes);
}
