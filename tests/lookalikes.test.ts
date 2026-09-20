import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARCHETYPES, ATTRIBUTES, LINE_OF_POSITION, MORPHOLOGY, archetypeById, attributesForLine } from '../shared/data/archetypes.js';
import { LOOKALIKES, lookalikeById, lookalikesForArchetype, searchLookalikes } from '../shared/data/lookalikes.js';
import { FEET, POSITION_CODES } from '../shared/fc27.js';

test('chaque joueur est cohérent avec le catalogue d’archétypes', () => {
  for (const entry of LOOKALIKES) {
    const archetype = archetypeById(entry.archetype);
    assert.ok(archetype, `${entry.name} : archétype « ${entry.archetype} » inconnu`);
    assert.ok(POSITION_CODES.includes(entry.position), `${entry.name} : poste inconnu`);
    // Le tunnel ne proposerait pas cet archétype à ce poste : la préremplissage serait invalide.
    assert.equal(archetype.line, LINE_OF_POSITION[entry.position],
      `${entry.name} : ${archetype.name} n'est pas sélectionnable en ${entry.position}`);
    assert.ok(FEET.includes(entry.foot), `${entry.name} : pied invalide`);
  }
});

test('les gabarits tiennent dans les bornes du formulaire', () => {
  for (const entry of LOOKALIKES) {
    assert.ok(entry.heightCm >= MORPHOLOGY.heightCm.min && entry.heightCm <= MORPHOLOGY.heightCm.max,
      `${entry.name} : ${entry.heightCm} cm hors des bornes du curseur`);
  }
});

test('les priorités sont des attributs réels, sans doublon, disponibles à la ligne du poste', () => {
  for (const entry of LOOKALIKES) {
    assert.ok(entry.priorities.length >= 3 && entry.priorities.length <= 5, `${entry.name} : ${entry.priorities.length} priorités`);
    assert.equal(new Set(entry.priorities).size, entry.priorities.length, `${entry.name} : priorité en double`);
    const pool = new Set(attributesForLine(LINE_OF_POSITION[entry.position]));
    for (const key of entry.priorities) {
      assert.ok(key in ATTRIBUTES, `${entry.name} : attribut « ${key} » inconnu`);
      assert.ok(pool.has(key), `${entry.name} : « ${ATTRIBUTES[key].label} » n'est pas proposable en ${entry.position}`);
    }
  }
});

test('les identifiants sont uniques et les textes remplis', () => {
  const ids = LOOKALIKES.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length, 'deux joueurs partagent un identifiant');
  for (const entry of LOOKALIKES) {
    for (const [field, value] of Object.entries({ name: entry.name, era: entry.era, signature: entry.signature, why: entry.why })) {
      assert.ok(value.trim().length > 3, `${entry.id} : ${field} vide ou trop court`);
    }
    assert.ok(lookalikeById(entry.id) === entry);
  }
});

test('les textes ne contiennent que des caractères latins', () => {
  // Un caractère d'un autre alphabet glissé dans une phrase passerait inaperçu à la relecture.
  for (const entry of LOOKALIKES) {
    const text = [entry.name, entry.signature, entry.why, entry.era].join(' ');
    const strange = [...text].filter((c) => /[^\u0000-\u024F\u2000-\u206F\u20A0-\u20CF]/.test(c));
    assert.deepEqual(strange, [], `${entry.id} : caractères inattendus ${JSON.stringify(strange)}`);
  }
});

test('les 13 archétypes ont au moins un joueur de référence', () => {
  for (const archetype of ARCHETYPES) {
    assert.ok(lookalikesForArchetype(archetype.id).length > 0, `${archetype.name} n'a aucun joueur de référence`);
  }
});

test('la recherche tolère accents, casse et surnoms', () => {
  const byId = (q: string) => searchLookalikes(q).map((e) => e.id);
  assert.ok(byId('zidane').includes('zidane'));
  assert.ok(byId('ZIZOU').includes('zidane'), 'le surnom doit fonctionner');
  assert.ok(byId('özil').includes('ozil'));
  assert.ok(byId('ozil').includes('ozil'), 'la recherche sans accent doit trouver le nom accentué');
  assert.ok(byId('kante').includes('kante'));
  assert.ok(byId('kanté').includes('kante'));
  assert.ok(byId('de bruyne').includes('de-bruyne'));
  assert.ok(byId('kdb').includes('de-bruyne'));
});

test('une recherche trop courte ou sans résultat ne renvoie rien', () => {
  assert.deepEqual(searchLookalikes('z'), []);
  assert.deepEqual(searchLookalikes(''), []);
  assert.deepEqual(searchLookalikes('joueurinexistant'), []);
});

test('la recherche remonte d’abord la correspondance la plus proche', () => {
  const first = searchLookalikes('ronaldo')[0];
  assert.ok(['ronaldo-r9', 'cr7', 'ronaldinho'].includes(first.id), `premier résultat inattendu : ${first.id}`);
  assert.ok(searchLookalikes('ronaldo').length >= 2, 'les homonymes doivent tous ressortir');
});

test('l’époque renvoyée par le modèle est normalisée, pas rejetée', async () => {
  const { lookupSchema } = await import('../shared/lookalike-lookup.js');
  const base = {
    name: 'Franck Ribéry', position: 'AG', archetype: 'spark', heightCm: 170, foot: 'Droit',
    signature: 'Débordement et crochets sur le côté gauche, centres rentrants.',
    why: 'Spark pour la percussion en un-contre-un dans le couloir.',
    priorities: ['dribbles', 'acceleration', 'centres'], known: true,
  };
  const cases: [string, string][] = [
    ['1999-2018 (Bayern Munich, Marseille)', '1999-2018'],
    ['2004 – 2022, essentiellement au Bayern', '2004-2022'],
    ['depuis 2016', '2016-'],
    ['1985-1993', '1985-1993'],
  ];
  for (const [given, expected] of cases) {
    const parsed = lookupSchema.safeParse({ ...base, era: given });
    assert.ok(parsed.success, `« ${given} » a été rejeté au lieu d’être normalisé`);
    assert.equal(parsed.data.era, expected);
  }
});

test('une sortie de modèle incohérente est écartée', async () => {
  const { lookupSchema, validateLookup } = await import('../shared/lookalike-lookup.js');
  const base = {
    name: 'Joueur', era: '2000-2010', heightCm: 180, foot: 'Droit',
    signature: 'Une signature assez longue pour passer la borne basse du schéma.',
    why: 'Une explication assez longue pour passer la borne basse du schéma.',
    known: true,
  };
  // Archétype d'attaque à un poste de milieu : le tunnel ne le proposerait jamais.
  const horsLigne = lookupSchema.parse({ ...base, position: 'MC', archetype: 'finisher', priorities: ['passesCourtes', 'controle', 'vista'] });
  assert.equal(validateLookup(horsLigne), null);
  // Attribut de gardien pour un joueur de champ.
  const horsPool = lookupSchema.parse({ ...base, position: 'BU', archetype: 'finisher', priorities: ['finition', 'calme', 'reflexes'] });
  assert.equal(validateLookup(horsPool), null);
  // Le modèle lui-même n'est pas sûr.
  const incertain = lookupSchema.parse({ ...base, position: 'BU', archetype: 'finisher', priorities: ['finition', 'calme', 'acceleration'], known: false });
  assert.equal(validateLookup(incertain), null);
  // Cas valide, pour prouver que le test ne passe pas par accident.
  const bon = lookupSchema.parse({ ...base, position: 'BU', archetype: 'finisher', priorities: ['finition', 'calme', 'acceleration'] });
  assert.ok(validateLookup(bon));
});
