import fs from 'fs';
import { chromium } from 'playwright';

const USER_DATA_DIR = './sesame-user-data';
const CSV_FILE = './sesame-accesses.csv';
const SESAME_PROFILES_URL = 'https://sesame.u-bordeaux.fr/';
const PROFILE_BUTTON_TEXT = 'Afficher les membres';
const NAME_EXCLUDE_PATTERN = /(utiliser|application|menu|profil|fermer|rechercher|permission|service|accès|action|gestion)/i;
const MIN_NAME_WORDS = 2;

function normalize(text) {
  return text?.replace(/[\s\u00A0]+/g, ' ').trim() || '';
}

function buildCsvLine(profile, person) {
  return `"${profile.replace(/"/g, '""')}";"${person.replace(/"/g, '""')}"`;
}

async function findProfileButtons(page) {
  const buttons = await page.locator(`button:has-text("${PROFILE_BUTTON_TEXT}")`).all();
  const anchors = await page.locator(`a:has-text("${PROFILE_BUTTON_TEXT}")`).all();
  const combined = [...buttons, ...anchors];
  return combined;
}

async function captureProfileName(button, index) {
  const rawName = await button.evaluate((btn, profileText) => {
    const excluded = [profileText, 'Afficher les membres', 'Afficher membres'];
    const row = btn.closest('tr, li, div[class*="profil"], div[class*="profile"], div[class*="row"], section') || btn.parentElement;
    if (!row) {
      return btn.innerText;
    }
    const candidates = Array.from(row.querySelectorAll('h1,h2,h3,h4,h5,h6,span,div,td,th'))
      .map(el => el.innerText.trim())
      .filter(text => text && !excluded.some(ex => text.includes(ex)) && text.length < 140);
    const stable = candidates.find(text => text.split(/\s+/).length >= 2 && !/^(?:\d+|\W+)$/i.test(text));
    if (stable) {
      return stable;
    }
    const siblingTexts = Array.from(row.children)
      .map(el => el.innerText.trim())
      .filter(text => text && text !== btn.innerText && text.length < 140 && !excluded.some(ex => text.includes(ex)));
    return siblingTexts[0] || row.innerText.replace(btn.innerText, '').trim();
  }, PROFILE_BUTTON_TEXT);

  const profileName = normalize(rawName);
  if (profileName.length === 0) {
    console.warn(`⚠️  Profil #${index + 1} : impossible de lire le nom du profil, utilisation d’un fallback.`);
    return `profil-inconnu-${index + 1}`;
  }
  return profileName;
}

async function openMemberPanel(page, button) {
  await button.scrollIntoViewIfNeeded();
  await Promise.all([
    page.waitForResponse(response => response.status() < 400, { timeout: 8000 }).catch(() => null),
    button.click({ force: true }),
  ]);

  const panel = page.locator('div[role="dialog"], section[role="dialog"], .modal, .popup, .panel, .members-list, .member-dialog').first();
  await panel.waitFor({ state: 'visible', timeout: 8000 });
  return panel;
}

async function extractPersonNames(panel) {
  const names = await panel.evaluate((container) => {
    const exclude = /(utiliser|application|menu|profil|fermer|rechercher|permission|service|accès|action|gestion|valider|annuler)/i;
    const extractText = (node) => normalize(node.textContent || '');

    const anchorNames = Array.from(container.querySelectorAll('a'))
      .map(a => ({
        text: extractText(a),
        href: a.getAttribute('href') || '',
      }))
      .filter(item => item.text && item.text.split(/\s+/).length >= 2 && !exclude.test(item.text) && !/utiliser/i.test(item.text))
      .map(item => item.text);

    const visibleTextNodes = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const text = normalize(node.textContent || '');
        if (!text || text.length > 80 || exclude.test(text)) return NodeFilter.FILTER_REJECT;
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest('button, [role="button"], .icon, .tooltip, .menu, .nav')) return NodeFilter.FILTER_REJECT;
        if (/^(?:\d+|\W+)$/i.test(text)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    while (walker.nextNode()) {
      visibleTextNodes.push(extractText(walker.currentNode));
    }

    const candidateTexts = [...anchorNames, ...visibleTextNodes];
    return [...new Set(candidateTexts)]
      .filter(text => text.split(/\s+/).length >= 2)
      .map(text => text.replace(/\s+/g, ' ').trim());

    function normalize(value) {
      return value.replace(/[\s\u00A0]+/g, ' ').trim();
    }
  });

  return names.filter((name) => name && name.length > 0);
}

async function closeMemberPanel(page) {
  const closeButton = page.locator('button:has-text("Fermer"), button[aria-label="Fermer"], .close, .close-button').first();
  if (await closeButton.count()) {
    await closeButton.click({ force: true }).catch(() => null);
    return;
  }
  await page.keyboard.press('Escape');
}

async function run() {
  console.log('✅ Début du script d’extraction Sésame');
  console.log('ℹ️  Utilisation du dossier de session:', USER_DATA_DIR);
  console.log('ℹ️  URL de départ:', SESAME_PROFILES_URL);

  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless: false,
    viewport: { width: 1600, height: 1000 },
  });
  const page = await context.newPage();
  await page.goto(SESAME_PROFILES_URL, { waitUntil: 'networkidle' });
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(2000);

  const profileButtons = await findProfileButtons(page);
  console.log(`🔎 ${profileButtons.length} bouton(s) '${PROFILE_BUTTON_TEXT}' détecté(s)`);

  if (profileButtons.length === 0) {
    console.error('❌ Aucun bouton 