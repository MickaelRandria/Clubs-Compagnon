// Captures du mode démo à 390 px de large (iPhone), dans captures/ (ignoré par git).
// `npm run captures` : les pages principales. `npm run captures -- /matchs/211 /club#palmares` : celles-là.
// `npm run captures -- --connecte` : avec le compte démo (Vestiaire ouvert).
// Signale toute page qui déborde horizontalement : c'est la règle des 390 px de CLAUDE.md.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const PORT = 5175;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = 'captures';
const signedIn = process.argv.includes('--connecte');

const firstId = (name: string) => (JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8')) as { id: number }[])[0].id;
const asked = process.argv.slice(2).filter((arg) => arg.startsWith('/'));
const pages = asked.length > 0 ? asked : [
  '/', '/matchs', `/matchs/${firstId('matches')}`, '/joueurs', `/joueurs/${firstId('members')}`, '/club', '/paris', '/playoffs',
];

/** Chrome du poste, Chromium de la session cloud, ou celui installé par `npx playwright-core install chromium`. */
function browserPath() {
  const candidates = [process.env.CHROME_EXECUTABLE, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', (() => { try { return chromium.executablePath(); } catch { return undefined; } })()];
  return candidates.find((path) => path && existsSync(path));
}

const executablePath = browserPath();
if (!executablePath) throw new Error('Aucun navigateur trouvé : lance `npx playwright-core install chromium` ou définis CHROME_EXECUTABLE.');

const server = spawn(process.execPath, ['--import', 'tsx', 'demo/serve.ts', ...(signedIn ? ['--connecte'] : [])], { env: process.env, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise<void>((resolve, reject) => {
  server.stdout.on('data', (chunk: Buffer) => { if (chunk.toString().includes(BASE)) resolve(); });
  server.on('exit', (code) => reject(new Error(`Le serveur de démo s'est arrêté (code ${code}).`)));
});

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath, headless: true });
let overflowing = 0;
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' });
  // Le guide de démarrage et l'annonce du pari gagné (rencontre 0 de demo/serve.ts) masqueraient la page.
  await context.addInitScript(() => { localStorage.setItem('dommage.tour.v3', 'done'); localStorage.setItem('bets.seen.0', '1'); });
  const page = await context.newPage();
  for (const path of pages) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(600); // fin des animations d'entrée des tuiles
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    const name = (path.replace(/[/#?]+/g, '-').replace(/^-|-$/g, '') || 'accueil') + (signedIn ? '-connecte' : '');
    // Fenêtre agrandie à la hauteur de la page : la barre d'onglets fixe reste en bas de l'image
    // au lieu de flotter au milieu d'une capture pleine page.
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewportSize({ width: 390, height: Math.max(844, height) });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${OUT}/${name}.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    if (width > 390) overflowing++;
    console.log(`${width > 390 ? '✗ DÉBORDE' : '✓'} ${path} → ${OUT}/${name}.png${width > 390 ? ` (${width} px de large)` : ''}`);
  }
} finally {
  await browser.close();
  server.kill();
}
if (overflowing > 0) process.exitCode = 1;
