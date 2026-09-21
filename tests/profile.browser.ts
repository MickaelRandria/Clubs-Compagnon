import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, type Page } from 'playwright-core';
import { signIn, origin } from './browser-auth.js';

await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_EXECUTABLE ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const member = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const admin = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors: string[] = [];
for (const page of [member, admin]) { page.setDefaultTimeout(10_000); page.on('pageerror', error => errors.push(error.message)); }
const row = (gamertag: string) => admin.locator('.profile-admin-row').filter({ has: admin.getByRole('heading', { name: gamertag, exact: true }) });
const decide = async (gamertag: string, action: string, note?: string) => {
  await row(gamertag).getByRole('button', { name: action, exact: true }).click();
  const dialog = admin.getByRole('dialog');
  if (note) await dialog.getByLabel('Motif pour le membre (facultatif)').fill(note);
  await dialog.getByRole('button', { name: 'Confirmer', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
};
const read = (page: Page) => page.evaluate(async () => (await fetch('/api/profile')).json());
try {
  await signIn(admin, 'AdminProfil', '/profil');
  await admin.evaluate(async () => {
    const state = await (await fetch('/api/profile')).json();
    for (const claim of state.adminClaims) {
      if (!['ButeurTest', 'MilieuTest', 'DebutantTest'].includes(claim.gamertag)) continue;
      await fetch('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: claim.status === 'approved' ? 'revoke' : 'reject', requestId: claim.id }) });
    }
  });
  await member.goto(`${origin}/profil`);
  await member.getByRole('heading', { name: 'Retrouve ton joueur Club Pro' }).waitFor();
  assert.match(await member.getByRole('link', { name: /Se connecter avec Discord/ }).getAttribute('href') ?? '', /returnTo=%2Fprofil/);
  await signIn(member, 'MembreProfil', '/profil');
  await member.getByRole('heading', { name: 'Quel joueur es-tu dans le club ?' }).waitFor();
  await member.getByLabel('Rechercher mon joueur').fill('Buteur');
  assert.equal(await member.getByRole('radio').count(), 1);
  await member.getByRole('radio', { name: /ButeurTest/ }).check();
  await member.getByRole('button', { name: 'Demander le rattachement' }).click();
  await member.getByRole('heading', { name: 'Ta demande est en attente' }).waitFor();
  assert.equal(await member.locator('.my-player-card').count(), 0);
  assert.equal(await member.locator('#validation').count(), 0);
  await member.reload();
  await member.getByRole('heading', { name: 'Ta demande est en attente' }).waitFor();
  const pending = await read(member);
  const forbidden = await member.evaluate(async id => (await fetch('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'approve', requestId: id, isAdmin: true }) })).status, pending.request.id);
  assert.equal(forbidden, 403);
  await member.screenshot({ path: 'artifacts/profile-pending.png', fullPage: true });
  console.log('PASS: connexion vers Mon profil, choix du joueur, demande persistante, auto-validation interdite.');

  await signIn(admin, 'AdminProfil', '/profil');
  await row('ButeurTest').getByText('MembreProfil', { exact: true }).waitFor();
  await decide('ButeurTest', 'Valider');
  // La même page du membre reçoit la validation par son actualisation périodique.
  await member.getByRole('heading', { name: 'ButeurTest', exact: true }).waitFor({ timeout: 20_000 });
  const card = member.getByRole('region', { name: 'ButeurTest' });
  for (const [label, value] of [['Matchs', '40'], ['Buts', '62'], ['Passes D.', '19'], ['Note moyenne', '8,1'], ['Passes réussies', '84 %']]) {
    assert.equal(await card.locator('dl > div').filter({ has: member.getByText(label, { exact: true }) }).locator('dd').innerText(), value);
  }
  await member.reload();
  await member.getByRole('link', { name: /ButeurTest · Mes statistiques Club Pro/ }).waitFor();
  await member.screenshot({ path: 'artifacts/profile-card-desktop.png', fullPage: true });
  for (const width of [390, 320]) {
    await member.setViewportSize({ width, height: 844 });
    assert.equal(await member.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await member.screenshot({ path: `artifacts/profile-card-${width}.png`, fullPage: true });
  }
  console.log('PASS: validation admin, carte et vraies valeurs du club, actualisation, accès rapide, desktop/mobile.');

  await admin.locator('.profile-approved summary').click();
  await decide('ButeurTest', 'Retirer le rattachement', 'Vérification à refaire');
  await member.reload();
  await member.getByText('Le rattachement a été retiré par un administrateur.', { exact: true }).waitFor();
  await member.getByText('Vérification à refaire', { exact: true }).waitFor();
  assert.equal(await member.locator('.my-player-card').count(), 0);
  await member.getByRole('radio', { name: /MilieuTest/ }).check();
  await member.getByRole('button', { name: 'Demander le rattachement' }).click();
  await member.getByRole('heading', { name: 'Ta demande est en attente' }).waitFor();
  await admin.reload();
  await decide('MilieuTest', 'Refuser', 'Choisis ton pseudo exact');
  await member.reload();
  await member.getByText('La demande a été refusée.', { exact: true }).waitFor();
  await member.getByText('Choisis ton pseudo exact', { exact: true }).waitFor();
  await member.getByRole('radio', { name: /DebutantTest/ }).check();
  await member.getByRole('button', { name: 'Demander le rattachement' }).click();
  await member.getByRole('button', { name: 'Annuler ma demande' }).click();
  await member.getByText('Tu as annulé ta demande.', { exact: true }).waitFor();
  await member.getByRole('button', { name: 'Se déconnecter', exact: true }).click();
  await member.getByRole('heading', { name: 'Retrouve ton joueur Club Pro' }).waitFor();
  assert.equal(await member.locator('.my-player-card').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS: retrait, motif de refus, nouvelle demande, annulation, déconnexion, aucune exception navigateur.');
} catch (error) {
  await member.screenshot({ path: 'artifacts/profile-failure.png', fullPage: true });
  await admin.screenshot({ path: 'artifacts/profile-admin-failure.png', fullPage: true });
  throw error;
} finally { await browser.close(); }
