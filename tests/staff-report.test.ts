import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FC27Player } from '../shared/fc27.js';
import { BUDGETS, STAFF_JSON_SCHEMA, squadFingerprint, sanitizeReport, staffReportSchema } from '../shared/staff-report.js';
import { STAFF_MODEL, StaffUnavailable, generateStaffReport } from '../server/staff-mistral.js';
import { createStaffHandler, MIN_SQUAD, type StaffCache } from '../server/staff-http.js';
import { AI_LINES } from '../shared/data/club-policy.js';

const player = (over: Partial<FC27Player> & { id: number; pseudo: string }): FC27Player => ({
  in_game_name: over.pseudo.toUpperCase(), primary_position: 'BU', secondary_positions: [], notes: null,
  updated_at: '2026-09-19T12:00:00Z', kit_number: over.id, preferred_foot: 'Droit', height_cm: 180,
  weight_kg: 75, archetype: 'finisher', weak_foot: 3, skill_moves: 3, attribute_priorities: [], ...over,
});

const squad = [
  player({ id: 1, pseudo: 'ana' }),
  player({ id: 2, pseudo: 'bo', primary_position: 'DC', archetype: 'boss' }),
  player({ id: 3, pseudo: 'cam', primary_position: 'MC', archetype: 'maestro' }),
];

const REPORT = {
  headline: 'Un bloc court qui vit sur les transitions.',
  reading: 'La charnière tient seule et le milieu unique doit couvrir toute la largeur du terrain à lui seul.',
  priorities: [{ need: 'Un second défenseur central', why: 'Bo est seul dans l’axe et se retrouve exposé à chaque une-deux.', stopgap: 'Cam peut redescendre.' }],
  players: [{ pseudo: 'ana', advice: 'Attaque la profondeur dès que Cam lève la tête.' }],
};

// ---------------------------------------------------------------- Empreinte

test('l’empreinte est stable et indépendante de l’ordre des fiches', () => {
  assert.equal(squadFingerprint(squad), squadFingerprint([...squad].reverse()));
});

test('l’empreinte change dès qu’une fiche change ou qu’un joueur arrive', () => {
  const base = squadFingerprint(squad);
  assert.notEqual(base, squadFingerprint([...squad, player({ id: 4, pseudo: 'dee' })]));
  assert.notEqual(base, squadFingerprint(squad.map((p) => (p.id === 1 ? { ...p, archetype: 'target' } : p))));
  assert.notEqual(base, squadFingerprint(squad.map((p) => (p.id === 1 ? { ...p, height_cm: 190 } : p))));
  assert.notEqual(base, squadFingerprint(squad.map((p) => (p.id === 1 ? { ...p, attribute_priorities: ['calme'] } : p))));
});

test('l’empreinte ignore ce qui ne change pas l’analyse', () => {
  const touched = squad.map((p) => ({ ...p, updated_at: '2027-01-01T00:00:00Z' }));
  assert.equal(squadFingerprint(squad), squadFingerprint(touched));
});

test('la politique de club invalide le cache même sans modification des fiches', () => {
  const original = [...AI_LINES];
  const before = squadFingerprint(squad);
  try {
    AI_LINES.splice(0);
    assert.notEqual(squadFingerprint(squad), before);
  } finally {
    AI_LINES.push(...original);
  }
});

// ---------------------------------------------------------------- Nettoyage

test('un conseil visant un joueur inexistant est écarté', () => {
  const dirty = { ...REPORT, players: [{ pseudo: 'fantome', advice: 'Reste haut.' }, ...REPORT.players] };
  const clean = sanitizeReport(staffReportSchema.parse(dirty), squad);
  assert.deepEqual(clean.players.map((p) => p.pseudo), ['ana']);
});

test('un joueur conseillé deux fois n’apparaît qu’une fois', () => {
  const doubled = { ...REPORT, players: [...REPORT.players, { pseudo: 'ana', advice: 'Autre chose entièrement.' }] };
  const clean = sanitizeReport(staffReportSchema.parse(doubled), squad);
  assert.equal(clean.players.length, 1);
});

// ---------------------------------------------------------------- Appel au modèle

const ok = (body: unknown) => async () => new Response(JSON.stringify(body), { status: 200 });
const reply = (content: unknown) => ok({ choices: [{ message: { content: JSON.stringify(content) } }] });

test('une réponse conforme est validée et nettoyée', async () => {
  const { report, model } = await generateStaffReport(squad, { apiKey: 'test', fetchImpl: reply(REPORT) as never });
  assert.equal(report.headline, REPORT.headline);
  assert.equal(model, STAFF_MODEL);
});

test('MISTRAL_MODEL surcharge le modèle par défaut', async () => {
  const previous = process.env.MISTRAL_MODEL;
  process.env.MISTRAL_MODEL = 'ministral-3b-latest';
  try {
    let sent = '';
    const spy = (async (_url: string, init: RequestInit) => {
      sent = JSON.parse(init.body as string).model;
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(REPORT) } }] }), { status: 200 });
    }) as never;
    const { model } = await generateStaffReport(squad, { apiKey: 'k', fetchImpl: spy });
    assert.equal(sent, 'ministral-3b-latest');
    assert.equal(model, 'ministral-3b-latest');
  } finally {
    if (previous === undefined) delete process.env.MISTRAL_MODEL; else process.env.MISTRAL_MODEL = previous;
  }
});

test('la requête envoyée porte la clé, le schéma et les pseudos réels', async () => {
  let seen: { url: string; init: RequestInit } | undefined;
  const spy = (async (url: string, init: RequestInit) => {
    seen = { url, init };
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(REPORT) } }] }), { status: 200 });
  }) as never;
  await generateStaffReport(squad, { apiKey: 'secret-123', fetchImpl: spy });
  assert.equal(seen!.url, 'https://api.mistral.ai/v1/chat/completions');
  assert.equal((seen!.init.headers as Record<string, string>).Authorization, 'Bearer secret-123');
  const body = JSON.parse(seen!.init.body as string);
  assert.equal(body.response_format.type, 'json_schema');
  assert.equal(body.response_format.json_schema.strict, true);
  assert.match(body.messages[1].content, /pseudo ana/);
  assert.match(body.messages[1].content, /Score de synergie : \d+\/100/);
});

test('sans clé, rien n’est appelé', async () => {
  const boom = (() => { throw new Error('ne doit pas être appelé'); }) as never;
  await assert.rejects(() => generateStaffReport(squad, { apiKey: '', fetchImpl: boom }), StaffUnavailable);
});

test('une sortie hors schéma est rejetée plutôt qu’affichée', async () => {
  await assert.rejects(
    () => generateStaffReport(squad, { apiKey: 'test', fetchImpl: reply({ headline: 'trop court' }) as never }),
    StaffUnavailable,
  );
});

test('du JSON invalide, une erreur HTTP ou un réseau coupé restent des indisponibilités', async () => {
  const bad = ok({ choices: [{ message: { content: 'pas du json' } }] }) as never;
  await assert.rejects(() => generateStaffReport(squad, { apiKey: 'k', fetchImpl: bad }), StaffUnavailable);

  const http500 = (async () => new Response('rate limited', { status: 429 })) as never;
  await assert.rejects(() => generateStaffReport(squad, { apiKey: 'k', fetchImpl: http500 }), StaffUnavailable);

  const offline = (async () => { throw new Error('ECONNRESET'); }) as never;
  await assert.rejects(() => generateStaffReport(squad, { apiKey: 'k', fetchImpl: offline }), StaffUnavailable);
});

test('la clé n’apparaît jamais dans le message d’erreur', async () => {
  const leak = (async () => new Response('bad key sk-live-abcdef123456', { status: 401 })) as never;
  const error = await generateStaffReport(squad, { apiKey: 'sk-live-abcdef123456', fetchImpl: leak }).catch((e) => e as Error);
  assert.ok(!error.message.includes('sk-live-abcdef123456'), 'la clé a fuité dans le message');
  assert.match(error.message, /clé masquée/);
});

// ---------------------------------------------------------------- Route

const state = (players: FC27Player[]) => (async () => ({
  campaign: { id: 7, status: 'preparation', created_at: '', archived_at: null },
  players, proposals: [], election: {}, winner: null, archives: [], server_time: '',
})) as never;

const memoryCache = (): StaffCache & { writes: number } => {
  const store = new Map<string, { payload: unknown; model: string; created_at: string }>();
  return {
    writes: 0,
    async read(campaignId, hash) { return store.get(`${campaignId}:${hash}`); },
    async write(campaignId, hash, report, model) {
      this.writes += 1;
      store.set(`${campaignId}:${hash}`, { payload: report, model, created_at: new Date().toISOString() });
    },
  };
};

const get = (handler: { GET: (r: Request) => Promise<Response> }) =>
  handler.GET(new Request('https://x/api/fc27/report?campaign=7'));

test('un effectif trop petit ne déclenche aucun appel', async () => {
  let called = false;
  const handler = createStaffHandler(state([squad[0]]), memoryCache(), {
    generate: (async () => { called = true; return { report: REPORT, model: 'm' }; }) as never,
    hasKey: () => true,
  });
  const body = await (await get(handler)).json();
  assert.deepEqual(body, { available: false, reason: 'too-small' });
  assert.equal(called, false);
  assert.ok(squad.length >= MIN_SQUAD);
});

test('sans clé configurée, la route le dit sans appeler le modèle', async () => {
  const handler = createStaffHandler(state(squad), memoryCache(), {
    generate: (async () => { throw new Error('ne doit pas être appelé'); }) as never,
    hasKey: () => false,
  });
  assert.deepEqual(await (await get(handler)).json(), { available: false, reason: 'not-configured' });
});

test('le même effectif n’est analysé qu’une fois, le suivant vient du cache', async () => {
  const cache = memoryCache();
  let calls = 0;
  const handler = createStaffHandler(state(squad), cache, {
    generate: (async () => { calls += 1; return { report: REPORT, model: 'mistral-large-latest' }; }) as never,
    hasKey: () => true,
  });
  const first = await (await get(handler)).json();
  const second = await (await get(handler)).json();
  assert.equal(calls, 1, 'le second visiteur ne doit pas déclencher un appel facturé');
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(second.report.headline, REPORT.headline);
  assert.equal(cache.writes, 1);
});

test('une panne du modèle laisse le rapport déterministe seul, sans erreur', async () => {
  const handler = createStaffHandler(state(squad), memoryCache(), {
    generate: (async () => { throw new StaffUnavailable('429'); }) as never,
    hasKey: () => true,
  });
  const response = await get(handler);
  assert.equal(response.status, 200, 'une analyse absente n’est pas une erreur de page');
  assert.deepEqual(await response.json(), { available: false, reason: 'failed' });
});

test('une analyse en cache devenue illisible est régénérée', async () => {
  const cache = memoryCache();
  await cache.write(7, squadFingerprint(squad), { bidon: true } as never, 'ancien');
  let calls = 0;
  const handler = createStaffHandler(state(squad), cache, {
    generate: (async () => { calls += 1; return { report: REPORT, model: 'mistral-large-latest' }; }) as never,
    hasKey: () => true,
  });
  const body = await (await get(handler)).json();
  assert.equal(calls, 1);
  assert.equal(body.available, true);
  assert.equal(body.cached, false);
});

test('un cache en panne ne casse pas la génération', async () => {
  const broken: StaffCache = {
    read: async () => { throw new Error('base injoignable'); },
    write: async () => { throw new Error('base injoignable'); },
  };
  const handler = createStaffHandler(state(squad), broken, {
    generate: (async () => ({ report: REPORT, model: 'mistral-large-latest' })) as never,
    hasKey: () => true,
  });
  const body = await (await get(handler)).json();
  assert.equal(body.available, true);
});

test('le schéma JSON ne porte aucun maxLength', () => {
  // Le décodage contraint coupe au caractère près au lieu de raccourcir : une phrase
  // tronquée en plein mot arriverait jusqu'à l'écran. Les budgets vivent dans le prompt.
  const serialized = JSON.stringify(STAFF_JSON_SCHEMA);
  assert.ok(!serialized.includes('maxLength'), 'maxLength est revenu dans le schéma JSON');
});

test('les bornes zod laissent une marge au-dessus du budget annoncé', () => {
  const justOver = { ...REPORT, headline: 'x'.repeat(BUDGETS.headline + 15) };
  assert.equal(staffReportSchema.safeParse(justOver).success, true, 'un léger dépassement ne doit pas tout jeter');
  const wayOver = { ...REPORT, headline: 'x'.repeat(BUDGETS.headline * 3) };
  assert.equal(staffReportSchema.safeParse(wayOver).success, false, 'une sortie manifestement cassée doit être rejetée');
});

test('le markdown glissé par le modèle est retiré partout', () => {
  const marked = {
    headline: 'Un effectif **défensivement nu** et sans filet.',
    reading: 'La défense est __inexistante__ et le `couloir gauche` reste vide sur toute la largeur du terrain.',
    priorities: [{ need: '**Un gardien**', why: 'Les contre-attaques adverses seront **inarrêtables** faute de dernier rempart.', stopgap: '*ana* peut dépanner.' }],
    players: [{ pseudo: 'ana', advice: 'Reste **haut** et attaque la profondeur dès la récupération.' }],
  };
  const clean = sanitizeReport(staffReportSchema.parse(marked), squad);
  const all = [clean.headline, clean.reading, clean.priorities[0].need, clean.priorities[0].why, clean.priorities[0].stopgap, clean.players[0].advice].join(' ');
  assert.ok(!/[*_`]/.test(all), `formatage résiduel : ${all}`);
  assert.equal(clean.priorities[0].need, 'Un gardien');
  assert.match(clean.headline, /défensivement nu/);
});

test('un dépannage qui nomme un joueur inexistant est effacé', () => {
  const ghost = { ...REPORT, priorities: [{ ...REPORT.priorities[0], stopgap: 'fdsf peut redescendre en MDC.' }] };
  const clean = sanitizeReport(staffReportSchema.parse(ghost), squad);
  assert.equal(clean.priorities[0].stopgap, null);
});

test('un dépannage qui nomme un joueur réel est conservé', () => {
  const real = { ...REPORT, priorities: [{ ...REPORT.priorities[0], stopgap: 'cam peut redescendre en MDC.' }] };
  const clean = sanitizeReport(staffReportSchema.parse(real), squad);
  assert.equal(clean.priorities[0].stopgap, 'cam peut redescendre en MDC.');
});

test('un dépannage vague, sans personne nommée, est écarté', () => {
  const vague = { ...REPORT, priorities: [{ ...REPORT.priorities[0], stopgap: 'un des buteurs peut dépanner' }] };
  assert.equal(sanitizeReport(staffReportSchema.parse(vague), squad).priorities[0].stopgap, null);
});
