// Rend la séquence de montée en MP4 vertical 1080 × 1920 (stories, messages), avec sa piste son.
// La séquence est en CSS : on fige toutes les animations et on les avance image par image,
// donc le rendu ne dépend pas de la vitesse de la machine.
//
//   npx vite --port 5183            (dans un autre terminal, base de données lisible)
//   npx tsx scripts/render-celebration-video.ts [url] [sortie.mp4]
//
// Une nouvelle montée avec voix off = une nouvelle entrée dans SCRIPTS (CinematicCelebration.tsx),
// puis relancer ce script et déposer le fichier dans public/videos/.

import { spawnSync } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const BASE = process.argv[2] ?? 'http://localhost:5183';
const OUT = process.argv[3] ?? 'public/videos/montee-d1.mp4';
const AUDIO = 'public/sons/celebration/montee-d1.mp3';
const FPS = 30;
/** Les animations s'arrêtent à 50,2 s ; on laisse Promus à l'écran avec la musique, sous la minute des stories. */
const DURATION_S = Number(process.env.DURATION_S ?? 56);
const FADE_S = 2.5;
const FRAMES = join('scripts', '.frames');

// 475 × 844 : la scène de 390 × 844 tient à l'échelle 1, centrée sur un fond noir au format 9:16.
const VIEW = { width: 475, height: 844 };
const DPR = 1080 / VIEW.width;

await rm(FRAMES, { recursive: true, force: true });
await mkdir(FRAMES, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROME_EXECUTABLE ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const context = await browser.newContext({ viewport: VIEW, deviceScaleFactor: DPR });
await context.addInitScript(() => {
  localStorage.setItem('dommage.tour.v3', 'done');
  localStorage.setItem('bets.seen.0', '1');
  localStorage.setItem('foodball.celebration.muted', '1'); // pas d'attente du son : l'image démarre au clic
  localStorage.setItem('foodball.celebration.seen.v2', '1');
  // Le minuteur de fin (50,2 s) passerait la scène en « is-skip » pendant le rendu : on l'ignore.
  const setTimer = window.setTimeout.bind(window);
  window.setTimeout = ((fn: TimerHandler, ms?: number, ...rest: unknown[]) => (ms ?? 0) > 40_000 ? 0 : setTimer(fn, ms, ...rest)) as typeof window.setTimeout;
});
const page = await context.newPage();
await page.goto(`${BASE}/club#progression`);
await page.getByRole('button', { name: /Revoir la montée/ }).click();
await page.locator('.fcq-stage').waitFor();
await page.addStyleTag({ content: '.fcq-tools, .fcq-pact { display: none !important; } *, *::before, *::after { caret-color: transparent !important; }' });
await page.evaluate(() => document.fonts.ready);
await page.evaluate(() => document.getAnimations().forEach((a) => a.pause()));

const total = DURATION_S * FPS;
for (let f = 0; f < total; f++) {
  const ms = (f / FPS) * 1000;
  await page.evaluate((t) => document.getAnimations().forEach((a) => { a.currentTime = t; }), ms);
  await page.screenshot({ path: join(FRAMES, `${String(f).padStart(5, '0')}.jpg`), type: 'jpeg', quality: 92 });
  if (f % 150 === 0) console.log(`image ${f}/${total}`);
}
await browser.close();

const ffmpeg = spawnSync('ffmpeg', [
  '-y', '-framerate', String(FPS), '-i', join(FRAMES, '%05d.jpg'),
  '-i', AUDIO,
  '-filter_complex', `[0:v]scale=1080:1920:flags=lanczos,format=yuv420p[v];[1:a]atrim=0:${DURATION_S},afade=t=out:st=${DURATION_S - FADE_S}:d=${FADE_S}[a]`,
  '-map', '[v]', '-map', '[a]',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-profile:v', 'high', '-movflags', '+faststart',
  '-c:a', 'aac', '-b:a', '160k', '-t', String(DURATION_S), OUT,
], { stdio: 'inherit' });
if (ffmpeg.status !== 0) throw new Error('ffmpeg a échoué');
await rm(FRAMES, { recursive: true, force: true });
console.log(`Vidéo écrite : ${OUT}`);
