import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import type { FC27State } from '../shared/fc27.js';
import { signIn, resetCampaign } from './browser-auth.js';

// Only the isolated test server is targeted; never accepts a production URL.
const origin = 'http://127.0.0.1:5174';
const readState = async () => (await (await fetch(`${origin}/api/fc27`)).json()) as FC27State;
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_EXECUTABLE ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
const button = (name: RegExp) => page.getByRole('button', { name });
const click = async (name: RegExp) => { await button(name).click(); };
const waitClosed = () => page.getByRole('dialog').waitFor({ state: 'hidden' });
const noHorizontalScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
// Cases à cocher (tours) ou boutons radio (duels, finale) visuellement masqués : on clique la carte entière.
const card = (name: string) => page.getByRole('checkbox', { name, exact: true }).or(page.getByRole('radio', { name, exact: true }));
const toggleCard = (name: string) => page.locator('label.arena-card-slot').filter({ has: card(name) }).click();
// The entry tile repeats the arena headline: wait for the arena route itself.
const enterArena = async () => {
  await page.getByRole('link', { name: /entrer dans l’arène/i }).click();
  await page.waitForURL(/\/fc27\/nom/);
  await page.locator('#arena-title').waitFor();
};
const here = () => new URL(page.url()).pathname + new URL(page.url()).search;
/** Coche exactement `names` (en décochant le reste), puis enregistre le bulletin. */
const castVote = async (pseudo: string, names: string[]) => {
  await signIn(page, pseudo, here());
  await page.locator('.arena-vote-dock').waitFor();
  const boxes = page.getByRole('checkbox');
  for (let i = 0; i < await boxes.count(); i++) {
    const label = (await boxes.nth(i).getAttribute('aria-label'))!;
    if (await boxes.nth(i).isChecked() && !names.includes(label)) await toggleCard(label);
  }
  for (const name of names) if (!await card(name).isChecked()) await toggleCard(name);
  for (const name of names) assert.equal(await card(name).isChecked(), true, `La carte « ${name} » doit être sélectionnée.`);
  await click(/(valider|modifier) mon vote/i);
  await page.getByText('Ton vote est enregistré. Tu peux le modifier jusqu’à la clôture de l’étape.', { exact: true }).waitFor();
};
/** L'admin clôt l'étape ouverte, en tranchant les égalités proposées. */
const advanceStage = async (picks: string[] = []) => {
  await signIn(page, 'AdminProfil', here());
  await click(/réglages fc 27/i);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /clôturer l’étape et passer à la suite/i }).click();
  for (const name of picks) await dialog.getByLabel(new RegExp(`^${name} · `)).check();
  await dialog.getByRole('button', { name: /^confirmer$/i }).click(); await waitClosed();
};
const stageKinds = async () => (await readState()).stages.map((s) => s.kind);

try {
  await signIn(page, 'Alex');
  await resetCampaign(page);
  // ---- Entrée : l'onglet FC 27 mène à l'arène plein écran ----
  await page.goto(`${origin}/fc27`);
  await page.getByRole('heading', { name: /cap sur fc 27/i }).waitFor();
  await enterArena();
  assert.match(await page.locator('#arena-title').innerText(), /Un club\.\s*Un nom\.\s*Notre choix\./i);
  assert.equal(await page.locator('.fc-top').count(), 0, "L'arène s'affiche hors de la mise en page habituelle.");
  await page.screenshot({ path: 'artifacts/fc27-arena-empty.png', fullPage: true });

  // ---- Phase 1 : trois propositions signées par le compte ----
  for (const name of ['Dommage United', 'Les Diagonales', 'Collectif 27']) {
    await click(/^proposer un nom/i);
    await page.getByRole('textbox', { name: 'Nom du club proposé' }).fill(name);
    await click(/ajouter ma proposition/i); await waitClosed();
    await page.getByRole('heading', { name, exact: true }).waitFor();
  }
  assert.ok((await readState()).proposals.every((p) => p.author_pseudo === 'Alex'));
  assert.equal(await button(/tes 3 noms sont proposés/i).isDisabled(), true);
  await page.screenshot({ path: 'artifacts/fc27-arena-proposals.png', fullPage: true });
  console.log('PASS: arena entry, three proposals per Discord account, fourth disabled.');

  // ---- Fiches joueurs : tunnel en 2 étapes + rapport tactique ----
  await page.getByRole('link', { name: /retour à fc 27/i }).click();
  await page.getByRole('heading', { name: /cap sur fc 27/i }).waitFor();
  const dialog = page.getByRole('dialog');
  const next = () => dialog.getByRole('button', { name: /^suivant/i }).click();
  const validate = () => dialog.getByRole('button', { name: /valider ma fiche/i }).click();
  const primary = (name: string) => dialog.getByRole('group', { name: 'Poste principal', exact: true }).getByRole('radio', { name, exact: true }).check();

  // Alex : buteur pivot gaucher, poste secondaire AG.
  await click(/créer ma fiche/i);
  await dialog.getByRole('listitem').filter({ hasText: 'Identité' }).and(dialog.locator('[aria-current="step"]')).waitFor();
  await next();
  await dialog.getByRole('alert').getByText('Saisis ton pseudo.').waitFor();
  await dialog.getByRole('textbox', { name: 'Pseudo', exact: true }).fill('Alex');
  await dialog.getByRole('textbox', { name: 'Nom sur le maillot' }).fill('Alexinho');
  await dialog.getByRole('spinbutton', { name: /Numéro de maillot/ }).fill('9');
  await page.screenshot({ path: 'artifacts/fc27-wizard-identity.png' });
  await next();
  await validate();
  await dialog.getByRole('alert').getByText('Choisis ton poste principal.').waitFor();
  await primary('BU Buteur');
  const archetypeCards = dialog.locator('.fc27-archetypes');
  assert.equal(await archetypeCards.getByRole('radio').count(), 4);
  await validate();
  await dialog.getByRole('alert').getByText('Choisis ton archétype.').waitFor();
  await archetypeCards.getByRole('radio', { name: /^Target/ }).check();
  await primary('AG Ailier gauche');
  assert.equal(await archetypeCards.getByRole('radio', { name: /^Target/ }).isChecked(), true, 'Même ligne : choix conservé même hors des postes idéaux.');
  for (const [position, count] of [['G Gardien', 2], ['DC Défenseur central', 3], ['MC Milieu central', 4]] as const) {
    await primary(position);
    assert.equal(await archetypeCards.getByRole('radio').count(), count);
    assert.equal(await archetypeCards.locator('input:checked').count(), 0);
  }
  await primary('BU Buteur');
  await archetypeCards.getByRole('radio', { name: /^Target/ }).check();
  await page.setViewportSize({ width: 390, height: 844 });
  await archetypeCards.scrollIntoViewIfNeeded();
  assert.equal(await archetypeCards.evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length), 1);
  assert.equal(await noHorizontalScroll(), true);
  await page.screenshot({ path: 'artifacts/fc27-archetypes-mobile.png' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await dialog.locator('details.fc27-advanced > summary').click();
  await dialog.getByRole('group', { name: /Poste secondaire/ }).getByRole('radio', { name: 'AG Ailier gauche', exact: true }).check();
  await dialog.getByRole('radio', { name: 'Gaucher', exact: true }).check();
  await dialog.getByRole('slider', { name: /Taille/ }).fill('189');
  await page.screenshot({ path: 'artifacts/fc27-wizard-position.png' });
  await dialog.locator('.fc27-signature').waitFor();
  await dialog.getByText('Precision Header', { exact: true }).waitFor();
  assert.equal(await dialog.getByRole('checkbox').count(), 0, 'Aucune sélection manuelle de PlayStyles.');
  await dialog.getByRole('group', { name: 'Gestes techniques' }).getByRole('radio', { name: '4 étoiles' }).check();
  await dialog.getByRole('textbox', { name: /Points forts/ }).fill('Spécialiste penalty');
  await page.screenshot({ path: 'artifacts/fc27-wizard-profile.png' });
  await click(/valider ma fiche et entrer dans le vestiaire/i); await waitClosed();
  await page.getByRole('button', { name: 'Buteur 1 1 joueur', exact: true }).waitFor();
  const alex = (await readState()).players[0];
  assert.deepEqual([alex.in_game_name, alex.kit_number, alex.primary_position, alex.secondary_positions, alex.preferred_foot, alex.height_cm, alex.archetype, alex.skill_moves],
    ['Alexinho', 9, 'BU', ['AG'], 'Gauche', 189, 'target', 4]);

  // Sam : numéro déjà pris, puis corrigé.
  await signIn(page, 'Sam');
  await click(/créer ma fiche/i);
  await dialog.getByRole('textbox', { name: 'Pseudo', exact: true }).fill('Sam');
  await dialog.getByRole('textbox', { name: 'Nom sur le maillot' }).fill('SAMY');
  await dialog.getByRole('spinbutton', { name: /Numéro de maillot/ }).fill('9');
  await dialog.getByText('Le numéro 9 est déjà porté par Alexinho. Choisis-en un autre.').waitFor();
  await next();
  assert.equal(await dialog.getByRole('heading', { name: '1. Identité' }).isVisible(), true, 'Numéro pris : on reste à l’étape 1.');
  await dialog.getByRole('button', { name: 'Numéro suivant' }).click();
  await next();
  await primary('BU Buteur');
  await dialog.getByRole('radio', { name: /^Finisher/ }).check();
  await dialog.getByText('Low Driven Shot', { exact: true }).waitFor();
  await click(/valider ma fiche/i); await waitClosed();
  await page.getByRole('button', { name: 'Buteur 2 2 joueurs', exact: true }).waitFor();
  assert.equal((await readState()).players[1].kit_number, 10);

  await page.getByRole('button', { name: 'Ailier gauche 0 À couvrir', exact: true }).click();
  await page.getByRole('heading', { name: 'Remplaçants · 1', exact: true }).waitFor();
  await page.locator('#fc27-position-players summary').click();
  await page.getByText('Spécialiste penalty', { exact: true }).waitFor();

  // Rapport tactique calculé depuis les fiches.
  const report = page.getByRole('region', { name: /rapport tactique/i });
  assert.doesNotMatch(await report.innerText(), /Aucun gardien fixe|Aucun défenseur central/);
  await page.getByRole('button', { name: 'Gardien 0 Tenu par l’IA', exact: true }).waitFor();
  await report.getByRole('img', { name: /Synergie \d+ sur 100/ }).waitFor();
  // Conseils en mini-cartes : la consigne est lisible sans clic.
  await report.locator('.fc27-tip', { hasText: 'Alexinho' }).getByText(/Target \(BU\) : sers de point d’appui/).waitFor();
  await report.screenshot({ path: 'artifacts/fc27-report.png' });
  await page.screenshot({ path: 'artifacts/fc27-page.png', fullPage: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await noHorizontalScroll(), true, `Page FC 27 sans défilement horizontal à ${width}px.`);
  }
  await page.screenshot({ path: 'artifacts/fc27-page-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });

  // Modification : pré-remplissage, changement de poste, archétype à re-choisir.
  await signIn(page, 'Alex');
  await click(/modifier ma fiche/i);
  assert.equal(await dialog.getByRole('textbox', { name: 'Nom sur le maillot' }).inputValue(), 'Alexinho');
  assert.equal(await dialog.getByRole('spinbutton', { name: /Numéro de maillot/ }).inputValue(), '9');
  await next();
  await primary('MC Milieu central');
  await validate();
  await dialog.getByRole('alert').getByText('Choisis ton archétype.').waitFor();
  await dialog.getByRole('radio', { name: /^Maestro/ }).check();
  await click(/valider ma fiche/i); await waitClosed();
  await page.getByRole('button', { name: 'Milieu central 1 1 joueur', exact: true }).waitFor();
  assert.equal((await readState()).players.find((p) => p.pseudo === 'Alex')?.archetype, 'maestro');
  await page.reload();
  await page.getByRole('button', { name: 'Milieu central 1 1 joueur', exact: true }).click();
  await page.locator('#fc27-position-players summary').click();
  await page.getByText(/Maestro .* OVR 65/).waitFor();
  console.log('PASS: 2-step player wizard (validation, kit numbers, position filters), edit, tactical report with AI defence.');

  // ---- Phase 2 : premier tour, trois choix par compte, vote modifiable ----
  assert.equal(await button(/réglages fc 27/i).count(), 0, 'Les membres ne voient pas les réglages.');
  await signIn(page, 'Sam');
  await enterArena();
  for (const name of ['Les Insulaires', 'Ravtoute FC']) {
    await click(/^proposer un nom/i);
    await page.getByRole('textbox', { name: 'Nom du club proposé' }).fill(name);
    await click(/ajouter ma proposition/i); await waitClosed();
  }
  await signIn(page, 'AdminProfil', here());
  await click(/réglages fc 27/i);
  await click(/lancer le vote/i); await click(/^confirmer$/i); await waitClosed();
  await page.getByText('Premier tour · 3 choix', { exact: false }).first().waitFor();
  assert.equal(await button(/^proposer un nom/i).count(), 0, 'Plus de proposition pendant le vote.');
  await castVote('Alex', ['Dommage United', 'Les Diagonales', 'Collectif 27']);
  assert.equal(await button(/vote enregistré/i).isDisabled(), true);
  assert.equal(await card('Ravtoute FC').isDisabled(), true, 'Trois choix au maximum : la quatrième carte est bloquée.');
  // Changer d'avis : une carte retirée, une autre ajoutée.
  await castVote('Alex', ['Dommage United', 'Les Diagonales', 'Les Insulaires']);
  await castVote('Sam', ['Ravtoute FC', 'Collectif 27']);
  const firstRound = await readState();
  assert.deepEqual(firstRound.stages[0].entries.map((e) => e.votes), [1, 1, 1, 1, 1]);
  assert.equal(firstRound.stages[0].voters, 2);
  await page.reload(); await card('Collectif 27').waitFor({ state: 'attached' });
  assert.equal(await card('Collectif 27').isChecked(), true, 'Le bulletin enregistré est pré-coché au retour.');
  await page.screenshot({ path: 'artifacts/fc27-arena-voting.png', fullPage: true });
  console.log('PASS: first round, up to three choices, ballot changed and restored after reload.');

  // ---- Mobile ----
  assert.equal(await button(/réglages fc 27/i).count(), 0, 'Les réglages de l’arène sont masqués aux membres.');
  await signIn(page, 'AdminProfil', here());
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await noHorizontalScroll(), true);
  await page.screenshot({ path: 'artifacts/fc27-arena-mobile.png', fullPage: true });
  await click(/réglages fc 27/i);
  await page.keyboard.press('Escape'); await waitClosed();
  await page.setViewportSize({ width: 320, height: 740 });
  assert.equal(await noHorizontalScroll(), true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log('PASS: arena layouts at 390px and 320px, dialog Escape.');

  // ---- Second tour (cinq noms), égalité pour les dernières places tranchée par l'admin ----
  await advanceStage();
  await page.getByRole('heading', { name: /5 noms\.\s*4 places\./i }).waitFor();
  assert.deepEqual(await stageKinds(), ['qualif', 'repechage']);
  assert.match(await page.locator('.arena-vote-dock button').innerText(), /valider mon vote/i, 'Nouvelle étape, nouveau bulletin.');
  await castVote('Alex', ['Dommage United', 'Les Diagonales', 'Collectif 27']);
  await castVote('Sam', ['Dommage United', 'Les Insulaires', 'Ravtoute FC']);
  await signIn(page, 'AdminProfil', here());
  await click(/réglages fc 27/i);
  await page.getByRole('dialog').getByRole('button', { name: /clôturer l’étape et passer à la suite/i }).click();
  await page.getByText('Égalité pour la dernière place : choisis 3 noms', { exact: true }).waitFor();
  assert.equal(await page.getByRole('dialog').getByRole('button', { name: /^confirmer$/i }).isDisabled(), true, 'Égalité : trois noms à choisir.');
  await page.keyboard.press('Escape'); await waitClosed();
  await advanceStage(['Les Diagonales', 'Collectif 27', 'Les Insulaires']);

  // ---- Demi-finales : un nom par duel ----
  await page.getByText('Demi-finale 1', { exact: true }).waitFor();
  assert.deepEqual(await stageKinds(), ['qualif', 'repechage', 'semis']);
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: 'artifacts/fc27-arena-semis.png', fullPage: true });
  await castVote('Alex', ['Dommage United', 'Les Diagonales']);
  await castVote('Sam', ['Les Insulaires', 'Collectif 27']);
  await castVote('AdminProfil', ['Dommage United', 'Collectif 27']);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await noHorizontalScroll(), true);
  await page.screenshot({ path: 'artifacts/fc27-arena-semis-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await advanceStage();

  // ---- Finale, puis verdict ----
  await page.getByText('La finale', { exact: true }).first().waitFor();
  await page.waitForTimeout(1_500);
  await page.screenshot({ path: 'artifacts/fc27-arena-final.png', fullPage: true });
  await castVote('Alex', ['Dommage United']);
  await castVote('Sam', ['Collectif 27']);
  await castVote('AdminProfil', ['Dommage United']);
  await advanceStage();
  await page.locator('#arena-title').getByText('Notre nom pour FC 27', { exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Le podium', exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Le parcours', exact: true }).waitFor();
  await page.getByText(/Égalité départagée manuellement/).waitFor();
  const closed = await readState();
  assert.equal(closed.election.phase, 'closed');
  assert.equal(closed.winner?.club_name, 'Dommage United');
  assert.deepEqual(closed.stages.map((s) => s.kind), ['qualif', 'repechage', 'semis', 'final']);
  assert.deepEqual(closed.proposals.map((p) => [p.club_name, p.votes]),
    [['Dommage United', 1], ['Les Diagonales', 1], ['Collectif 27', 1], ['Les Insulaires', 1], ['Ravtoute FC', 1]]);
  assert.equal(await page.getByRole('radio').count() + await page.getByRole('checkbox').count(), 0, 'Plus de vote après la clôture.');
  await page.waitForTimeout(2_600);
  await page.screenshot({ path: 'artifacts/fc27-arena-winner.png', fullPage: true });
  console.log('PASS: second round with admin tie-break, semi-finals, final, podium and path kept.');

  // ---- Archive, onglet masqué, remise à zéro, lien historique ----
  await click(/réglages fc 27/i); await click(/terminer la préparation/i);
  await click(/^confirmer$/i); await waitClosed();
  await page.getByText('Préparation archivée', { exact: true }).waitFor();
  // The navigation refreshes its own copy of the campaign right after the archive.
  await page.getByRole('link', { name: /FC 27 PRÉPA/i }).waitFor({ state: 'detached', timeout: 5_000 });
  assert.equal(await button(/créer ma fiche/i).count(), 0);
  const archived = await readState(); assert.equal(archived.campaign.status, 'archived');
  await click(/réglages fc 27/i); await click(/recommencer la préparation/i);
  await click(/^confirmer$/i); await waitClosed();
  const fresh = await readState();
  assert.equal(fresh.campaign.status, 'preparation');
  assert.equal(fresh.election.phase, 'proposing');
  assert.equal(fresh.proposals.length + fresh.players.length, 0);
  await page.goto(`${origin}/fc27/nom?campagne=${archived.campaign.id}`);
  await page.locator('#arena-title').getByText('Notre nom pour FC 27', { exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Dommage United', exact: true }).first().waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: archive, tab visibility, reset, historical arena URL, no browser exceptions.');
} catch (error) {
  await page.screenshot({ path: 'artifacts/fc27-test-failure.png', fullPage: true });
  throw error;
} finally { await browser.close(); }
