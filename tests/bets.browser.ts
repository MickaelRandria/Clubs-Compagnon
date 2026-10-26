import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { origin, signIn } from './browser-auth.js';

// Une soirée complète sur le serveur isolé (npm run test:fc27:serve) : ouverture par l'admin,
// paris d'un joueur et d'un supporter, coup d'envoi, match EA simulé, vote, clôture.
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_EXECUTABLE ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.setDefaultTimeout(10_000);
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
const button = (name: RegExp) => page.getByRole('button', { name });
const wallet = async () => Number((await page.locator('.bets-wallet b').innerText()).trim());
const noHorizontalScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
/** Le helper attend le badge de compte de /fc27 ; le retour OAuth vers /paris est couvert par session.test.ts. */
const signInTo = async (account: string) => { await signIn(page, account); await page.goto(`${origin}/paris`); };
const shot = (name: string) => page.screenshot({ path: `artifacts/bets-${name}.png`, fullPage: true });

try {
  // Déconnecté : une seule chose à faire, se connecter.
  await page.goto(`${origin}/paris`);
  await page.getByRole('link', { name: /se connecter avec discord/i }).waitFor();
  await shot('signin');

  await signInTo('AdminProfil');
  // Le serveur garde sa base entre deux lancements : on repart d'une soirée vide.
  // Sans fonction nommée dans evaluate : tsx y injecte un helper absent du navigateur.
  const state = await page.evaluate(async () => (await fetch('/api/bets/state')).json());
  const resets = [...(state.fixture ? [{ action: 'cancel', fixtureId: state.fixture.id }] : []),
    ...state.votes.map((vote: { id: number }) => ({ action: 'close-vote', fixtureId: vote.id }))];
  for (const body of resets) {
    await page.evaluate(async (payload) => { await fetch('/api/bets/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); }, body);
  }
  await page.reload();
  await page.getByText('Pas de paris ouverts').waitFor();
  const start = await wallet();
  await button(/ouvrir les paris du prochain match/i).click();
  await page.getByRole('heading', { name: /le verdict/i }).waitFor();
  assert.equal(await page.getByRole('link', { name: /paris/i }).filter({ has: page.locator('.fc-bnav-live') }).count(), 1, 'point « paris ouverts » dans la barre du bas');

  // Supporter sans joueur : il parie aussi. Deux cotes, une mise, valider.
  await signInTo('Supporter');
  await page.getByRole('heading', { name: /le verdict/i }).waitFor();
  const base = await wallet();
  assert.ok(start > 0 && base > 0, 'cagnotte de bienvenue');
  assert.equal(await button(/touche une cote pour parier/i).isDisabled(), true);
  await page.locator('.bets-card').filter({ hasText: 'Le Verdict' }).getByRole('button', { name: /victoire/i }).click();
  await page.locator('.bets-card').filter({ hasText: 'Le Crack' }).getByRole('button', { name: /ButeurTest/ }).click();
  await button(/^100$/).click();
  await shot('picks');
  await button(/valider 2 paris · 200 CR/i).click();
  await button(/paris enregistrés/i).waitFor();
  assert.equal(await wallet(), base - 200);
  // Changer d'avis : la mise du Verdict est rendue avant la nouvelle.
  await page.locator('.bets-card').filter({ hasText: 'Le Verdict' }).getByRole('button', { name: /défaite/i }).click();
  await button(/^50$/).click();
  await button(/valider 1 pari/i).click();
  await button(/paris enregistrés/i).waitFor();
  assert.equal(await wallet(), base - 150);
  assert.equal(await noHorizontalScroll(), true);
  await shot('placed-mobile');

  // Coup d'envoi.
  await signInTo('AdminProfil');
  await button(/coup d’envoi/i).click();
  await page.getByText('🔒 Match en cours').waitFor();
  await signInTo('Supporter');
  await page.getByText('🔒 Match en cours').waitFor();
  assert.equal(await page.locator('.bets-odd').count(), 0, 'plus de cotes pendant le match');
  await shot('live');

  // Le match EA tombe : défaite 1-3, la mise « Défaite » est payée, le vote s'ouvre.
  await page.request.get(`${origin}/api/test/ea-match?for=1&against=3`);
  await page.waitForTimeout(1_200);
  await page.reload();
  await page.getByText('Place au vote').first().waitFor();
  assert.equal(await wallet(), base - 150 + 100, 'Défaite à 2.00 : 50 → 100');
  await page.locator('.bets-card--flop').getByRole('button', { name: /MilieuTest/ }).click();
  await page.locator('.bets-vote').first().getByRole('button', { name: /ButeurTest/ }).click();
  await page.locator('.bets-vote').first().getByRole('button', { name: /ButeurTest.*100%/ }).waitFor();
  await shot('vote');

  // L'admin clôt : Crack ButeurTest payé.
  await signInTo('AdminProfil');
  await button(/clore le vote/i).click();
  await page.getByText('Pas de paris ouverts').waitFor();
  await signInTo('Supporter');
  await page.getByRole('heading', { name: /mes derniers paris/i }).waitFor();
  assert.ok(await wallet() > base - 50, 'Crack gagné');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await shot('history-desktop');
  assert.deepEqual(errors, []);
  console.log('PASS: soirée complète — ouverture, paris, changement d’avis, coup d’envoi, match EA, vote, clôture, historique.');
} catch (error) {
  await shot('failure');
  throw error;
} finally { await browser.close(); }
