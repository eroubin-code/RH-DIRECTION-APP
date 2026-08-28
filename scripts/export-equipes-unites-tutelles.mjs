import fs from "node:fs/promises";
import path from "node:path";
import { deflateRawSync } from "node:zlib";

const outputPath = path.resolve("exports/entites-equipes-unites-tutelles.xlsx");

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function inlineTextCell(reference, value, styleId = 0) {
  return `<c r="${reference}" t="inlineStr" s="${styleId}"><is><t>${escapeXml(value)}</t></is></c>`;
}

function crc32(buffer) {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const [name, content] of Object.entries(entries)) {
    const nameBuffer = Buffer.from(name, "utf8");
    const source = Buffer.from(content, "utf8");
    const compressed = deflateRawSync(source);
    const checksum = crc32(source);
    const localHeader = Buffer.alloc(30);

    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(source.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localParts.push(localHeader, nameBuffer, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(source.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt32LE(offset, 42);
    centralParts.push(centralHeader, nameBuffer);
    offset += localHeader.length + nameBuffer.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endOfDirectory = Buffer.alloc(22);
  endOfDirectory.writeUInt32LE(0x06054b50, 0);
  endOfDirectory.writeUInt16LE(Object.keys(entries).length, 8);
  endOfDirectory.writeUInt16LE(Object.keys(entries).length, 10);
  endOfDirectory.writeUInt32LE(centralDirectory.length, 12);
  endOfDirectory.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, endOfDirectory]);
}

// Référence fournie depuis la table Entités : l'ordre est volontairement conservé.
const rows = [
  ["XI", "ARNA"],
  ["DURRIEU", "CBMN"],
  ["ODA", "CBMN"],
  ["LOQUET", "CBMN"],
  ["FRISCOURT", "ISM"],
  ["FRONZES", "MFP"],
  ["FICHOU", "CBMN"],
  ["STAHL", "LBM"],
  ["GHOSEZ", ""],
  ["FERRAND", "CBMN"],
  ["GUCHARD", "CBMN"],
  ["HASHEM", "ARNA"],
  ["AZNAURYAN", "ARNA"],
  ["KRASTEVA", "CBMN"],
  ["THINON", "CBMN"],
  ["REYES", "MFP"],
  ["MAISONNEUVE", "CBMN"],
  ["CAMPAGNE", "ARNA"]
].map(([equipe, uniteTutelle]) => ({ equipe, uniteTutelle }));

const sheetRows = [
  `<row r="1">${inlineTextCell("A1", "Équipe", 1)}${inlineTextCell("B1", "Unité de tutelle", 1)}${inlineTextCell("C1", "Adresse de facturation", 1)}${inlineTextCell("D1", "Ville", 1)}${inlineTextCell("E1", "Code postal", 1)}${inlineTextCell("F1", "Nom du gestionnaire", 1)}${inlineTextCell("G1", "Prénom du gestionnaire", 1)}${inlineTextCell("H1", "Adresse e-mail du gestionnaire", 1)}</row>`,
  ...rows.map(
    (row, index) =>
      `<row r="${index + 2}">${inlineTextCell(`A${index + 2}`, row.equipe)}${inlineTextCell(`B${index + 2}`, row.uniteTutelle)}${inlineTextCell(`C${index + 2}`, "")}${inlineTextCell(`D${index + 2}`, "")}${inlineTextCell(`E${index + 2}`, "")}${inlineTextCell(`F${index + 2}`, "")}${inlineTextCell(`G${index + 2}`, "")}${inlineTextCell(`H${index + 2}`, "")}</row>`
  )
].join("");

const files = {
  "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
  "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
  "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Équipes" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
  "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
  "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="1" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>
</styleSheet>`,
  "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  <cols><col min="1" max="1" width="24" customWidth="1"/><col min="2" max="2" width="22" customWidth="1"/><col min="3" max="3" width="34" customWidth="1"/><col min="4" max="4" width="22" customWidth="1"/><col min="5" max="5" width="16" customWidth="1"/><col min="6" max="6" width="26" customWidth="1"/><col min="7" max="7" width="28" customWidth="1"/><col min="8" max="8" width="38" customWidth="1"/></cols>
  <sheetData>${sheetRows}</sheetData>
  <autoFilter ref="A1:H${rows.length + 1}"/>
</worksheet>`
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, createZip(files));
console.log(`Fichier créé : ${outputPath} (${rows.length} équipes)`);
