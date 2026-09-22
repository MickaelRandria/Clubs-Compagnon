import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright-core';
import type { FC27State } from '../shared/fc27';

// Real production files + isolated API fixtures. No credentials or database needed.
const root = resolve('dist');
let version = 1;
const archivedCampaign: FC27State = {
  campaign: { id: 1, status: 'archived', created_at: '2026-01-01T00:00:00Z', archived_at: '2026-02-01T00:00:00Z' },
  election: { phase: 'closed', started_at: null, closed_at: null, winner_proposal_id: null, tie_break_applied: false },
  players: [], proposals: [], winner: null, archives: [], server_time: '2026-02-01T00:00:00Z',
};
const server = createServer(async (req, res) => {
  const path = new URL(req.url!, 'http://localhost').pathname;
  res.setHeader('Cache-Control', 'no-store');
  if (path.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(path === '/api/auth/me' ? { signedIn: false, canSignIn: true }
      : path === '/api/fc27' ? archivedCampaign : { private: 'network-only' }));
    return;
  }
  try {
    let file = resolve(root, `.${decodeURIComponent(path)}`);
    if (!file.startsWith(root + sep)) file = resolve(root, 'index.html');
    if (!extname(file)) file = resolve(root, 'index.html');
    let body = await readFile(file);
    if (path === '/sw.js') body = Buffer.concat([body, Buffer.from(`\n// test version ${version}`)]);
    const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
    res.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
    res.end(body);
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
const address = server.address() as { port: number };
const origin = `http://127.0.0.1:${address.port}`;
// Temporary persistent profile: Chrome intentionally forbids installation in incognito.
const context = await chromium.launchPersistentContext('', { executablePath: process.env.CHROME_EXECUTABLE ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}/profil`);
  await page.getByRole('heading', { name: 'Mon profil', exact: true }).waitFor();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const cdp = await context.newCDPSession(page);
  const manifest = await cdp.send('Page.getAppManifest');
  assert.deepEqual(manifest.errors, []);
  const installability = await cdp.send('Page.getInstallabilityErrors');
  assert.deepEqual(installability.installabilityErrors, []);
  const parsed = JSON.parse(manifest.data!);
  assert.equal(parsed.display, 'standalone');
  for (const icon of parsed.icons) {
    const response = await context.request.get(origin + icon.src);
    assert.equal(response.status(), 200);
    assert.equal(response.headers()['content-type'], 'image/png');
  }
  // Always explain first, even when the native install prompt is available.
  await page.evaluate(`(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, { prompt: async () => { document.body.dataset.prompted = 'yes'; }, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
    window.dispatchEvent(event);
  })()`);
  await page.getByRole('button', { name: 'Installer l’app' }).click();
  const guide = page.getByRole('dialog');
  await guide.waitFor();
  assert.equal(await page.locator('body').getAttribute('data-prompted'), null);
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/pwa-guide-desktop.png' });
  await guide.getByRole('button', { name: 'Android', exact: true }).click();
  await guide.getByRole('button', { name: 'On commence' }).click();
  await guide.getByRole('heading', { name: 'Ouvre le site dans Chrome' }).waitFor();
  await guide.getByRole('button', { name: 'Étape suivante' }).click();
  await guide.getByRole('heading', { name: 'Ouvre les trois petits points' }).waitFor();
  await guide.getByRole('button', { name: 'Étape suivante' }).click();
  await guide.getByRole('button', { name: 'Installer directement' }).click();
  assert.equal(await page.locator('body').getAttribute('data-prompted'), 'yes');
  await guide.getByText('Tu as fermé la fenêtre.', { exact: false }).waitFor();
  assert.equal(await guide.getByRole('heading', { name: 'L’app est installée !' }).count(), 0);
  await guide.getByRole('button', { name: 'Installer directement' }).waitFor({ state: 'hidden' });
  await guide.getByRole('button', { name: 'Étape suivante' }).click();
  await guide.getByRole('heading', { name: 'Retrouve l’icône du club' }).waitFor();
  await guide.getByRole('button', { name: 'Terminer le guide' }).click();
  assert.equal(await page.getByRole('button', { name: 'Installer l’app' }).evaluate(el => el === document.activeElement), true);
  // Manual iOS path, readable on the smallest supported viewport.
  await page.getByRole('button', { name: 'Installer l’app' }).click();
  await guide.getByRole('button', { name: 'iPhone / iPad' }).click();
  await page.setViewportSize({ width: 320, height: 740 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: 'artifacts/pwa-mobile.png' });
  await guide.getByRole('button', { name: 'On commence' }).click();
  await guide.getByRole('heading', { name: 'Ouvre le site dans Safari' }).waitFor();
  assert.equal(await guide.getByLabel('Le lien du club à ouvrir').inputValue(), `${origin}/`);
  // Clipboard fallback keeps the URL selectable when permissions are denied.
  await page.evaluate(`Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('denied'); } } })`);
  await guide.getByRole('button', { name: 'Copier le lien du club' }).click();
  await guide.getByText('Maintiens le lien sélectionné', { exact: false }).waitFor();
  await guide.getByRole('button', { name: 'Étape suivante' }).click();
  await guide.getByRole('heading', { name: 'Repère le bouton Partager' }).waitFor();
  await guide.locator('.install-visual').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/pwa-guide-ios-share.png' });
  await guide.getByRole('button', { name: 'Étape suivante' }).click();
  await guide.getByRole('heading', { name: 'Ajoute le club à ton accueil' }).waitFor();
  await guide.getByText('Je ne retrouve pas ce qui est montré', { exact: true }).click();
  await guide.getByRole('link', { name: 'Voir l’aide Apple' }).waitFor();
  assert.ok(await guide.evaluate(el => el.scrollWidth <= el.clientWidth));
  await page.keyboard.press('Escape');
  await guide.waitFor({ state: 'hidden' });
  assert.equal(await page.locator('body').evaluate(el => el.style.overflow), '');
  // Device detection, including iPadOS identifying as a Mac.
  for (const [userAgent, platform, maxTouchPoints, expected] of [
    ['Mozilla/5.0 (iPhone)', 'iPhone', 5, 'iPhone / iPad'],
    ['Mozilla/5.0 (Linux; Android 14)', 'Linux', 5, 'Android'],
    ['Mozilla/5.0 (Macintosh)', 'MacIntel', 5, 'iPhone / iPad'],
  ] as const) {
    const deviceContext = await chromium.launch({ executablePath: process.env.CHROME_EXECUTABLE ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
    try {
      const devicePage = await deviceContext.newPage({ userAgent, viewport: { width: 390, height: 844 } });
      await devicePage.addInitScript(({ platform, maxTouchPoints }) => {
        Object.defineProperty(navigator, 'platform', { value: platform });
        Object.defineProperty(navigator, 'maxTouchPoints', { value: maxTouchPoints });
      }, { platform, maxTouchPoints });
      await devicePage.goto(`${origin}/profil`);
      await devicePage.getByRole('button', { name: 'Installer l’app' }).click();
      assert.equal(await devicePage.getByRole('button', { name: expected, exact: true }).getAttribute('aria-pressed'), 'true');
    } finally { await deviceContext.close(); }
  }
  // A rejected native prompt recovers to manual instructions.
  await page.evaluate(`(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, { prompt: async () => { throw new Error('unavailable'); }, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
    window.dispatchEvent(event);
  })()`);
  await page.getByRole('button', { name: 'Installer l’app' }).click();
  await guide.getByRole('button', { name: 'On commence' }).click();
  await guide.getByRole('button', { name: 'Étape suivante' }).click();
  await guide.getByRole('button', { name: 'Étape suivante' }).click();
  await guide.getByRole('button', { name: 'Installer directement' }).click();
  await guide.getByText('L’installation directe n’est pas disponible ici.', { exact: false }).waitFor();
  await guide.getByRole('button', { name: 'Fermer le guide' }).click();
  await page.evaluate(async () => { await fetch('/api/profile'); await fetch('/api/auth/me'); });
  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    return (await Promise.all(names.map(async name => (await (await caches.open(name)).keys()).map(req => req.url)))).flat();
  });
  assert.ok(cached.length > 0);
  assert.ok(cached.every(url => !new URL(url).pathname.startsWith('/api/')));
  await context.setOffline(true);
  // Chrome's current CDP separates network emulation from navigator.onLine.
  await cdp.send('Network.overrideNetworkState', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
  await page.reload();
  await page.screenshot({ path: 'artifacts/pwa-offline.png', fullPage: true });
  await page.getByText('Hors connexion', { exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Mon profil', exact: true }).waitFor();
  assert.equal(await page.evaluate(async () => { try { await fetch('/api/auth/me'); return true; } catch { return false; } }), false);
  // A fresh lazy route also loads from the precache, without an online visit.
  await page.goto(`${origin}/fc27`);
  await page.getByText('Hors connexion', { exact: true }).waitFor();
  await page.locator('.fc-top').waitFor();
  // OAuth must never receive the cached HTML shell while offline.
  const apiPage = await context.newPage();
  await assert.rejects(apiPage.goto(`${origin}/api/auth/discord`));
  await apiPage.close();
  await context.setOffline(false);
  await cdp.send('Network.overrideNetworkState', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await page.goto(`${origin}/profil`);
  await page.getByText('Hors connexion', { exact: true }).waitFor({ state: 'hidden' });
  // Real waiting worker: preserve the document until the user accepts the update.
  await page.evaluate(() => { document.body.dataset.draft = 'keep'; });
  version = 2;
  await page.evaluate(async () => { await (await navigator.serviceWorker.ready).update(); });
  await page.getByRole('button', { name: 'Mettre à jour', exact: true }).waitFor();
  assert.equal(await page.locator('body').getAttribute('data-draft'), 'keep');
  await Promise.all([
    page.waitForEvent('load'),
    page.getByRole('button', { name: 'Mettre à jour', exact: true }).click(),
  ]);
  await page.getByRole('heading', { name: 'Mon profil', exact: true }).waitFor();
  assert.equal(await page.locator('body').getAttribute('data-draft'), null);
  await page.getByRole('button', { name: 'Mettre à jour', exact: true }).waitFor({ state: 'hidden' });
  await page.evaluate(`(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, { prompt: async () => {}, userChoice: Promise.resolve({ outcome: 'accepted' }) });
    window.dispatchEvent(event);
  })()`);
  await page.getByRole('button', { name: 'Installer l’app' }).click();
  await guide.getByRole('button', { name: 'On commence' }).click();
  await guide.getByRole('button', { name: 'Étape suivante' }).click();
  await guide.getByRole('button', { name: 'Étape suivante' }).click();
  await guide.getByRole('button', { name: 'Installer directement' }).click();
  await guide.getByRole('heading', { name: 'Ouvre le club depuis tes apps' }).waitFor();
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await guide.getByRole('heading', { name: 'L’app est installée !' }).waitFor();
  await guide.getByRole('button', { name: 'Terminer le guide' }).click();
  await page.getByRole('button', { name: 'Installer l’app' }).waitFor({ state: 'hidden' });
  assert.deepEqual(errors, []);
  console.log('PWA: guided iOS/Android/desktop install, device detection, prompt cancellation/failure, clipboard fallback, mobile, icons, offline routes, network-only APIs and explicit update passed.');
} finally {
  await context.close();
  await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
}
