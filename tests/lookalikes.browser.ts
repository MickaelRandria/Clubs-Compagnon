import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import type { FC27State } from '../shared/fc27.js';
import { lookalikeById } from '../shared/data/lookalikes.js';

// Serveur isolé exclusivement : aucune écriture dans la base du club.
const origin = 'http://127.0.0.1:5174';
const readState = async () => (await (await fetch(`${origin}/api/fc27`)).json()) as FC27State;
const initial = await readState();
await fetch(`${origin}/api/fc27`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'reset', campaignId: initial.campaign.id }) });
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_EXECUTABLE ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(10_000);
const errors: string[] = [];
const calls: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (request) => { if (request.url().includes('/api/fc27/lookalike')) calls.push(request.url()); });
const dialog = page.getByRole('dialog');
const input = () => dialog.getByRole('searchbox', { name: 'Joueur de référence' });
const create = async (pseudo: string, number: number) => {
  await page.getByRole('button', { name: /créer ma fiche/i }).click();
  await dialog.getByLabel('Pseudo', { exact: true }).fill(pseudo);
  await dialog.getByLabel('Nom sur le maillot').fill(pseudo);
  await dialog.getByLabel(/Numéro de maillot/).fill(String(number));
  await dialog.getByRole('button', { name: /^suivant/i }).click();
};
const save = async () => {
  await dialog.getByRole('button', { name: /valider ma fiche/i }).click();
  await dialog.waitFor({ state: 'hidden' });
};
try {
  await page.goto(`${origin}/fc27`);
  await page.getByRole('button', { name: 'Gardien 0 Tenu par l’IA', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Défenseur central 0 Tenu par l’IA', exact: true }).waitFor();
  await create('ZizouTest', 21);
  await input().fill('zizou');
  await dialog.locator('.fc27-lookalike-results button').first().focus();
  await page.keyboard.press('Enter');
  assert.equal(calls.length, 0, 'La liste ne déclenche aucun appel externe.');
  assert.equal(await dialog.locator('input[name="primary-position"]:checked').count(), 1);
  assert.equal(await dialog.locator('.fc27-lookalike-name strong').textContent(), 'Zinédine Zidane');
  await dialog.locator('.fc27-lookalike').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'artifacts/lookalike-curated.png' });
  await save();
  const zidane = lookalikeById('zidane')!;
  const saved = (await readState()).players.find((player) => player.pseudo === 'ZizouTest')!;
  assert.deepEqual([saved.primary_position, saved.archetype, saved.height_cm, saved.preferred_foot, saved.attribute_priorities],
    [zidane.position, zidane.archetype, zidane.heightCm, zidane.foot, zidane.priorities]);
  await page.reload();
  await page.getByRole('button', { name: /modifier une fiche/i }).click();
  await dialog.getByLabel('Pseudo exact de la fiche').fill('ZizouTest');
  await dialog.getByRole('button', { name: /retrouver la fiche/i }).click();
  await dialog.getByRole('button', { name: /^suivant/i }).click();
  assert.equal(await dialog.locator('.fc27-spend-list select').evaluateAll((nodes) => nodes.map((node) => (node as HTMLSelectElement).value)).then(JSON.stringify), JSON.stringify(zidane.priorities));
  await dialog.locator('details.fc27-advanced > summary').click();
  assert.equal(await dialog.getByRole('slider', { name: /Taille/ }).inputValue(), String(zidane.heightCm));
  await page.keyboard.press('Escape');
  console.log('PASS: choix au clavier, aucun appel pour la liste, build enregistré et conservé après rechargement.');

  await create('ModeleTest', 22);
  await input().fill('Gianfranco Zola');
  assert.equal(calls.length, 0, 'Saisir un nom inconnu ne déclenche pas de génération.');
  await input().press('Enter');
  await dialog.locator('.fc27-lookalike-results button', { hasText: 'Gianfranco Zola' }).waitFor();
  assert.equal(await dialog.locator('input[name="primary-position"]:checked').count(), 0, 'Le résultat doit être choisi avant de remplir la fiche.');
  await dialog.locator('.fc27-lookalike-results button').click();
  await dialog.getByText(/Suggestion IA · profil approximatif/).waitFor();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await dialog.locator('.fc27-lookalike').scrollIntoViewIfNeeded();
    const layout = await dialog.evaluate((element) => ({
      width: element.clientWidth, scroll: element.scrollWidth,
      overflowing: [...element.querySelectorAll('*')].filter((child) => child.getBoundingClientRect().right > element.getBoundingClientRect().right)
        .map((child) => ({ tag: child.tagName, class: child.className, right: child.getBoundingClientRect().right })),
    }));
    assert.ok(layout.scroll <= layout.width + 1, `Dialogue sans débordement à ${width}px : ${JSON.stringify(layout)}`);
  }
  await page.screenshot({ path: 'artifacts/lookalike-model-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await save();
  const modelPlayer = (await readState()).players.find((player) => player.pseudo === 'ModeleTest')!;
  assert.equal(modelPlayer.height_cm, 168);
  assert.deepEqual(modelPlayer.attribute_priorities, zidane.priorities);
  console.log('PASS: recherche étendue via le vrai handler, suggestion IA explicite, sauvegarde, mobile 320/390px.');

  await create('RepliTest', 23);
  await input().fill('Joueur Inconnu Test');
  await dialog.getByRole('button', { name: 'Rechercher ce joueur' }).click();
  await dialog.getByRole('status').getByText(/pas pu être identifié/).waitFor();
  await input().fill('Panne Test');
  await input().press('Enter');
  await dialog.getByRole('status').getByText(/temporairement indisponible/).waitFor();
  await page.route('**/api/fc27/lookalike?q=SansCle', (route) => route.fulfill({ json: { found: false, reason: 'not-configured' } }));
  await input().fill('SansCle');
  await input().press('Enter');
  await dialog.getByRole('status').getByText(/pas disponible pour le moment/).waitFor();
  await page.route('**/api/fc27/lookalike?q=ReseauCoupe', (route) => route.abort());
  await input().fill('ReseauCoupe');
  await input().press('Enter');
  await dialog.getByRole('status').getByText(/La recherche est indisponible/).waitFor();

  // Une ancienne réponse ne doit pas remplacer les nouveaux résultats saisis.
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route('**/api/fc27/lookalike?q=RetardTest', async (route) => {
    await gate;
    await route.fulfill({ json: { found: true, source: 'model', entry: { ...zidane, name: 'Ancien résultat', id: 'modele:retard' } } }).catch(() => {});
  });
  await input().fill('RetardTest');
  const started = page.waitForRequest('**/api/fc27/lookalike?q=RetardTest');
  await input().press('Enter');
  await started;
  await dialog.getByRole('status').getByText(/en cours/).waitFor();
  await input().fill('zizou');
  release();
  await dialog.locator('.fc27-lookalike-results button', { hasText: 'Zinédine Zidane' }).waitFor();
  assert.equal(await dialog.getByText('Ancien résultat').count(), 0);
  assert.equal(await dialog.locator('input[name="primary-position"]:checked').count(), 0);
  await dialog.locator('.fc27-lookalike-results button').click();
  // Reste ajustable, même après les erreurs de recherche.
  await dialog.getByRole('group', { name: 'Poste principal', exact: true }).getByRole('radio', { name: 'MC Milieu central', exact: true }).check();
  assert.equal(await dialog.locator('.fc27-lookalike--picked').count(), 0);
  await save();
  assert.equal((await readState()).players.find((player) => player.pseudo === 'RepliTest')?.primary_position, 'MC');
  const report = page.getByRole('region', { name: /rapport tactique/i });
  assert.doesNotMatch(await report.innerText(), /Aucun gardien fixe|Aucun défenseur central/);
  assert.deepEqual(errors, []);
  console.log('PASS: nom inconnu, panne, absence de clé, réseau coupé, requête obsolète, ajustement manuel, aucune exception navigateur.');
} catch (error) {
  await page.screenshot({ path: 'artifacts/lookalike-failure.png', fullPage: true });
  throw error;
} finally {
  await browser.close();
}
