import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ARCHETYPES, LINE_OF_POSITION, archetypesForPosition } from '../shared/data/archetypes.js';
import {
  POSITION_PROFILES, PROFILES_SOURCE, SKILL_TREES, profileForPosition, recommendedFor,
} from '../shared/data/position-profiles.js';
import { POSITION_CODES } from '../shared/fc27.js';

test('chaque poste a exactement un profil', () => {
  for (const position of POSITION_CODES) {
    const matches = POSITION_PROFILES.filter((profile) => profile.positions.includes(position));
    assert.equal(matches.length, 1, `Le poste ${position} doit avoir un seul profil, pas ${matches.length}.`);
  }
});

test('la répartition des points de départ tombe toujours sur le total annoncé', () => {
  for (const profile of POSITION_PROFILES) {
    const total = profile.spend.reduce((sum, entry) => sum + entry.points, 0);
    assert.equal(total, PROFILES_SOURCE.total, `${profile.title} répartit ${total} points au lieu de ${PROFILES_SOURCE.total}.`);
    assert.ok(profile.spend.every((entry) => entry.points > 0), `${profile.title} ne doit pas déclarer d'arbre à 0 point.`);
  }
});

test('les arbres de gardien ne servent qu’au gardien, et réciproquement', () => {
  for (const profile of POSITION_PROFILES) {
    const isKeeper = profile.positions.every((position) => LINE_OF_POSITION[position] === 'G');
    for (const { tree } of profile.spend) {
      const keeperTree = SKILL_TREES[tree].line === 'G';
      assert.equal(keeperTree, isKeeper, `${profile.title} utilise l'arbre « ${SKILL_TREES[tree].label} », qui n'est pas de sa ligne.`);
    }
  }
});

test('tout archétype conseillé est réellement sélectionnable au poste', () => {
  const known = new Set(ARCHETYPES.map((a) => a.id));
  for (const profile of POSITION_PROFILES) {
    for (const id of profile.recommended) {
      assert.ok(known.has(id), `« ${id} » n'est pas un archétype du catalogue (${profile.title}).`);
    }
    for (const position of profile.positions) {
      const available = new Set(archetypesForPosition(position).map((a) => a.id));
      const usable = profile.recommended.filter((id) => available.has(id));
      assert.ok(usable.length > 0, `Aucun archétype conseillé n'est disponible au poste ${position}.`);
      assert.deepEqual(recommendedFor(position), usable);
    }
  }
});

test('les gabarits conseillés tiennent dans les bornes du formulaire', async () => {
  const { MORPHOLOGY } = await import('../shared/data/archetypes.js');
  for (const profile of POSITION_PROFILES) {
    for (const option of profile.options) {
      assert.ok(option.heightCm.min >= MORPHOLOGY.heightCm.min && option.heightCm.max <= MORPHOLOGY.heightCm.max,
        `${profile.title} conseille une taille hors des bornes du curseur.`);
      assert.ok(option.weightKg.min >= MORPHOLOGY.weightKg.min && option.weightKg.max <= MORPHOLOGY.weightKg.max,
        `${profile.title} conseille un poids hors des bornes du curseur.`);
      assert.ok(option.heightCm.min < option.heightCm.max && option.weightKg.min < option.weightKg.max);
    }
  }
});

test('le gabarit par défaut de chaque archétype tombe dans une fourchette conseillée de ses postes idéaux', () => {
  for (const archetype of ARCHETYPES) {
    const profiles = archetype.idealPositions.map(profileForPosition).filter((p) => p !== undefined);
    const fits = profiles.some((profile) => profile.options.some((option) =>
      archetype.defaults.heightCm >= option.heightCm.min && archetype.defaults.heightCm <= option.heightCm.max
      && archetype.defaults.weightKg >= option.weightKg.min && archetype.defaults.weightKg <= option.weightKg.max));
    assert.ok(fits, `Le gabarit par défaut de ${archetype.name} ne correspond à aucune fourchette conseillée de ses postes idéaux.`);
  }
});
