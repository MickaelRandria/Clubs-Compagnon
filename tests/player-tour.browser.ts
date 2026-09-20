import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { PLAYER_TOUR_KEY, PLAYER_TOUR_STEPS } from '../src/lib/player-tour.js';

const origin = 'http://127.0.0.1:5174';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_EXECUTABLE ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
page.setDefaultTimeout(10_000);
const errors: string[] = [];
const writes: string[] = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (request) => { if (request.method() === 'POST') writes.push(request.url()); });
const wizard = page.locator('dialog.fc27-dialog');
const tour = page.locator('dialog.tour');
const tourTitle = () => tour.getByRole('heading');
const next = () => tour.getByRole('button', { name: /^suivant/i }).click();
const visibleStep = async (index: number) => {
  await tour.getByRole('heading', { name: PLAYER_TOUR_STEPS[index].title, exact: true }).waitFor();
  await tour.locator('.tour-hole').waitFor();
  await page.waitForFunction(() => {
    const guide = document.querySelector('dialog.tour');
    const selector = guide?.getAttribute('data-tour-target');
    const target = selector ? document.querySelector(selector) : null;
    const spot = guide?.querySelector('.tour-hole')?.getBoundingClientRect();
    const rect = target?.getBoundingClientRect();
    const bubble = guide?.querySelector('.tour-bubble')?.getBoundingClientRect();
    return !!rect && !!spot && !!bubble && target?.checkVisibility()
      && Math.abs(rect.top - 8 - spot.top) < 2 && rect.bottom > 0
      && rect.top < (window.innerWidth <= 767 ? bubble.top : window.innerHeight);
  });
  assert.equal(await page.evaluate(() => document.querySelector('dialog.tour')?.matches(':modal')), true);
};
try {
  await page.goto(`${origin}/fc27`);
  await page.getByRole('button', { name: /créer ma fiche/i }).click();
  await wizard.getByRole('complementary', { name: 'Guide de création du joueur' }).waitFor();
  await wizard.getByLabel('Pseudo', { exact: true }).fill('GuideTest');
  await wizard.getByLabel('Nom sur le maillot').fill('GUIDE');
  await wizard.getByLabel(/Numéro de maillot/).fill('77');
  await wizard.getByRole('button', { name: 'Me guider', exact: true }).click();
  for (let index = 0; index < PLAYER_TOUR_STEPS.length; index++) {
    await visibleStep(index);
    if (index === 0) {
      for (let n = 0; n < 6; n++) {
        await page.keyboard.press('Tab');
        assert.equal(await tour.evaluate((element) => element.contains(document.activeElement)), true, 'Le focus reste dans le guide.');
      }
      await page.screenshot({ path: 'artifacts/player-guide-identity.png' });
    }
    if (index === 2) {
      await page.keyboard.press('ArrowLeft');
      await visibleStep(1);
      await page.keyboard.press('ArrowRight');
      await visibleStep(2);
      await page.screenshot({ path: 'artifacts/player-guide-inspiration.png' });
    }
    if (index < PLAYER_TOUR_STEPS.length - 1) await next();
    else await tour.getByRole('button', { name: 'Terminer', exact: true }).click();
  }
  await tour.waitFor({ state: 'detached' });
  assert.equal(await wizard.getByLabel('Pseudo', { exact: true }).inputValue(), 'GuideTest');
  assert.equal(await wizard.getByLabel('Nom sur le maillot').inputValue(), 'GUIDE');
  assert.equal(await wizard.getByLabel(/Numéro de maillot/).inputValue(), '77');
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), PLAYER_TOUR_KEY), 'done');
  assert.equal(await page.evaluate(() => localStorage.getItem('dommage.tour.v1')), null, 'Le guide général garde sa propre mémoire.');
  assert.deepEqual(writes, [], 'Terminer la visite ne crée jamais une fiche.');
  console.log('PASS: huit étapes, aller-retour entre les pages, focus capturé, saisie conservée, aucune écriture.');

  await wizard.getByRole('button', { name: /^suivant/i }).click();
  await wizard.getByRole('searchbox', { name: 'Joueur de référence' }).fill('zizou');
  await wizard.locator('.fc27-lookalike-results button').click();
  await wizard.locator('details.fc27-advanced > summary').click();
  await wizard.getByRole('slider', { name: /Taille/ }).fill('182');
  await wizard.getByLabel(/Points forts/).fill('Ma note à conserver');
  const values = () => wizard.locator('input, select, textarea').evaluateAll((elements) => elements.map((element) => {
    const input = element as HTMLInputElement;
    return [input.name || input.id, input.value, input.checked];
  }));
  const before = await values();
  await wizard.getByRole('button', { name: 'Guide de création', exact: true }).click();
  for (let index = 0; index <= 6; index++) {
    await visibleStep(index);
    if (index === 5) assert.equal(await page.locator('.fc27-spend').isVisible(), true);
    if (index < 6) await next();
  }
  await page.keyboard.press('Escape');
  await tour.waitFor({ state: 'detached' });
  assert.equal(await wizard.evaluate((element) => element.matches(':modal')), true, 'Échap conserve le formulaire ouvert.');
  assert.deepEqual(await values(), before);
  assert.equal(await wizard.locator('details.fc27-advanced').getAttribute('open'), '');
  assert.equal(await wizard.getByRole('button', { name: 'Guide de création', exact: true }).evaluate((element) => element === document.activeElement), true);
  console.log('PASS: guide rejoué sur un build, priorités réelles, Échap et réglages conservés.');

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await wizard.getByRole('button', { name: 'Guide de création', exact: true }).click();
    for (let index = 0; index < PLAYER_TOUR_STEPS.length; index++) {
      await visibleStep(index);
      const box = await tour.locator('.tour-bubble').boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1 && box.y >= 0 && box.y + box.height <= 845);
      if (index === 2 || index === 6) await page.screenshot({ path: `artifacts/player-guide-${width}-${index}.png` });
      if (index < PLAYER_TOUR_STEPS.length - 1) await next();
    }
    await tour.getByRole('button', { name: 'Passer le guide', exact: true }).click();
    await tour.waitFor({ state: 'detached' });
  }
  await wizard.getByRole('button', { name: 'Fermer', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: /créer ma fiche/i }).click();
  assert.equal(await wizard.getByRole('complementary', { name: 'Guide de création du joueur' }).count(), 0);
  await wizard.getByRole('button', { name: 'Guide de création', exact: true }).waitFor();
  await wizard.getByRole('button', { name: 'Fermer', exact: true }).click();
  console.log('PASS: huit étapes sur mobile 320/390px, invitation mémorisée, relance toujours disponible.');

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: 'Revoir le guide', exact: false }).click();
  await tourTitle().getByText('Bienvenue chez Dommage BJ FC', { exact: true }).waitFor();
  await next();
  await tour.getByRole('heading', { name: 'Les sections du club' }).waitFor();
  await tour.locator('.tour-hole').waitFor();
  await page.keyboard.press('Escape');
  await tour.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => localStorage.getItem('dommage.tour.v1')), 'dismissed');
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  console.log('PASS: guide général toujours fonctionnel, aucune exception navigateur.');
} catch (error) {
  await page.screenshot({ path: 'artifacts/player-guide-failure.png', fullPage: true });
  throw error;
} finally { await browser.close(); }
