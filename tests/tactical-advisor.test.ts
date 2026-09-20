import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PositionRole } from '../shared/fc27.js';
import type { PlayerProfile } from '../shared/fc27-player.js';
import { analyzeSquad } from '../shared/tacticalAdvisor.js';

let next = 0;
function player(primaryPosition: PositionRole, archetype: string, overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  next += 1;
  return {
    id: String(next), pseudo: `joueur${next}`, kitName: `J${next}`, kitNumber: next, primaryPosition, preferredFoot: 'Droit',
    heightCm: 180, weightKg: 75, archetype, weakFootStars: 3, skillMovesStars: 3, ...overrides,
  };
}

const balancedSquad = () => [
  player('G', 'sweeper-keeper', { kitName: 'MURAILLE' }),
  player('DC', 'boss', { kitName: 'ROC', heightCm: 191 }),
  player('DC', 'progressor', { kitName: 'LIBÉRO' }),
  player('DG', 'marauder', { kitName: 'FUSÉE', preferredFoot: 'Gauche' }),
  player('DD', 'boss', { kitName: 'VERROU' }),
  player('MDC', 'disruptor', { kitName: 'BOUCLIER' }),
  player('MC', 'recycler', { kitName: 'MOTEUR' }),
  player('MOC', 'creator', { kitName: 'MAESTRO' }),
  player('AG', 'spark', { kitName: 'ÉCLAIR', skillMovesStars: 5 }),
  player('AD', 'spark', { kitName: 'COMPAS' }),
  player('BU', 'target', { kitName: 'TOUR', heightCm: 193 }),
];

test('empty squad: zero synergy, invitation instead of deficits, no tips', () => {
  const analysis = analyzeSquad([]);
  assert.equal(analysis.synergyScore, 0);
  assert.equal(analysis.squadDeficits.length, 1);
  assert.equal(analysis.playerTips.length, 0);
  assert.equal(analysis.playstyleIdentity.recommendedFormation, '4-3-3');
});

test('a complete, complementary squad scores high with few deficits and one tip per player', () => {
  const squad = balancedSquad();
  const analysis = analyzeSquad(squad);
  assert.ok(analysis.synergyScore >= 85, `score ${analysis.synergyScore}`);
  assert.deepEqual(analysis.squadDeficits, []);
  assert.equal(analysis.playerTips.length, squad.length);
  assert.ok(analysis.playerTips.every((tip) => tip.roleAdvice.length > 20));
  const tour = analysis.playerTips.find((tip) => tip.playerName === 'TOUR')!;
  assert.match(tour.roleAdvice, /MAESTRO/, 'Le buteur est orienté vers le créateur de l’équipe.');
  assert.match(analysis.playerTips.find((tip) => tip.playerName === 'COMPAS')!.roleAdvice, /TOUR/, 'L’ailier centreur cherche le pivot.');
});

test('solo strikers are diagnosed, but a keeper and a defence are never demanded', () => {
  const strikers = [
    player('BU', 'finisher', { }),
    player('BU', 'finisher', { }),
    player('BU', 'target', { }),
    player('AG', 'spark', { }),
  ];
  const analysis = analyzeSquad(strikers);
  const text = analysis.squadDeficits.join('\n');
  for (const expected of [/sentinelle|récupérateur/i, /créateur/i, /3 joueurs en BU/, /Couloir droit vide/, /profil défensif/i]) {
    assert.match(text, expected);
  }
  // Le club laisse ces lignes à l'IA : les réclamer serait un contresens.
  assert.doesNotMatch(text, /gardien/i, 'le gardien est tenu par l’IA, ce n’est pas un manque');
  assert.doesNotMatch(text, /défenseur central/i, 'la défense est tenue par l’IA, ce n’est pas un manque');
  // Un couloir vide ne se formule plus avec des postes que personne n'occupera.
  assert.doesNotMatch(text, /ni DG|ni DD/);
});

test('a declared secondary position softens an overloaded post and suggests a backup', () => {
  const rigid = analyzeSquad([player('BU', 'finisher'), player('BU', 'target'), player('BU', 'finisher')]);
  // Poste secondaire pris parmi ceux que le club pourvoit : le gardien ne dirait plus rien.
  const flexible = analyzeSquad([player('BU', 'finisher'), player('BU', 'target'), player('BU', 'finisher', { secondaryPosition: 'MOC', kitName: 'POLYVALENT' })]);
  assert.ok(flexible.synergyScore > rigid.synergyScore);
  assert.ok(rigid.squadDeficits.some((d) => /3 joueurs en BU/.test(d)));
  assert.ok(!flexible.squadDeficits.some((d) => /joueurs en BU/.test(d)));
  assert.ok(flexible.squadDeficits.some((d) => /POLYVALENT peut dépanner/.test(d)));
});

test('formation and identity follow the declared positions and profiles', () => {
  const diamond = analyzeSquad([
    player('G', 'shot-stopper'), player('DC', 'boss'), player('DC', 'progressor'), player('DG', 'boss'), player('DD', 'boss'),
    player('MDC', 'disruptor'), player('MC', 'maestro'), player('MC', 'maestro'), player('MOC', 'creator'),
    player('BU', 'finisher'), player('BU', 'finisher'),
  ]);
  assert.equal(diamond.playstyleIdentity.recommendedFormation, '4-1-2-1-2 (losange)');
  assert.equal(diamond.playstyleIdentity.title, 'Possession & circulation rapide');

  const falseNine = analyzeSquad([player('AG', 'spark'), player('AT', 'magician'), player('AD', 'spark'), player('MC', 'recycler'), player('MDC', 'recycler')]);
  assert.equal(falseNine.playstyleIdentity.recommendedFormation, '4-3-3 Faux 9');

  const direct = analyzeSquad([player('BU', 'target', { heightCm: 195 }), player('MG', 'disruptor'), player('MD', 'recycler'), player('DC', 'boss', { heightCm: 192 })]);
  assert.match(direct.playstyleIdentity.title, /pivot|couloirs/i);
});

test('the analysis is deterministic', () => {
  const squad = balancedSquad();
  assert.deepEqual(analyzeSquad(squad), analyzeSquad(squad));
});
