import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

async function functionsIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory()
    ? functionsIn(join(directory, entry.name))
    : /\.(?:[cm]?[jt]s|py|go|rb)$/.test(entry.name) && !entry.name.endsWith('.d.ts') ? [join(directory, entry.name)] : []))).flat();
}
const functions = await functionsIn(fileURLToPath(new URL('../api', import.meta.url)));
const maximum = 12;
if (functions.length > maximum) {
  console.error(`${functions.length} fonctions dans api/ : la limite Vercel Hobby est ${maximum}. Regrouper les routes avant de déployer.`);
  process.exitCode = 1;
} else console.log(`Vercel Hobby : ${functions.length}/${maximum} fonctions serveur.`);
