import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, type Page } from 'playwright-core';
import { origin, resetCampaign, signIn } from './browser-auth.js';

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_EXECUTABLE ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.setDefaultTimeout(10_000);
const errors: string[] = [];
page.on('pageerror', error => errors.push(error.message));
const post = (target: Page, data: object) => target.evaluate(async payload => {
  const response = await fetch('/api/fc27', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  return { status: response.status, body: await response.json() };
}, data);
try {
  await signIn(page, 'CompteAuth');
  await resetCampaign(page);
  await page.getByRole('button', { name: 'Se déconnecter', exact: true }).click();
  await page.locator('.fc27-account').waitFor({ state: 'detached' });
  await page.goto(`${origin}/fc27?vue=fiche`);
  const signInLink = page.getByRole('link', { name: /se connecter avec discord/i });
  assert.match(await signInLink.getAttribute('href') ?? '', /returnTo=%2Ffc27%3Fvue%3Dfiche/);
  assert.equal(await page.getByRole('button', { name: /créer ma fiche/i }).count(), 0);
  assert.equal(await page.getByRole('button', { name: /réglages fc 27/i }).count(), 0);
  assert.equal(await page.getByRole('button', { name: /recommencer la préparation/i }).count(), 0);
  const state = await (await page.request.get(`${origin}/api/fc27`)).json();
  for (const action of ['propose', 'vote', 'player', 'start', 'close', 'archive', 'reset']) {
    assert.equal((await post(page, { action, campaignId: state.campaign.id, accountId: 1 })).status, 401);
  }
  console.log('PASS: lecture libre, connexion pour agir, réglages protégés, identité injectée refusée.');

  const back = `/fc27/nom?campagne=${state.campaign.id}`;
  await page.goto(`${origin}${back}`);
  await page.getByRole('link', { name: /se connecter avec discord/i }).first().waitFor();
  await signIn(page, 'CompteAuth', back);
  assert.equal(page.url(), `${origin}${back}`);
  await page.getByRole('button', { name: /^proposer un nom/i }).waitFor();
  assert.equal(await page.getByRole('button', { name: /réglages fc 27/i }).count(), 0);
  for (const action of ['start', 'close', 'archive', 'reset']) {
    const denied = await post(page, { action, campaignId: state.campaign.id, isAdmin: true, username: 'saucegod.', accountId: 1 });
    assert.equal(denied.status, 403, action);
  }
  assert.equal((await (await page.request.get(`${origin}/api/fc27`)).json()).campaign.id, state.campaign.id);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  await page.screenshot({ path: 'artifacts/auth-arena-mobile.png', fullPage: true });
  console.log('PASS: retour OAuth dans l’arène et sa campagne, compte visible sur mobile.');

  const card = { action: 'player', campaignId: state.campaign.id, pseudo: 'Proprietaire', kitName: 'ORIGINAL', kitNumber: 77,
    primaryPosition: 'BU', preferredFoot: 'Droit', heightCm: 180, weightKg: 75, archetype: 'finisher', weakFootStars: 3, skillMovesStars: 3 };
  const saved = await post(page, card);
  assert.equal(saved.status, 200);
  const original = saved.body.players[0];
  await signIn(page, 'AutreCompte', '/fc27?vue=fiche');
  const stolen = await post(page, { ...card, profileId: original.id, accountId: original.account_id, kitName: 'PIRATE', kitNumber: 78 });
  assert.equal(stolen.status, 409);
  const unchanged = await (await page.request.get(`${origin}/api/fc27`)).json();
  assert.equal(unchanged.players[0].in_game_name, 'ORIGINAL');
  await signIn(page, 'CompteAuth', '/fc27?vue=fiche');
  await page.getByRole('button', { name: /modifier ma fiche/i }).click();
  await page.getByRole('dialog').getByLabel('Nom sur le maillot').waitFor();
  assert.equal(await page.getByRole('dialog').getByLabel('Nom sur le maillot').inputValue(), 'ORIGINAL');
  await page.keyboard.press('Escape');
  await page.context().clearCookies();
  await page.reload();
  await signInLink.waitFor();
  assert.equal((await post(page, card)).status, 401);
  assert.deepEqual(errors, []);
  console.log('PASS: fiche personnelle retrouvée, usurpation bloquée, session absente refusée, aucune exception navigateur.');
} catch (error) {
  await page.screenshot({ path: 'artifacts/auth-failure.png', fullPage: true });
  throw error;
} finally { await browser.close(); }
