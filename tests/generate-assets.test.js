import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { deflateSync } from 'node:zlib';
import { ASSETS, ART_DIRECTION, ROOT, generateAssets, requestFor, validatePng } from '../scripts/generate-assets.js';

// Vrai PNG 1024 × 1024 transparent, construit localement pour ne pas facturer les tests.
function chunk(type, data) {
  const content = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of content) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const size = Buffer.alloc(4), checksum = Buffer.alloc(4);
  size.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([size, content, checksum]);
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(1024, 0); ihdr.writeUInt32BE(1024, 4); ihdr[8] = 8; ihdr[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(Buffer.alloc(1024 * (1024 * 4 + 1)))), chunk('IEND', Buffer.alloc(0)),
]);
const success = () => Response.json({ data: [{ b64_json: png.toString('base64') }] });
async function setup(t) {
  const parent = resolve(ROOT, 'artifacts');
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(resolve(parent, 'assets-test-'));
  t.after(async () => {
    assert.ok(resolve(root).startsWith(parent + sep + 'assets-test-'));
    await rm(root, { recursive: true });
  });
  const logs = [], waits = [];
  return { root, apiKey: 'local-test-key', assets: ASSETS.slice(0, 2), log: (text) => logs.push(text), wait: async (ms) => { waits.push(ms); }, logs, waits };
}

test('21 exact destinations, shared art direction, maximum quality and alpha only where requested', () => {
  assert.equal(ASSETS.length, 21); assert.equal(new Set(ASSETS.map((a) => a.file)).size, 21);
  assert.equal(ASSETS.filter((a) => a.file.startsWith('archetypes/')).length, 13);
  assert.equal(ASSETS.filter((a) => a.file.startsWith('playstyles/')).length, 6);
  assert.ok(ASSETS.some((a) => a.file === 'archetypes/shot_stopper.png'));
  assert.ok(ASSETS.some((a) => a.file === 'archetypes/sweeper_keeper.png'));
  for (const asset of ASSETS) {
    const request = requestFor(asset);
    assert.ok(request.prompt.includes(ART_DIRECTION));
    assert.equal(request.model, 'gpt-image-2.5-sunburst'); assert.equal(request.quality, 'max');
    assert.equal(request.size, '1024x1024'); assert.equal(request.n, 1);
    assert.equal(request.background, asset.transparent ? 'transparent' : 'opaque');
  }
  const legacy = requestFor(ASSETS[0], 'dall-e-3');
  assert.equal(legacy.quality, 'hd'); assert.equal(legacy.response_format, 'url');
  assert.equal('background' in legacy, false);
});

test('dry run and already existing files incur no requests, even without a key', async (t) => {
  const config = await setup(t);
  await generateAssets({ ...config, apiKey: '', dryRun: true, fetchImpl: () => assert.fail('No API in dry run') });
  await mkdir(resolve(config.root, 'public/images/archetypes'), { recursive: true });
  for (const asset of config.assets) await writeFile(resolve(config.root, 'public/images', asset.file), png);
  const result = await generateAssets({ ...config, apiKey: '', fetchImpl: () => assert.fail('Existing assets must be skipped') });
  assert.deepEqual(result, { generated: 0, skipped: 2, failed: 0 });
});

test('writes real PNGs, paces generation by 7.5 seconds and never overwrites', async (t) => {
  const config = await setup(t);
  let calls = 0;
  const result = await generateAssets({ ...config, fetchImpl: async (url, init) => {
    calls++; assert.equal(url, 'https://api.openai.com/v1/images/generations');
    assert.equal(JSON.parse(init.body).quality, 'max'); return success();
  } });
  assert.deepEqual(result, { generated: 2, skipped: 0, failed: 0 });
  assert.equal(calls, 2); assert.deepEqual(config.waits, [7500]);
  for (const asset of config.assets) assert.deepEqual(await readFile(resolve(config.root, 'public/images', asset.file)), png);
  await generateAssets({ ...config, fetchImpl: () => assert.fail('No repeat billing') });
});

test('rate limits honor Retry-After; quota errors stop the batch immediately', async (t) => {
  const config = await setup(t); let calls = 0;
  const result = await generateAssets({ ...config, assets: [ASSETS[0]], fetchImpl: async () => {
    return ++calls === 1 ? Response.json({ error: { code: 'rate_limit_exceeded' } }, { status: 429, headers: { 'Retry-After': '30' } }) : success();
  } });
  assert.equal(result.generated, 1); assert.equal(calls, 2); assert.deepEqual(config.waits, [30_000, 7500]);
  calls = 0;
  const quota = await generateAssets({ ...config, assets: ASSETS.slice(1, 3), fetchImpl: async () => {
    calls++; return Response.json({ error: { code: 'insufficient_quota' } }, { status: 429 });
  } });
  assert.equal(quota.failed, 1); assert.equal(calls, 1);
});

test('failed downloads resume from saved URL without regenerating or forwarding credentials', async (t) => {
  const config = await setup(t); let generations = 0, downloads = 0;
  const first = await generateAssets({ ...config, assets: [ASSETS[0]], model: 'dall-e-3', fetchImpl: async (url, init) => {
    if (init.method === 'POST') { generations++; return Response.json({ data: [{ url: 'https://images.example.test/asset.png' }] }); }
    downloads++; assert.equal(init.headers, undefined); return new Response('', { status: 503 });
  } });
  assert.equal(first.failed, 1); assert.equal(generations, 1); assert.equal(downloads, 3);
  const resumed = await generateAssets({ ...config, assets: [ASSETS[0]], fetchImpl: async (url, init) => {
    assert.equal(init.method, undefined); assert.equal(init.headers, undefined); return new Response(png);
  } });
  assert.equal(resumed.generated, 1);
});

test('invalid images and interrupted requests never become final files or trigger new POSTs', async (t) => {
  validatePng(png); assert.throws(() => validatePng(Buffer.from('not an image')));
  const config = await setup(t); let calls = 0;
  const result = await generateAssets({ ...config, fetchImpl: async () => { calls++; throw new Error('Network disconnected'); } });
  assert.equal(calls, 1); assert.equal(result.failed, 1);
  await assert.rejects(readFile(resolve(config.root, 'public/images', ASSETS[0].file)), { code: 'ENOENT' });
  assert.ok(config.logs.every((line) => !line.includes(config.apiKey)));
});

test('missing key stops before any network call', async (t) => {
  const config = await setup(t);
  await assert.rejects(generateAssets({ ...config, apiKey: '', fetchImpl: () => assert.fail('Missing key') }), /OPENAI_API_KEY absente/);
});
