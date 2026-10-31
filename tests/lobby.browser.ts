// Parcours Spotify/Jam entièrement local : vraie application, API démo et fixtures, sans base ni Spotify.
// Lancer avec `tsx tests/lobby.browser.ts` ; le serveur enfant utilise le port 5177 par défaut.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { chromium, type Locator, type Page } from 'playwright-core';
import type { LobbyMusic } from '../shared/lobby.js';

const PORT = Number(process.env.LOBBY_TEST_PORT ?? 5177);
const BASE = `http://127.0.0.1:${PORT}`;
const fixture = JSON.parse(readFileSync(new URL('../demo/fixtures/lobby.json', import.meta.url), 'utf8')) as LobbyMusic;
const executablePath = [process.env.CHROME_EXECUTABLE, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome', chromium.executablePath()]
  .find((path) => path && existsSync(path));
if (!executablePath) throw new Error('Aucun navigateur trouvé : lance `npx playwright-core install chromium`.');

const server = spawn(process.execPath, ['--import', 'tsx', 'demo/serve.ts', '--connecte'], {
  env: { ...process.env, DEMO_PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '';
server.stdout.on('data', (chunk: Buffer) => { serverOutput += chunk.toString(); });
server.stderr.on('data', (chunk: Buffer) => { serverOutput += chunk.toString(); });

async function ready() {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`La démo ne démarre pas. ${serverOutput}`)), 20_000);
    const started = (chunk: Buffer) => {
      if (!chunk.toString().includes(BASE)) return;
      clearTimeout(timeout);
      resolve();
    };
    server.stdout.on('data', started);
    server.once('error', (error) => { clearTimeout(timeout); reject(error); });
    server.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Démo arrêtée (${code}). ${serverOutput}`)); });
  });
}

const errors: string[] = [];
const noHorizontalScroll = async (page: Page) => {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true,
    `Aucun débordement horizontal sur ${page.url()}`);
};

/** Le logo et le bouton doivent tenir dans la carte, même lorsqu'un parent flex manque de place. */
async function contained(card: Locator, child: Locator, label: string) {
  const bounds = await card.boundingBox();
  const content = await child.boundingBox();
  assert.ok(bounds && content, `${label} visible`);
  assert.ok(content.x >= bounds.x - 1 && content.y >= bounds.y - 1
    && content.x + content.width <= bounds.x + bounds.width + 1
    && content.y + content.height <= bounds.y + bounds.height + 1, `${label} entièrement dans la carte`);
}

await mkdir('artifacts', { recursive: true });
await mkdir('captures', { recursive: true });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let page: Page | undefined;
try {
  await ready();
  browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
    hasTouch: true, locale: 'fr-FR', reducedMotion: 'reduce' });
  // Les ressources distantes éventuelles sont refusées avant le réseau ; aucun compte ni secret requis.
  await context.route('**/*', (route) => new URL(route.request().url()).origin === BASE ? route.continue() : route.abort());
  await context.addInitScript(() => {
    // Les scènes changent les droits d'un même compte démo : ne pas restaurer ceux de la scène précédente.
    localStorage.removeItem('dommage.query.v1');
    localStorage.setItem('dommage.tour.v3', 'done');
    localStorage.setItem('bets.seen.0', '1');
  });
  page = await context.newPage();
  page.setDefaultTimeout(10_000);
  page.on('pageerror', (error) => errors.push(error.message));
  const card = page.getByRole('region', { name: 'Musique du lobby', exact: true });
  const visit = async (path: string) => {
    await page!.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  };

  await visit('/');
  await card.waitFor();
  assert.equal(await card.locator('.lb--compact').count(), 0);
  assert.equal(await card.locator('.lb-title').textContent(), fixture.playing!.title);
  assert.equal(await card.getByRole('link', { name: /Rejoindre la Jam/ }).getAttribute('href'), fixture.jamUrl);
  assert.equal(await card.getByRole('link', { name: 'Ouvrir dans Spotify', exact: true }).getAttribute('href'), fixture.playing!.url);
  assert.equal(await card.locator('.lb-cover').evaluate((node) => (node as HTMLImageElement).naturalWidth > 0), true);
  assert.equal(await card.locator('.lb-spotify img').evaluate((node) => (node as HTMLImageElement).naturalWidth > 0), true);
  const bar = card.getByRole('progressbar', { name: 'Progression du morceau' });
  const before = Number(await bar.getAttribute('aria-valuenow'));
  await page.waitForFunction((previous) => Number(document.querySelector('.lb [role="progressbar"]')?.getAttribute('aria-valuenow')) > previous, before);
  await noHorizontalScroll(page);
  await card.screenshot({ path: 'captures/lobby-accueil.png' });
  console.log('PASS : accueil, données et pochette locales, liens Jam/Spotify, progression vivante.');

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ['/paris?scene=rien', '/paris?scene=session']) {
      await visit(path);
      await card.waitFor();
      assert.equal(await page.locator('.lb--compact').count(), 1);
      await contained(card, card.locator('.lb-spotify'), 'Logo Spotify');
      await contained(card, card.getByRole('link', { name: 'Rejoindre la Jam', exact: true }), 'Bouton Jam');
      await noHorizontalScroll(page);
      if (width === 390 && path === '/paris?scene=rien') {
        await card.scrollIntoViewIfNeeded();
        await card.screenshot({ path: 'captures/lobby-foodbet.png' });
      }
    }
  }
  console.log('PASS : FoodBet avant et pendant la session, logo/bouton non coupés à 390 et 320 px.');

  for (const state of ['pause', 'absente', 'indisponible']) {
    await visit(`/?musique=${state}`);
    assert.equal(await card.count(), 0, `Carte masquée lorsque la musique est ${state}`);
  }
  await visit('/?musique=sans-jam');
  await card.waitFor();
  assert.equal(await card.getByRole('link', { name: /Rejoindre la Jam/ }).count(), 0);
  assert.equal(await card.getByRole('link', { name: 'Ouvrir dans Spotify', exact: true }).count(), 1);
  console.log('PASS : absence, pause et panne masquées ; morceau consultable sans lien de Jam.');

  // Des noms et titres longs doivent rester dans la carte, avec une vraie absence de défilement horizontal.
  await page.route('**/api/bets/lobby', (route) => route.fulfill({ json: { ...fixture,
    host: 'UnPseudoDuVestiaireVraimentTresLongSansEspace'.repeat(3),
    playing: { ...fixture.playing, title: 'UnTitreTresLongSansEspace'.repeat(5),
      artist: 'UnArtisteVraimentTresLongSansEspace'.repeat(4), at: new Date().toISOString() },
    next: { ...fixture.next, title: 'UnTitreSuivantTresLongSansEspace'.repeat(4) } } }));
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await visit('/');
    await card.waitFor();
    await noHorizontalScroll(page);
  }
  await page.unroute('**/api/bets/lobby');
  console.log('PASS : titres, artistes, hôte et titre suivant très longs à 390 et 320 px.');

  await page.setViewportSize({ width: 390, height: 844 });
  await visit('/profil?admin');
  const panel = page.getByRole('region', { name: 'Musique du lobby', exact: true });
  await panel.getByRole('heading', { name: 'Musique du lobby', exact: true }).waitFor();
  const input = panel.getByRole('textbox', { name: 'Lien de la Jam' });
  assert.equal(await input.inputValue(), fixture.jamUrl);
  assert.equal(await panel.getByRole('link', { name: 'Relier un autre compte Spotify' }).getAttribute('href'), '/api/auth/spotify');
  await panel.scrollIntoViewIfNeeded();
  await panel.screenshot({ path: 'captures/lobby-profil.png' });
  await page.setViewportSize({ width: 320, height: 844 });
  const post = page.waitForResponse((response) => response.url() === `${BASE}/api/bets/jam` && response.request().method() === 'POST');
  await input.fill('https://spotify.link/nouvelle-soiree');
  await panel.getByRole('button', { name: 'Enregistrer le lien', exact: true }).click();
  assert.equal((await post).status(), 409);
  await panel.getByRole('alert').filter({ hasText: 'Mode démo : rien n’est enregistré.' }).waitFor();
  assert.equal(await input.inputValue(), 'https://spotify.link/nouvelle-soiree', 'Saisie conservée après refus');
  await noHorizontalScroll(page);
  console.log('PASS : profil admin, connexion Spotify et vraie soumission démo refusée avec erreur affichée.');

  // Les réponses d'écriture sont simulées pour vérifier les confirmations et les données du cache navigateur.
  const submissions: string[] = [];
  let savedMusic = { ...fixture, connected: true };
  await page.route('**/api/bets/jam', async (route) => {
    const { url } = route.request().postDataJSON() as { url: string };
    submissions.push(url);
    savedMusic = { ...savedMusic, jamUrl: url || null };
    await route.fulfill({ json: savedMusic });
  });
  await input.fill('https://spotify.link/soiree-validee');
  assert.equal(await panel.getByRole('alert').count(), 0, 'L’ancienne erreur disparaît à la saisie');
  await panel.getByRole('button', { name: 'Enregistrer le lien', exact: true }).click();
  await panel.getByRole('status').filter({ hasText: 'Lien de la Jam enregistré.' }).waitFor();
  assert.equal(await input.inputValue(), 'https://spotify.link/soiree-validee');

  let disconnections = 0;
  await page.route('**/api/bets/spotify-disconnect', async (route) => {
    assert.equal(route.request().method(), 'POST');
    disconnections++;
    savedMusic = { ...savedMusic, connected: false, host: null, playing: null, next: null };
    await route.fulfill({ json: savedMusic });
  });
  await panel.getByRole('button', { name: 'Déconnecter Spotify', exact: true }).click();
  await panel.getByRole('status').filter({ hasText: 'Spotify déconnecté.' }).waitFor();
  assert.equal(await panel.getByRole('link', { name: 'Connecter Spotify', exact: true }).getAttribute('href'), '/api/auth/spotify');
  assert.equal(await panel.getByRole('button', { name: 'Déconnecter Spotify', exact: true }).count(), 0);
  assert.equal(await input.inputValue(), 'https://spotify.link/soiree-validee', 'Déconnexion conserve le lien de la Jam');
  assert.equal(disconnections, 1);
  await page.unroute('**/api/bets/spotify-disconnect');
  console.log('PASS : déconnexion Spotify, confirmation et retour du lien de connexion, Jam conservée.');

  await input.fill('');
  await panel.getByRole('button', { name: 'Retirer le lien', exact: true }).click();
  await panel.getByRole('status').filter({ hasText: 'Lien de la Jam retiré.' }).waitFor();
  assert.equal(await input.inputValue(), '');
  assert.deepEqual(submissions, ['https://spotify.link/soiree-validee', '']);
  await page.unroute('**/api/bets/jam');
  await visit('/profil');
  assert.equal(await page.getByRole('heading', { name: 'Musique du lobby', exact: true }).count(), 0);
  await visit('/profil?admin&musique=indisponible');
  await panel.getByRole('alert').filter({ hasText: 'Impossible de vérifier' }).waitFor();
  assert.equal(await panel.getByRole('textbox', { name: 'Lien de la Jam' }).isDisabled(), true);
  console.log('PASS : sauvegarde/retrait simulés, confirmations distinctes, contrôle admin et panne du panneau.');

  // Une requête échouée après une lecture réussie doit retirer les anciennes données annoncées en direct.
  await visit('/');
  await card.waitFor();
  await page.route('**/api/bets/lobby', (route) => route.abort('failed'));
  await page.clock.install();
  await page.clock.fastForward(46_000);
  await card.waitFor({ state: 'hidden' });
  assert.deepEqual(errors, [], 'Aucune exception JavaScript dans le navigateur');
  console.log('PASS : perte réseau, ancienne carte masquée, aucune exception navigateur.');
} catch (error) {
  if (page) await page.screenshot({ path: 'artifacts/lobby-failure.png', fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser?.close();
  server.kill();
}
