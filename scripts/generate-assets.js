import { access, link, mkdir, open, readFile, unlink, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const ART_DIRECTION = 'EA Sports FC FIFA 20 street-editorial aesthetic. High dynamic range, professional sports photography look, energetic studio lighting, subtle paint splash and halftone dot texture patterns, bold diagonal elements, sharp details, pure isolated subject or solid backdrop, no generic AI blur, esports tournament broadcast visual style.';

const portraits = [
  ['finisher', 'Buteur clinique célébrant un but face caméra, regard déterminé, maillot bleu marine et blanc.'],
  ['target', 'Attaquant puissant de dos/profil, gainage physique, imposant, jeu de tête.'],
  ['magician', 'Meneur technique en mouvement de dribble serré, maîtrise du ballon au pied, agilité.'],
  ['spark', 'Ailier ultra-rapide en pleine accélération explosive, effet de vitesse cinétique.'],
  ['disruptor', 'Milieu défensif agressif en posture de duel, tacle debout autoritaire, présence physique brute.'],
  ['maestro', 'Milieu relayeur distribuant le jeu avec calme, vue mi-corps, vista, précision.'],
  ['creator', 'Numéro 10 regard vers l’avant, amorçant une passe lumineuse, élégance technique.'],
  ['recycler', 'Sentinelle sobre interceptant un ballon au sol, posture d’anticipation propre.'],
  ['boss', 'Défenseur central imposant, bras écartés, autorité défensive absolue, force physique.'],
  ['progressor', 'Défenseur central relanceur montant balle au pied, regard levé vers l’attaque.'],
  ['marauder', 'Latéral moderne en sprint le long de la ligne de touche, effort athlétique intense.'],
  ['shot_stopper', 'Gardien de but plongeant sur sa ligne, gants tendus, arrêt réflexe spectaculaire.'],
  ['sweeper_keeper', 'Gardien libéro hors de sa surface, contrôlant le ballon au pied avec sang-froid.'],
];
const badges = [
  ['scoring', 'Badge hexagonal 3D couleur cyan/bleu néon symbolisant la frappe et le tir au but.'],
  ['passing', 'Badge hexagonal 3D couleur blanc et bleu métallique symbolisant la passe et la vision.'],
  ['dribbling', 'Badge hexagonal 3D dynamique symbolisant l’agilité et le dribble.'],
  ['defending', 'Badge hexagonal 3D bouclier métallique texturé symbolisant l’interception et le tacle.'],
  ['physical', 'Badge hexagonal 3D épais et robuste symbolisant la force et l’endurance.'],
  ['goalkeeper', 'Badge hexagonal 3D ganté symbolisant les réflexes et les arrêts.'],
];
export const ASSETS = [
  ...portraits.map(([id, description]) => ({
    file: `archetypes/${id}.png`, transparent: false,
    brief: `${description} Portrait sportif dynamique d’un joueur professionnel adulte fictif, sujet principal unique. Tenue bleu marine et blanc sans marque. Fond bleu nuit discrètement texturé. Cadrage adapté à l’action, ballon et gants visibles si nécessaires, silhouette lisible en miniature.`,
  })),
  ...badges.map(([id, description]) => ({
    file: `playstyles/playstyle_${id}.png`, transparent: true,
    brief: `${description} Icône graphique aux contours vectoriels nets, rendu métal 3D haut de gamme. Un badge centré, complet, avec une marge de sécurité. Matières bleu nuit, blanc métallique et cyan. Aucun joueur, aucune scène photographique.`,
  })),
  {
    file: 'ui/tactical_pitch.png', transparent: false,
    brief: 'Vue stylisée de dessus d’un terrain de football moderne, ton bleu nuit et blanc lumineux, lignes de touche géométriques nettes, éclairage de stade subtil. Vue orthographique, terrain entier vertical centré, deux surfaces de réparation symétriques, cercle central et ligne médiane corrects. Aucun joueur, aucun texte, aucune tribune encombrante.',
  },
  {
    file: 'ui/fifa20_pattern_overlay.png', transparent: true,
    brief: 'Texture abstraite à superposer à une interface : coups de pinceau (brush strokes), trames de demi-teintes (halftone dots) et géométrie asymétrique bleu roi et magenta léger. Motifs dispersés, espaces négatifs généreux, centre peu chargé. Aucun personnage, aucun objet, aucune typographie.',
  },
];

export function requestFor(asset, model = 'gpt-image-2.5-sunburst') {
  const legacy = model === 'dall-e-3';
  if (!legacy && model !== 'gpt-image-2.5-sunburst') throw new Error('Modèle non pris en charge. Aucun remplacement automatique de modèle.');
  const backdrop = asset.transparent
    ? legacy ? 'Fond uni bleu nuit. Pas de faux damier de transparence.' : 'Arrière-plan réellement transparent (canal alpha), sans fond peint ni damier.'
    : '';
  return {
    model, quality: legacy ? 'hd' : 'max', size: '1024x1024', n: 1,
    prompt: `${ART_DIRECTION}\n\nAsset pour un configurateur Pro Clubs. ${asset.brief}\n${backdrop}\nPas de texte, de logo, de watermark ni de bordure d’interface.`,
    ...(legacy ? { response_format: 'url', style: 'vivid' } : { output_format: 'png', background: asset.transparent ? 'transparent' : 'opaque' }),
  };
}

async function exists(file) {
  try { await access(file, constants.F_OK); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

export function validatePng(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 45 || !buffer.subarray(0, 8).equals(signature)
      || buffer.toString('ascii', 12, 16) !== 'IHDR'
      || buffer.readUInt32BE(16) !== 1024 || buffer.readUInt32BE(20) !== 1024
      || buffer.toString('ascii', buffer.length - 8, buffer.length - 4) !== 'IEND') {
    throw new Error('Image reçue invalide : PNG complet de 1024 × 1024 attendu.');
  }
}

// Un fichier final n'apparaît qu'une fois complet. Ne remplace jamais un fichier existant.
async function savePng(file, buffer) {
  validatePng(buffer);
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, buffer, { flag: 'wx' });
  try { await link(temporary, file); }
  finally { await unlink(temporary); }
}

function safeMessage(value, key) {
  return String(value).replaceAll(key || '\0', '[clé masquée]').replace(/sk-[\w-]+/g, '[clé masquée]').slice(0, 400);
}

export async function generateAssets({
  root = ROOT, apiKey = process.env.OPENAI_API_KEY, model = 'gpt-image-2.5-sunburst', dryRun = false,
  assets = ASSETS, fetchImpl = fetch, wait = sleep, log = console.log,
} = {}) {
  const output = resolve(root, 'public/images');
  const cache = resolve(root, 'artifacts/image-generation');
  let generated = 0, skipped = 0, failed = 0, requests = 0;
  const pending = [];
  for (const [index, asset] of assets.entries()) {
    const file = resolve(output, asset.file);
    const position = `(${index + 1}/${assets.length})`;
    if (await exists(file)) { log(`[IGNORÉ] ${asset.file} ${position} — déjà présent.`); skipped++; }
    else pending.push({ asset, file, position });
  }
  if (dryRun) {
    for (const { asset, position } of pending) log(`[PRÉVU] ${asset.file} ${position}\n${JSON.stringify(requestFor(asset, model), null, 2)}`);
    log(`[SIMULATION] ${pending.length} à générer, ${skipped} existants. Aucun appel API.`);
    return { generated, skipped, failed };
  }
  if (!pending.length) { log(`[TERMINÉ] ${skipped} images déjà présentes. Aucun appel API.`); return { generated, skipped, failed }; }
  if (!apiKey?.trim()) throw new Error('OPENAI_API_KEY absente. Configure-la dans .env.local ou dans l’environnement, puis relance. Ne partage pas la clé dans le chat.');
  requestFor(pending[0].asset, model); // Validation avant tout appel facturable.
  await mkdir(cache, { recursive: true });
  const lockFile = resolve(cache, 'generate-assets.lock');
  let lock;
  try { lock = await open(lockFile, 'wx'); }
  catch (error) {
    if (error.code === 'EEXIST') throw new Error('Une génération est déjà en cours. Après un arrêt brutal seulement, vérifie le processus puis retire artifacts/image-generation/generate-assets.lock.');
    throw error;
  }
  try {
    await lock.writeFile(String(process.pid));
    if (model === 'dall-e-3') log('[INFO] DALL·E 3 est retiré de l’API selon OpenAI. Ce mode conserve ta configuration historique ; il ne produit pas de canal alpha natif. Aucun autre modèle ne sera choisi automatiquement.');
    for (const { asset, file, position } of pending) {
      // Deuxième vérification si un autre outil a créé l'image entre-temps.
      if (await exists(file)) { skipped++; log(`[IGNORÉ] ${asset.file} ${position} — déjà présent.`); continue; }
      await mkdir(dirname(file), { recursive: true });
      const cacheFile = resolve(cache, asset.file.replaceAll('/', '__') + '.json');
      try {
        let data;
        if (await exists(cacheFile)) {
          ({ data } = JSON.parse(await readFile(cacheFile, 'utf8')));
          log(`[REPRISE] ${asset.file} ${position} — réponse sauvegardée, sans nouvelle génération.`);
        } else {
          const payload = requestFor(asset, model);
          let response;
          for (let attempt = 0; attempt < 5; attempt++) {
            if (requests > 0) await wait(7500);
            requests++;
            log(`[GÉNÉRATION] ${asset.file} ${position}${attempt ? ` — tentative ${attempt + 1}` : ''}`);
            // Un timeout ou une coupure peut cacher une génération facturée : pas de nouvelle tentative automatique.
            try {
              response = await fetchImpl('https://api.openai.com/v1/images/generations', {
                method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(payload), signal: AbortSignal.timeout(300_000),
              });
            } catch { throw new Error('Connexion interrompue ou délai dépassé. Arrêt pour éviter une double facturation ; vérifie les requêtes OpenAI avant de relancer.'); }
            const body = await response.json();
            if (response.ok) {
              data = body.data?.[0];
              if (!data?.url && !data?.b64_json) throw new Error('L’API n’a renvoyé aucune image.');
              await writeFile(cacheFile, JSON.stringify({ request: payload, data, generatedAt: new Date().toISOString() }, null, 2), { flag: 'wx' });
              break;
            }
            const code = body.error?.code;
            const retryable = response.status === 429 && code !== 'insufficient_quota' && code !== 'billing_hard_limit_reached';
            if (!retryable || attempt === 4) throw new Error(`API HTTP ${response.status}${code ? ` (${code})` : ''} : ${safeMessage(body.error?.message || 'Requête refusée.', apiKey)}`);
            const header = response.headers.get('retry-after');
            const retryMs = header ? (/^\d+(\.\d+)?$/.test(header) ? Number(header) * 1000 : Date.parse(header) - Date.now()) : 0;
            const delay = Math.max(10_000 * 2 ** attempt, Number.isFinite(retryMs) ? retryMs : 0);
            log(`[ATTENTE] Limite API : nouvelle tentative dans ${Math.ceil((delay + 7500) / 1000)} s.`);
            await wait(delay);
          }
        }
        let bytes;
        if (data.b64_json) bytes = Buffer.from(data.b64_json, 'base64');
        else {
          // Les URL signées ne sont jamais affichées, et la clé n'est jamais envoyée au serveur d'images.
          const url = new URL(data.url);
          if (url.protocol !== 'https:') throw new Error('URL d’image non HTTPS refusée.');
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const downloaded = await fetchImpl(url, { signal: AbortSignal.timeout(60_000) });
              if (!downloaded.ok) throw new Error(`Téléchargement HTTP ${downloaded.status}.`);
              bytes = Buffer.from(await downloaded.arrayBuffer());
              validatePng(bytes);
              break;
            } catch {
              if (attempt === 2) throw new Error(`Téléchargement impossible. Réponse API conservée dans artifacts/image-generation ; relance sans refacturation. Si l’URL a expiré, retire uniquement son cache pour autoriser une nouvelle génération.`);
              await wait(7500);
            }
          }
        }
        await savePng(file, bytes);
        generated++;
        log(`[GENÉRÉ] ${asset.file.split('/').at(-1)} ${position} → public/images/${asset.file}`);
      } catch (error) {
        failed++;
        log(`[ERREUR] ${asset.file} ${position} : ${safeMessage(error.message, apiKey)}`);
        // Une erreur de modèle, quota ou connexion ne doit pas déclencher 20 autres appels inutiles.
        break;
      }
    }
  } finally { await lock.close(); await unlink(lockFile); }
  log(`[BILAN] ${generated} générées, ${skipped} ignorées, ${failed} erreur(s), ${assets.length - generated - skipped} restante(s).`);
  return { generated, skipped, failed };
}

async function main() {
  // Résolution depuis ce script, même lorsqu'on le lance hors de la racine du projet.
  for (const name of ['.env.local', '.env']) {
    try { process.loadEnvFile(resolve(ROOT, name)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('node scripts/generate-assets.js [--dry-run] [--model=gpt-image-2.5-sunburst|dall-e-3]\nDéfaut : gpt-image-2.5-sunburst / max / 1024x1024. DALL·E 3 est retiré de l’API.');
    return;
  }
  for (const arg of args) if (arg !== '--dry-run' && !arg.startsWith('--model=')) throw new Error(`Argument inconnu : ${arg}`);
  const model = args.find((arg) => arg.startsWith('--model='))?.slice(8) ?? 'gpt-image-2.5-sunburst';
  const result = await generateAssets({ model, dryRun: args.includes('--dry-run') });
  if (result.failed) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(`[ARRÊT] ${safeMessage(error.message, process.env.OPENAI_API_KEY)}`); process.exitCode = 1; });
}
