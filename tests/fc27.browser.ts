import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import type { FC27State } from '../shared/fc27.js';

// Only the isolated test server is targeted; never accepts a production URL.
const origin = 'http://127.0.0.1:5174';
const readState = async () => (await (await fetch(`${origin}/api/fc27`)).json()) as FC27State;
const initial = await readState();
await fetch(`${origin}/api/fc27`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reset', campaignId: initial.campaign.id }) });
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
// The radio is visually hidden: click the whole card, like a player would.
const pickCard = async (name: string) => {
  const radio = page.getByRole('radio', { name, exact: true });
  await page.locator('label.arena-card-slot').filter({ has: radio }).click();
  assert.equal(await radio.isChecked(), true, `La carte « ${name} » doit être sélectionnée.`);
};
// The entry tile repeats the arena headline: wait for the arena route itself.
const enterArena = async () => {
  await page.getByRole('link', { name: /entrer dans l’arène/i }).click();
  await page.waitForURL(/\/fc27\/nom/);
  await page.locator('#arena-title').waitFor();
};
const vote = async (pseudo: string, card: string) => {
  await pickCard(card);
  await page.getByRole('textbox', { name: 'Ton pseudo', exact: true }).fill(pseudo);
  await click(/confirmer mon vote/i);
};

try {
  // ---- Entrée : l'onglet FC 27 mène à l'arène plein écran ----
  await page.goto(`${origin}/fc27`);
  await page.getByRole('heading', { name: /cap sur fc 27/i }).waitFor();
  await enterArena();
  assert.match(await page.locator('#arena-title').innerText(), /Un club\.\s*Un nom\.\s*Notre choix\./i);
  assert.equal(await page.locator('.fc-top').count(), 0, "L'arène s'affiche hors de la mise en page habituelle.");
  await page.screenshot({ path: 'artifacts/fc27-arena-empty.png', fullPage: true });

  // ---- Phase 1 : propositions illimitées, pseudo exact conservé ----
  for (const name of ['Dommage United', 'Les Diagonales', 'Collectif 27']) {
    await click(/^proposer un nom/i);
    await page.getByRole('textbox', { name: 'Ton pseudo', exact: true }).fill(' Alex ');
    await page.getByRole('textbox', { name: 'Nom du club proposé' }).fill(name);
    await click(/ajouter ma proposition/i); await waitClosed();
    await page.getByRole('heading', { name, exact: true }).waitFor();
  }
  assert.ok((await readState()).proposals.every((p) => p.author_pseudo === ' Alex '));
  await page.screenshot({ path: 'artifacts/fc27-arena-proposals.png', fullPage: true });
  console.log('PASS: arena entry, unlimited proposals as cards, exact pseudo preserved.');

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
  await click(/modifier une fiche/i);
  await dialog.getByLabel('Pseudo exact de la fiche').fill('Alex');
  await click(/retrouver la fiche/i);
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

  // ---- Phase 2 : vote, une seule voix par pseudo ----
  await enterArena();
  await click(/réglages fc 27/i);
  await click(/lancer le vote/i); await click(/^confirmer$/i); await waitClosed();
  await page.getByText('Le vote est ouvert', { exact: false }).first().waitFor();
  assert.equal(await button(/^proposer un nom/i).count(), 0, 'Plus de proposition pendant le vote.');
  await vote('Alex', 'Dommage United');
  await page.getByText('Ton vote est enregistré. Rendez-vous au verdict !', { exact: true }).waitFor();
  await vote('Alex', 'Les Diagonales');
  await page.getByRole('alert').getByText('Ce pseudo a déjà voté. Un seul vote est possible.', { exact: true }).waitFor();
  await vote('Sam', 'Les Diagonales');
  await page.getByText('Ton vote est enregistré. Rendez-vous au verdict !', { exact: true }).waitFor();
  const voting = await readState();
  assert.deepEqual(voting.proposals.map((p) => p.votes), [1, 1, 0]);
  await pickCard('Dommage United');
  await page.screenshot({ path: 'artifacts/fc27-arena-voting.png', fullPage: true });
  console.log('PASS: manual start, proposals locked, one vote per exact pseudo.');

  // ---- Mobile ----
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await noHorizontalScroll(), true);
  await page.screenshot({ path: 'artifacts/fc27-arena-mobile.png', fullPage: true });
  await click(/réglages fc 27/i);
  await page.keyboard.press('Escape'); await waitClosed();
  await page.setViewportSize({ width: 320, height: 740 });
  assert.equal(await noHorizontalScroll(), true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  console.log('PASS: arena layouts at 390px and 320px, dialog Escape.');

  // ---- Clôture manuelle avec égalité : l'admin départage ----
  await click(/réglages fc 27/i);
  await click(/clôturer le vote/i);
  assert.equal(await button(/^confirmer$/i).isDisabled(), true, 'Égalité : un gagnant doit être choisi.');
  await page.getByRole('combobox', { name: /Égalité : choisir le gagnant/ }).selectOption({ label: 'Dommage United · 1 vote(s)' });
  await click(/^confirmer$/i); await waitClosed();
  await page.getByText('Notre nom pour FC 27', { exact: true }).waitFor();
  await page.getByRole('heading', { name: /le classement final/i }).waitFor();
  await page.getByText(/Égalité départagée manuellement/).waitFor();
  const closed = await readState();
  assert.equal(closed.election.phase, 'closed');
  assert.equal(closed.winner?.club_name, 'Dommage United');
  assert.deepEqual(closed.proposals.map((p) => [p.club_name, p.author_pseudo, p.votes]),
    [['Dommage United', ' Alex ', 1], ['Les Diagonales', ' Alex ', 1], ['Collectif 27', ' Alex ', 0]]);
  assert.equal(await page.getByRole('radio').count(), 0, 'Plus de vote après la clôture.');
  await page.screenshot({ path: 'artifacts/fc27-arena-winner.png', fullPage: true });
  console.log('PASS: manual close, tie resolved by admin, winner and final scores kept.');

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
  await page.getByText('Notre nom pour FC 27', { exact: true }).waitFor();
  await page.getByRole('heading', { name: 'Dommage United', exact: true }).first().waitFor();
  assert.deepEqual(errors, []);
  console.log('PASS: archive, tab visibility, reset, historical arena URL, no browser exceptions.');
} catch (error) {
  await page.screenshot({ path: 'artifacts/fc27-test-failure.png', fullPage: true });
  throw error;
} finally { await browser.close(); }
