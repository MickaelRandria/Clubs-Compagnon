import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright-core';

// Real production files + isolated API fixtures. No credentials or database needed.
const root = resolve('dist');
let version = 1;
const server = createServer(async (req, res) => {
  const path = new URL(req.url!, 'http://localhost').pathname;
  res.setHeader('Cache-Control', 'no-store');
  if (path.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(path === '/api/auth/me' ? { signedIn: false, canSignIn: true }
      : path === '/api/fc27' ? { campaign: { status: 'archived' } } : { private: 'network-only' }));
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
  // Exercise native prompt wiring using a browser event, then the manual iOS help.
  await page.evaluate(`(() => {
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, { prompt: async () => { document.body.dataset.prompted = 'yes'; }, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
    window.dispatchEvent(event);
  })()`);
  await page.getByRole('button', { name: 'Installer l’app' }).click();
  assert.equal(await page.locator('body').getAttribute('data-prompted'), 'yes');
  await page.getByRole('button', { name: 'Installer l’app' }).click();
  await page.locator('#pwa-install-help').waitFor();
  await page.setViewportSize({ width: 320, height: 740 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/pwa-mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Fermer', exact: true }).click();
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
  await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
  await page.getByRole('button', { name: 'Installer l’app' }).waitFor({ state: 'hidden' });
  assert.deepEqual(errors, []);
  console.log('PWA: installability, icons, mobile, offline routes, network-only APIs and explicit update passed.');
} finally {
  await context.close();
  await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done()));
}
