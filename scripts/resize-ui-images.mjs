import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

// Variantes légères des images d'interface.
//
// Les sources font 1024 px de côté. Sur un téléphone, le motif de fond est affiché à
// 289 px de large : le navigateur téléchargeait 226 Ko pour en afficher un huitième,
// en concurrence avec la feuille de styles et le bundle. On génère donc une variante
// étroite, référencée par `srcset` pour que le navigateur choisisse selon sa densité.
//
// Le redimensionnement passe par Chrome (déjà installé pour les tests navigateur)
// plutôt que par sharp : une dépendance native de moins pour trois images.
//
//   node scripts/resize-ui-images.mjs
//
// À relancer après toute régénération d'une source listée ci-dessous.

const VARIANTES = [
  // Le poids de ce motif vient de sa couche alpha, pas de la compression : de q0.35 a
  // q0.75 l'ecart n'est que de 10 Ko. On garde donc une qualite haute et on joue sur la
  // seule variable qui compte, la resolution.
  { source: 'public/images/ui/fifa20-pattern.webp', sortie: 'public/images/ui/fifa20-pattern-512.webp', largeur: 512, qualite: 0.75 },
];

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

/**
 * Chrome décode l'image, la redessine à la taille voulue puis la réencode en WebP.
 * `createImageBitmap` garde la couche alpha, indispensable pour un motif superposé.
 */
const encoder = async ({ donnees, largeur, qualite }) => {
  const image = await createImageBitmap(new Blob([new Uint8Array(donnees)]));
  const hauteur = Math.round((image.height / image.width) * largeur);
  const toile = new OffscreenCanvas(largeur, hauteur);
  const ctx = toile.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, largeur, hauteur);
  const blob = await toile.convertToBlob({ type: 'image/webp', quality: qualite });
  return { octets: [...new Uint8Array(await blob.arrayBuffer())], largeur, hauteur };
};

const navigateur = await chromium.launch({ executablePath: CHROME, headless: true });
const page = await (await navigateur.newContext()).newPage();
// convertToBlob refuse de tourner sur about:blank : il faut une vraie origine.
await page.setContent('<!doctype html><title>encodeur</title>');

for (const { source, sortie, largeur, qualite } of VARIANTES) {
  const original = await readFile(source);
  const { octets, hauteur } = await page.evaluate(encoder, { donnees: [...original], largeur, qualite });
  const reduit = Buffer.from(octets);
  await writeFile(sortie, reduit);
  const gain = Math.round((1 - reduit.length / original.length) * 100);
  console.log(`${sortie} — ${largeur}x${hauteur}, ${Math.round(reduit.length / 1024)} Ko `
    + `(source ${Math.round(original.length / 1024)} Ko, -${gain} %)`);
}

await navigateur.close();
