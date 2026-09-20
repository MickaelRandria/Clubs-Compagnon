import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLookalikeHandler } from '../server/lookalike-http.js';
import { StaffUnavailable, mistralJson } from '../server/staff-mistral.js';
import { LOOKALIKES } from '../shared/data/lookalikes.js';
import { lookupSchema, validateLookup } from '../shared/lookalike-lookup.js';

const valid = { ...LOOKALIKES.find((entry) => entry.id === 'zidane')!, known: true };
const request = (q: string) => new Request(`http://localhost/api/fc27/lookalike?q=${encodeURIComponent(q)}`);
const handlerFor = (parsed: unknown) => createLookalikeHandler({
  hasKey: () => true,
  call: async () => ({ parsed, raw: JSON.stringify(parsed), model: 'test' }),
});

test('la liste et les surnoms fonctionnent sans clé ni appel au modèle', async () => {
  const handler = createLookalikeHandler({ hasKey: () => false, call: async () => { throw new Error('Appel interdit'); } });
  const response = await handler.GET(request(' ZIZOU '));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  const body = await response.json();
  assert.equal(body.source, 'curated');
  assert.equal(body.entry.id, 'zidane');
});

test('une requête invalide est refusée avant tout appel externe', async () => {
  const handler = createLookalikeHandler({ call: async () => { throw new Error('Appel interdit'); } });
  for (const query of ['', 'a', '  ', 'x'.repeat(61)]) assert.equal((await handler.GET(request(query))).status, 400);
});

test('un nom absent et aucune clé donnent un état explicite', async () => {
  const handler = createLookalikeHandler({ hasKey: () => false });
  assert.deepEqual(await (await handler.GET(request('Gianfranco Zola'))).json(), { found: false, reason: 'not-configured' });
});

test('le résultat modèle conforme porte sa provenance et les priorités dans l’ordre', async () => {
  const body = await (await handlerFor(valid).GET(request('nom hors liste'))).json();
  assert.equal(body.found, true);
  assert.equal(body.source, 'model');
  assert.match(body.entry.id, /^modele:/);
  assert.deepEqual(body.entry.priorities, valid.priorities);
});

test('le formatage du modèle est nettoyé avant affichage', async () => {
  const body = await (await handlerFor({ ...valid, why: `**${valid.why}**` }).GET(request('nom hors liste'))).json();
  assert.equal(body.entry.why, valid.why);
});

test('les résultats inconnus, invalides ou incompatibles sont rejetés sans correction silencieuse', async () => {
  for (const parsed of [
    null, {}, { ...valid, known: false }, { ...valid, heightCm: 250 },
    { ...valid, position: 'G' }, { ...valid, archetype: 'inventé' },
    { ...valid, priorities: ['vista', 'passesCourtes', 'controle', 'vista'] },
    { ...valid, priorities: [...valid.priorities.slice(0, 3), 'plongeon'] },
  ]) {
    assert.deepEqual(await (await handlerFor(parsed).GET(request('nom hors liste'))).json(),
      { found: false, reason: 'unknown' });
  }
  const shape = lookupSchema.parse(valid);
  assert.equal(validateLookup({ ...shape, priorities: [...shape.priorities.slice(0, 3), shape.priorities[0]] }), null);
});

test('une panne fournisseur ne divulgue aucun diagnostic au navigateur', async () => {
  const handler = createLookalikeHandler({ hasKey: () => true, call: async () => { throw new StaffUnavailable('test panne'); } });
  const response = await handler.GET(request('nom hors liste'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { found: false, reason: 'failed' });
});

test('le helper partagé masque la clé dans les erreurs réseau et HTTP', async () => {
  const apiKey = 'secret-lookup-test';
  for (const fetchImpl of [
    async () => { throw new Error(`erreur ${apiKey}`); },
    async () => new Response(apiKey, { status: 429 }),
  ]) {
    await assert.rejects(mistralJson({ system: '', user: '', schema: {}, schemaName: 'test', apiKey, fetchImpl }),
      (error: unknown) => error instanceof StaffUnavailable && !error.message.includes(apiKey));
  }
});

test('un poste hors ligne est rapproché au lieu d’être refusé', async () => {
  const { reconcilePosition } = await import('../shared/lookalike-lookup.js');
  // Cas réel : le modèle décrit Olise en « milieu gauche » avec un archétype d'ailier.
  assert.equal(reconcilePosition('MG', 'spark'), 'AG');
  assert.equal(reconcilePosition('MD', 'spark'), 'AD');
  assert.equal(reconcilePosition('MOC', 'magician'), 'AT');
  assert.equal(reconcilePosition('AG', 'creator'), 'MG');
  // Déjà cohérent : on n'y touche pas.
  assert.equal(reconcilePosition('BU', 'finisher'), 'BU');
  assert.equal(reconcilePosition('MC', 'maestro'), 'MC');
  // Aucun voisin plausible : on refuse plutôt que d'inventer.
  assert.equal(reconcilePosition('G', 'finisher'), null);
  assert.equal(reconcilePosition('BU', 'boss'), null);
  assert.equal(reconcilePosition('MC', 'spark'), null);
});

test('une prose trop longue est raccourcie proprement, pas rejetée', async () => {
  const { shorten } = await import('../shared/lookalike-lookup.js');
  const deux = 'Première phrase complète et lisible. Seconde phrase qui déborde largement du plafond fixé.';
  const coupe = shorten(deux, 45);
  assert.equal(coupe, 'Première phrase complète et lisible.', 'on coupe à la fin de phrase');
  assert.ok(!coupe.endsWith('…'));
  // Sans fin de phrase exploitable, on coupe au mot et on le signale.
  const long = shorten('un mot '.repeat(40), 30);
  assert.ok(long.length <= 31 && long.endsWith('…'), long);
  assert.ok(!long.endsWith(' …'));
  // Sous le plafond, rien ne change.
  assert.equal(shorten('Court et net.', 100), 'Court et net.');
  // Le formatage est retiré au passage.
  assert.equal(shorten('Un **gras** ici.', 100), 'Un gras ici.');
});
