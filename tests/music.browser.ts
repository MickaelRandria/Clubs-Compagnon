// Parcours des commandes Spotify dans la vraie app, avec API démo et réponses d'écriture simulées.
// Aucun appel à Spotify, à la production ou à une base distante.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { chromium, type Page } from 'playwright-core';
import type { LobbyConsole, LobbyMusic, LobbyTrack, SpotifyCommand } from '../shared/lobby.js';

const PORT = Number(process.env.MUSIC_TEST_PORT ?? 5181);
const BASE = `http://127.0.0.1:${PORT}`;
const music = JSON.parse(readFileSync(new URL('../demo/fixtures/lobby.json', import.meta.url), 'utf8')) as LobbyMusic;
const tracks = JSON.parse(readFileSync(new URL('../demo/fixtures/lobby-tracks.json', import.meta.url), 'utf8')) as LobbyTrack[];
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
const ready = new Promise<void>((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error(`La démo ne démarre pas. ${serverOutput}`)), 20_000);
  server.stdout.on('data', (chunk: Buffer) => {
    if (chunk.toString().includes(BASE)) { clearTimeout(timeout); resolve(); }
  });
  server.once('error', (error) => { clearTimeout(timeout); reject(error); });
  server.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Démo arrêtée (${code}). ${serverOutput}`)); });
});

async function noOverflow(page: Page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true,
    `Aucun débordement horizontal : ${page.url()}`);
}

await mkdir('captures', { recursive: true });
await mkdir('artifacts', { recursive: true });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
let page: Page | undefined;
try {
  await ready;
  browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
    hasTouch: true, locale: 'fr-FR', reducedMotion: 'reduce' });
  await context.route('**/*', (route) => new URL(route.request().url()).origin === BASE ? route.continue() : route.abort());
  await context.addInitScript(() => {
    localStorage.removeItem('dommage.query.v1');
    localStorage.setItem('dommage.tour.v3', 'done');
    localStorage.setItem('bets.seen.0', '1');
  });
  page = await context.newPage();
  page.setDefaultTimeout(10_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const visit = async (path: string) => { await page!.goto(`${BASE}${path}`, { waitUntil: 'networkidle' }); };
  const title = () => page!.getByRole('heading', { name: 'Musique du lobby', exact: true });
  const visibility = () => page!.getByRole('switch', { name: /Afficher la musique/ });
  const pause = () => page!.getByRole('button', { name: /Mettre en pause/ });
  const play = () => page!.getByRole('button', { name: /Reprendre/ });
  const next = () => page!.getByRole('button', { name: /Morceau suivant/ });
  const previous = () => page!.getByRole('button', { name: /Morceau précédent/ });
  const search = () => page!.getByRole('searchbox', { name: /titre ou.*artiste/ });
  const submit = () => page!.getByRole('button', { name: 'Rechercher', exact: true });
  const add = (name: string) => page!.getByRole('button', { name: `Ajouter ${name} à la file`, exact: true });

  await visit('/musique?hote');
  await title().waitFor();
  await pause().waitFor();
  assert.equal(await visibility().getAttribute('aria-checked'), 'true');
  assert.equal(await previous().isEnabled(), true);
  assert.equal(await next().isEnabled(), true);
  await noOverflow(page);
  await page.screenshot({ path: 'captures/musique-hote.png', fullPage: true });

  // Le serveur démo refuse réellement toute écriture ; le refus doit être visible et ne pas changer la lecture.
  const denied = page.waitForResponse((response) => response.url().endsWith('/api/bets/spotify-control') && response.request().method() === 'POST');
  await pause().click();
  assert.equal((await denied).status(), 409);
  await page.getByRole('alert').filter({ hasText: 'Mode démo : rien n’est enregistré.' }).waitFor();
  assert.equal(await pause().isVisible(), true);
  console.log('PASS : vue hôte, contrôles, visibilité et refus réel des écritures en démo.');

  const response = await context.request.get(`${BASE}/api/bets/lobby-console`, { headers: { Referer: `${BASE}/musique?hote` } });
  let state = await response.json() as LobbyConsole;
  const commands: SpotifyCommand[] = [];
  await page.route('**/api/bets/lobby-console', (route) => route.fulfill({ json: state }));
  let releaseNext: (() => void) | undefined;
  await page.route('**/api/bets/spotify-control', async (route) => {
    const { action } = route.request().postDataJSON() as { action: SpotifyCommand };
    commands.push(action);
    if (action === 'next') await new Promise<void>((resolve) => { releaseNext = resolve; });
    state = { ...state, playback: state.playback && { ...state.playback,
      isPlaying: action === 'pause' ? false : action === 'play' ? true : state.playback.isPlaying } };
    await route.fulfill({ json: state });
  });
  await pause().click();
  await play().waitFor();
  assert.equal(await page.getByText(music.playing!.title, { exact: true }).count(), 1, 'Le morceau reste affiché en pause');
  await play().click();
  await pause().waitFor();
  const pendingNext = page.waitForRequest((request) => request.url().endsWith('/api/bets/spotify-control') && request.postDataJSON().action === 'next');
  await next().click();
  await pendingNext;
  assert.equal(await pause().isDisabled(), true);
  assert.equal(await previous().isDisabled(), true);
  assert.equal(await next().isDisabled(), true);
  releaseNext!();
  await next().waitFor({ state: 'visible' });
  await page.waitForFunction(() => !Array.from(document.querySelectorAll('button')).find((button) => button.getAttribute('aria-label') === 'Morceau suivant')?.disabled);
  assert.deepEqual(commands, ['pause', 'play', 'next'], 'Une seule commande part par action');

  const changes: boolean[] = [];
  await page.route('**/api/bets/lobby-visibility', async (route) => {
    const { visible } = route.request().postDataJSON() as { visible: boolean };
    changes.push(visible);
    state = { ...state, visible };
    await route.fulfill({ json: state });
  });
  await visibility().click();
  await page.waitForFunction(() => document.querySelector('[role="switch"]')?.getAttribute('aria-checked') === 'false');
  assert.equal(await pause().isVisible(), true, 'L’hôte garde les commandes quand la musique est masquée');
  assert.equal(await page.getByText(music.playing!.title, { exact: true }).count(), 1);
  await visibility().click();
  await page.waitForFunction(() => document.querySelector('[role="switch"]')?.getAttribute('aria-checked') === 'true');
  assert.deepEqual(changes, [false, true]);
  await page.unroute('**/api/bets/lobby-console');
  await page.unroute('**/api/bets/spotify-control');
  await page.unroute('**/api/bets/lobby-visibility');
  console.log('PASS : pause/reprise, commande unique pendant l’attente et masquage sans perdre la console hôte.');

  await visit('/musique');
  await search().waitFor();
  assert.equal(await visibility().count(), 0);
  assert.equal(await pause().count(), 0);
  assert.equal(await next().count(), 0);
  const requestedSearches: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/bets/spotify-search') requestedSearches.push(new URL(request.url()).searchParams.get('q') ?? '');
  });
  await search().fill('Daft');
  assert.equal(requestedSearches.length, 0, 'La saisie seule ne déclenche pas de recherche');
  await submit().click();
  await add(tracks[0].title).waitFor();
  assert.deepEqual(requestedSearches, ['Daft']);
  assert.equal(await page.locator('.lm-result-info').filter({ hasText: tracks[0].title }).getAttribute('href'), tracks[0].url);
  await noOverflow(page);
  await page.screenshot({ path: 'captures/musique-membre.png', fullPage: true });

  const deniedQueue = page.waitForResponse((response) => response.url().endsWith('/api/bets/spotify-queue') && response.request().method() === 'POST');
  await add(tracks[0].title).click();
  assert.equal((await deniedQueue).status(), 409);
  await page.getByRole('alert').filter({ hasText: 'Mode démo : rien n’est enregistré.' }).waitFor();

  const queued: string[] = [];
  await page.route('**/api/bets/spotify-queue', async (route) => {
    const { uri } = route.request().postDataJSON() as { uri: string };
    queued.push(uri);
    await route.fulfill({ json: { queued: true } });
  });
  await add(tracks[0].title).click();
  await page.getByRole('status').filter({ hasText: tracks[0].title }).filter({ hasText: 'ajouté' }).waitFor();
  assert.deepEqual(queued, [tracks[0].uri]);
  await page.unroute('**/api/bets/spotify-queue');

  let failures = 0;
  await page.route('**/api/bets/spotify-queue', async (route) => { failures++; await route.abort('failed'); });
  await add(tracks[1].title).click();
  await page.getByRole('alert').waitFor();
  await page.waitForTimeout(800);
  assert.equal(failures, 1, 'Un ajout incertain n’est jamais répété automatiquement');
  assert.equal(await page.getByRole('status').filter({ hasText: tracks[1].title }).filter({ hasText: 'ajouté' }).count(), 0);
  await page.unroute('**/api/bets/spotify-queue');
  console.log('PASS : membre sans commandes, recherche explicite, ajout confirmé et absence de répétition après erreur réseau.');

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await visit('/musique?musique=masquee');
    await search().waitFor();
    assert.equal(await pause().count(), 0);
    assert.equal(await visibility().count(), 0);
    assert.equal((await page.locator('body').innerText()).includes(music.playing!.title), false);
    assert.equal((await page.locator('body').innerText()).includes(music.host!), false);
    assert.equal(await page.getByRole('link', { name: /Rejoindre la Jam/ }).count(), 0);
    assert.equal(await search().isEnabled(), true);
    await noOverflow(page);
    if (width === 390) await page.screenshot({ path: 'captures/musique-masquee.png', fullPage: true });
  }
  const hidden = await context.request.get(`${BASE}/api/bets/lobby-console`, { headers: { Referer: `${BASE}/musique?musique=masquee` } });
  const hiddenData = await hidden.json() as LobbyConsole;
  assert.equal(hiddenData.playback, null);
  assert.equal(hiddenData.host, null);
  assert.equal(hiddenData.jamUrl, null);
  console.log('PASS : musique masquée, aucune métadonnée du lecteur transmise au membre, recherche conservée à 390/320 px.');

  await page.setViewportSize({ width: 390, height: 844 });
  await visit('/musique?hote&musique=pause');
  await play().waitFor();
  assert.equal(await page.getByText(music.playing!.title, { exact: true }).count(), 1);
  await page.screenshot({ path: 'captures/musique-pause.png', fullPage: true });
  await visit('/musique?hote&musique=reconnexion');
  await page.getByRole('link', { name: /Autoriser les commandes/ }).waitFor();
  if (await pause().count()) assert.equal(await pause().isDisabled(), true);
  if (await next().count()) assert.equal(await next().isDisabled(), true);
  assert.equal(await search().isEnabled(), true, 'La recherche reste disponible avec les anciennes portées');
  await noOverflow(page);
  await page.screenshot({ path: 'captures/musique-reconnexion.png', fullPage: true });
  await visit('/musique?musique=absente');
  await title().waitFor();
  assert.equal(await pause().count(), 0);
  if (await search().count()) assert.equal(await search().isDisabled(), true);
  console.log('PASS : pause affichée, autorisation supplémentaire demandée à l’hôte et absence de Spotify relié.');

  state = { ...state, visible: true, host: 'HoteSansEspace'.repeat(15), playback: state.playback && { ...state.playback,
    track: state.playback.track && { ...state.playback.track, title: 'TitreTresLongSansEspace'.repeat(12), artist: 'ArtisteSansEspace'.repeat(14) } } };
  await page.route('**/api/bets/lobby-console', (route) => route.fulfill({ json: state }));
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await visit('/musique?hote');
    await pause().waitFor();
    await noOverflow(page);
  }
  await page.unroute('**/api/bets/lobby-console');

  // Installer l'horloge avant la page pour capturer aussi le minuteur de rafraîchissement React Query.
  await page.clock.install();
  await visit('/musique?hote');
  await pause().waitFor();
  await page.route('**/api/bets/lobby-console', (route) => route.abort('failed'));
  await page.clock.fastForward(46_000);
  await page.getByRole('alert').waitFor();
  assert.equal((await page.locator('body').innerText()).includes(music.playing!.title), false, 'Une panne ne garde pas un ancien morceau en direct');
  await page.clock.resume();
  await page.unroute('**/api/bets/lobby-console');

  await page.route('**/api/auth/me', (route) => route.fulfill({ json: { signedIn: false, canSignIn: true } }));
  await visit('/musique');
  await page.getByRole('link', { name: /Se connecter avec Discord/ }).waitFor();
  assert.equal(await pause().count(), 0);
  assert.equal(await visibility().count(), 0);
  await noOverflow(page);
  assert.deepEqual(errors, [], 'Aucune exception JavaScript dans le navigateur');
  console.log('PASS : noms longs à 390/320 px, ancienne musique retirée après panne et accès visiteur soumis à Discord.');
} catch (error) {
  if (page) await page.screenshot({ path: 'artifacts/music-failure.png', fullPage: true }).catch(() => {});
  throw error;
} finally {
  await browser?.close();
  server.kill();
}
