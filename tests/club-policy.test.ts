import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AI_LINES, HUMAN_POSITIONS, coveredByAi, isAiPosition } from '../shared/data/club-policy.js';
import type { PositionRole } from '../shared/fc27.js';
import type { PlayerProfile } from '../shared/fc27-player.js';
import { analyzeSquad } from '../shared/tacticalAdvisor.js';
import { POSITION_CODES } from '../shared/fc27.js';

let next = 0;
const player = (primaryPosition: PositionRole, archetype: string, over: Partial<PlayerProfile> = {}): PlayerProfile => {
  next += 1;
  return {
    id: String(next), pseudo: `j${next}`, kitName: `J${next}`, kitNumber: next, primaryPosition, preferredFoot: 'Droit',
    heightCm: 180, weightKg: 75, archetype, weakFootStars: 3, skillMovesStars: 3, ...over,
  };
};

const midAndFront = () => [
  player('BU', 'finisher'), player('AT', 'target'), player('AG', 'spark'), player('AD', 'magician'),
  player('MOC', 'creator'), player('MC', 'maestro'), player('MDC', 'disruptor'),
];

test('les postes de gardien et de défense sont déclarés tenus par l’IA', () => {
  assert.deepEqual(AI_LINES, ['G', 'DEF']);
  for (const position of ['G', 'DC', 'DG', 'DD'] as PositionRole[]) assert.ok(isAiPosition(position));
  for (const position of ['MDC', 'MC', 'MOC', 'MG', 'MD', 'AG', 'AD', 'BU', 'AT'] as PositionRole[]) {
    assert.ok(!isAiPosition(position), `${position} doit rester un poste humain`);
  }
  assert.equal(HUMAN_POSITIONS.length, POSITION_CODES.length - 4);
});

test('un poste tenu par l’IA redevient humain dès qu’un joueur l’occupe', () => {
  assert.equal(coveredByAi('DC', 0), true);
  assert.equal(coveredByAi('DC', 1), false, 'un défenseur qui arrive doit être compté comme les autres');
  assert.equal(coveredByAi('MC', 0), false);
});

test('un effectif milieu + attaque ne se voit reprocher ni gardien ni défense', () => {
  const text = analyzeSquad(midAndFront()).squadDeficits.join('\n');
  assert.doesNotMatch(text, /gardien/i);
  assert.doesNotMatch(text, /défenseur central/i);
  assert.doesNotMatch(text, /axe défensif/i);
});

test('un effectif milieu + attaque complet atteint un bon score', () => {
  const score = analyzeSquad(midAndFront()).synergyScore;
  // Avant la politique de club, les 18 points de structure défensive étaient perdus d'office.
  assert.ok(score >= 70, `score trop bas pour un effectif volontairement offensif : ${score}`);
  assert.ok(score <= 100);
});

test('100 reste atteignable sans gardien ni défenseur humain', () => {
  const squad = [
    player('BU', 'target'), player('AG', 'spark'), player('AD', 'magician'),
    player('MOC', 'creator'), player('MC', 'maestro'), player('MDC', 'disruptor'),
  ];
  assert.equal(analyzeSquad(squad).synergyScore, 100);
});

test('un défenseur qui rejoint le club est un apport, jamais une pénalité', () => {
  const sans = analyzeSquad(midAndFront()).synergyScore;
  const avec = analyzeSquad([...midAndFront(), player('DC', 'boss', { heightCm: 190 })]).synergyScore;
  assert.ok(avec >= sans, `l'arrivée d'un défenseur a fait baisser le score : ${sans} → ${avec}`);
});

test('le manque devant la défense IA est formulé pour ce contexte', () => {
  const sansSentinelle = [player('BU', 'finisher'), player('AG', 'spark'), player('AD', 'spark'), player('MOC', 'creator')];
  const text = analyzeSquad(sansSentinelle).squadDeficits.join('\n');
  assert.match(text, /défense IA/i, 'le manque doit nommer la défense IA, pas une défense humaine absente');
});

test('les couloirs ne citent plus des postes que personne n’occupera', () => {
  const text = analyzeSquad([player('BU', 'finisher'), player('AG', 'spark'), player('MC', 'maestro')]).squadDeficits.join('\n');
  assert.doesNotMatch(text, /ni DD|ni DG/);
});

test('la formation conseillée reste une formation réelle du jeu', () => {
  const formation = analyzeSquad(midAndFront()).playstyleIdentity.recommendedFormation;
  // L'IA occupe le bloc défensif quelle que soit la formation : on continue d'en nommer une vraie.
  assert.match(formation, /^\d/, `formation inattendue : ${formation}`);
});
