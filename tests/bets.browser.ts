import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { origin, signIn } from './browser-auth.js';

// Deux matchs sur le serveur isolé (npm run test:fc27:serve) : un Verdict réglé par le
// score, puis un Crack réglé par le vote. Un seul pari par match, le même pour tous.
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_EXECUTABLE ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(10_000);
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
const button = (name: RegExp) => page.getByRole('button', { name });
const choice = (name: RegExp) => page.getByRole('radio', { name });
const title = (name: RegExp) => page.getByRole('heading', { name }).waitFor();
const wallet = async () => Number((await page.locator('.bets-wallet b').innerText()).trim());
const noHorizontalScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
const shot = (name: string) => page.screenshot({ path: `artifacts/bets-${name}.png` });
/** Le helper attend le badge de compte de /fc27 ; le retour OAuth vers /paris est couvert par session.test.ts. */
const signInTo = async (account: string) => { await signIn(page, account); await page.goto(`${origin}/paris`); };
const admin = async (body: object) => page.evaluate(async (payload) => {
  await fetch('/api/bets/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
}, body);
const eaMatch = async (goalsFor: number, goalsAgainst: number) => {
  await page.request.get(`${origin}/api/test/ea-match?for=${goalsFor}&against=${goalsAgainst}`);
  await page.waitForTimeout(1_200);
};

try {
  await page.goto(`${origin}/paris`);
  await page.getByRole('link', { name: /se connecter avec discord/i }).waitFor();
  await shot('signin');

  // Le serveur garde sa base entre deux lancements : on repart d'une soirée vide.
  await signInTo('AdminProfil');
  const state = await page.evaluate(async () => (await fetch('/api/bets/state')).json());
  if (state.fixture) await admin({ action: 'cancel', fixtureId: state.fixture.id });
  for (const vote of state.votes) await admin({ action: 'close-vote', fixtureId: vote.id });
  await page.request.get(`${origin}/api/test/force-market?id=verdict`);
  await page.reload();
  await button(/ouvrir le pari du prochain match/i).click();
  await page.getByText(/pari tiré : le verdict/i).waitFor();

  // ---- Match 1 : Verdict ----
  await signInTo('Supporter');
  // Résultats d'une exécution précédente pas encore vus : ils passent avant le pari, on les ferme.
  await page.locator('.bets-stage').waitFor();
  while (await button(/continuer/i).count()) await button(/continuer/i).click();
  await title(/le verdict/i);
  const base = await wallet();
  assert.equal(await page.locator('.bets-stage').count(), 1, 'une seule scène à l’écran');
  assert.equal(await button(/choisis ta réponse/i).isDisabled(), true);
  await choice(/victoire/i).click();
  await button(/^100$/).click();
  await shot('open');
  await button(/parier 100 CR/i).click();
  await title(/c’est joué/i);
  assert.equal(await wallet(), base - 100);
  await button(/changer mon pari/i).click();
  assert.equal(await choice(/victoire/i).getAttribute('aria-checked'), 'true', 'le pari en cours est présélectionné');
  await choice(/défaite/i).click();
  // Les cotes bougent avec l'historique : on lit celle affichée plutôt que de la supposer.
  const lossOdds = Number((await choice(/défaite/i).locator('b').innerText()).replace('×', ''));
  await button(/^50$/).click();
  await button(/parier 50 CR/i).click();
  await title(/c’est joué/i);
  assert.equal(await wallet(), base - 50, 'l’ancienne mise est rendue');
  assert.equal(await noHorizontalScroll(), true);
  await shot('placed');

  await signInTo('AdminProfil');
  await button(/coup d’envoi/i).click();
  await signInTo('Supporter');
  await title(/match en cours/i);
  await page.getByText(/ton pari : défaite/i).waitFor();
  await shot('live');

  await eaMatch(1, 3);
  await page.reload();
  await title(/gagné/i);
  const won = Math.floor(50 * lossOdds);
  assert.equal((await page.locator('.bets-reveal-amount').innerText()).replace(/\s+/g, ' ').trim(), `+${won} CR`);
  assert.equal(await wallet(), base - 50 + won);
  await shot('reveal-won');
  await button(/continuer/i).click();
  await title(/prochain pari au prochain match/i);
  assert.equal(await page.getByText(/qui est le crack/i).count(), 0, 'pas de vote pour un pari réglé par le score');

  // ---- Match 2 : Crack, réglé par le vote ----
  await signInTo('AdminProfil');
  await page.request.get(`${origin}/api/test/force-market?id=crack`);
  await button(/ouvrir le pari du prochain match/i).click();
  await page.getByText(/pari tiré : le crack/i).waitFor();
  await signInTo('Supporter');
  await title(/le crack/i);
  await page.getByText(/après la défaite 1-3/i).waitFor();
  await choice(/ButeurTest/).click();
  await shot('open-crack');
  await button(/parier 50 CR/i).click();
  await title(/c’est joué/i);
  await signInTo('AdminProfil');
  await button(/coup d’envoi/i).click();
  await eaMatch(2, 2);
  await signInTo('Supporter');
  await title(/qui est le crack/i);
  await page.getByRole('button', { name: /ButeurTest/ }).click();
  await page.getByRole('button', { name: /ButeurTest.*100%/ }).waitFor();
  await shot('vote');
  await signInTo('AdminProfil');
  await button(/clore le vote/i).click();
  await signInTo('Supporter');
  await title(/gagné/i);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await shot('reveal-desktop');
  await button(/continuer/i).click();
  await page.getByText(/classement & mes paris/i).click();
  await page.getByRole('heading', { name: /mes derniers paris/i }).waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: un pari par match — Verdict réglé par le score, Crack réglé par le vote, révélation, changement d’avis, historique.');
} catch (error) {
  await shot('failure');
  throw error;
} finally { await browser.close(); }
