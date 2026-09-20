import { POSITION_LABELS, type PositionRole } from './fc27.js';
import { traitsOf, type PlayerProfile, type TacticalAnalysis, type Trait } from './fc27-player.js';

// Moteur d'analyse tactique : règles explicites et déterministes, sans aléatoire.
// Entrée : les cartes de l'effectif. Sortie : synergie /100, identité de jeu, manques, conseils.

import { archetypeById, LINE_OF_POSITION as LINE } from './data/archetypes.js';
import { isAiLine } from './data/club-policy.js';

/** Le club ne pourvoit pas ces lignes : leur absence n'est ni un manque ni une pénalité. */
const AI_GK = isAiLine('G');
const AI_DEF = isAiLine('DEF');
const LEFT: PositionRole[] = ['DG', 'MG', 'AG'];
const RIGHT: PositionRole[] = ['DD', 'MD', 'AD'];
const WIDE: PositionRole[] = [...LEFT, ...RIGHT];
const STRIKERS: PositionRole[] = ['BU', 'AT'];
const WINGERS: PositionRole[] = ['AG', 'AD'];

interface Player {
  profile: PlayerProfile;
  name: string;
  role: PositionRole;
  secondary?: PositionRole;
  traits: Set<Trait>;
}

const has = (p: Player, ...traits: Trait[]) => traits.some((t) => p.traits.has(t));
const names = (players: Player[]) => players.map((p) => p.name).join(', ');

function enrich(profiles: PlayerProfile[]): Player[] {
  return profiles.map((profile) => ({
    profile,
    name: profile.kitName.trim() || profile.pseudo.trim() || profile.pseudo,
    role: profile.primaryPosition,
    secondary: profile.secondaryPosition,
    traits: traitsOf(profile),
  }));
}

/** Rôles collectifs utilisés par le score, les manques et les conseils. */
function squadRoles(players: Player[]) {
  const at = (...roles: PositionRole[]) => players.filter((p) => roles.includes(p.role));
  const goalkeepers = at('G');
  const centreBacks = at('DC');
  const defensiveMids = at('MDC');
  const workers = players.filter((p) => p.role === 'MDC' || (p.role === 'MC' && has(p, 'engine', 'ballWinner', 'pressing', 'anchor')));
  const creators = players.filter((p) => p.role === 'MOC' || (LINE[p.role] !== 'G' && has(p, 'creator')));
  const finishers = players.filter((p) => p.role === 'BU' || (STRIKERS.includes(p.role) && has(p, 'finisher')));
  const aerialStrikers = players.filter((p) => STRIKERS.includes(p.role) && has(p, 'aerial', 'holdUp'));
  const wide = players.filter((p) => WIDE.includes(p.role) || (LINE[p.role] !== 'G' && has(p, 'width', 'crossing')));
  const ballWinners = players.filter((p) => p.role === 'MDC' || ((LINE[p.role] === 'DEF' || LINE[p.role] === 'MIL') && has(p, 'ballWinner')));
  const builders = players.filter((p) => has(p, 'buildUp', 'longPass'));
  const runners = players.filter((p) => (LINE[p.role] === 'ATT' || p.role === 'MOC') && has(p, 'pace', 'runner'));
  const aerialDefenders = centreBacks.filter((p) => has(p, 'aerial'));
  return {
    at, goalkeepers, centreBacks, defensiveMids, workers, creators, finishers, aerialStrikers, wide, ballWinners, builders, runners, aerialDefenders,
    left: players.filter((p) => LEFT.includes(p.role)),
    right: players.filter((p) => RIGHT.includes(p.role)),
  };
}
type Roles = ReturnType<typeof squadRoles>;

/** Titulaires qu'une formation courante aligne à chaque poste (deux DC, deux BU en 4-4-2…). */
const CAPACITY: Record<PositionRole, number> = {
  G: 1, DC: 2, DG: 1, DD: 1, MDC: 2, MC: 2, MOC: 1, MG: 1, MD: 1, AG: 1, AD: 1, BU: 2, AT: 1,
};

/** Postes surchargés au-delà de leur capacité, et nombre de joueurs en trop sans poste de repli. */
function duplicates(players: Player[]) {
  const byRole = new Map<PositionRole, Player[]>();
  for (const p of players) byRole.set(p.role, [...(byRole.get(p.role) ?? []), p]);
  return [...byRole.entries()]
    .filter(([role, group]) => group.length > CAPACITY[role])
    .map(([role, group]) => {
      const flexible = group.filter((p) => p.secondary && p.secondary !== role).length;
      return { role, group, rigidExtras: Math.max(0, group.length - CAPACITY[role] - flexible) };
    });
}

// ---------------------------------------------------------------- Score de synergie

function synergyScore(players: Player[], r: Roles): number {
  if (players.length === 0) return 0;

  // 1. Structure des lignes (40 pts)
  // Les postes tenus par l'IA ne rapportent ni ne coûtent : leurs points sont redistribués
  // sur les lignes que le club pourvoit vraiment, pour que 100 reste atteignable.
  let structure = 0;
  const freed = (AI_GK ? 8 : 0) + (AI_DEF ? 10 : 0);
  const widthBonus = freed - Math.round(freed * 0.4) - Math.round(freed * 0.3);
  if (!AI_GK && r.goalkeepers.length > 0) structure += 8;
  if (!AI_DEF) structure += Math.min(r.centreBacks.length, 2) * 5;
  // Un défenseur qui rejoint quand même le club reste un vrai apport.
  else if (r.centreBacks.length > 0) structure += 4;

  if (r.defensiveMids.length > 0) structure += 10 + Math.round(freed * 0.4);
  else if (r.workers.length > 0) structure += 8 + Math.round(freed * 0.3);
  else if (r.at('MC').length > 0) structure += 4;
  if (r.at('BU', 'AT', 'MOC').length > 0) structure += 8 + Math.round(freed * 0.3);
  structure += (r.left.length > 0 ? 2 + Math.floor(widthBonus / 2) : 0)
    + (r.right.length > 0 ? 2 + Math.ceil(widthBonus / 2) : 0);
  structure = Math.min(structure, 40);

  // 2. Complémentarité des profils (35 pts)
  const distinct = (a: Player[], b: Player[]) => a.some((x) => b.some((y) => y !== x));
  let complementarity = 0;
  if (distinct(r.finishers, r.creators)) complementarity += 10;
  if (distinct(r.runners, [...r.builders, ...r.creators])) complementarity += 7;
  if (distinct(r.wide.filter((p) => has(p, 'width', 'crossing') || WIDE.includes(p.role)), r.aerialStrikers)) complementarity += 6;
  if (distinct(r.ballWinners, r.builders)) complementarity += 6;
  if (AI_GK || AI_DEF) {
    // À la place du duo gardien/défenseur aérien : un milieu capable de relancer proprement.
    if (distinct(r.workers, r.builders) || r.builders.length > 0) complementarity += 6;
  } else if (r.goalkeepers.length > 0 && (r.aerialDefenders.length > 0 || r.goalkeepers.some((g) => has(g, 'sweeper')))) {
    complementarity += 6;
  }
  complementarity = Math.min(complementarity, 35);

  // 3. Équilibre et profondeur (25 pts, pénalités)
  let balance = 25;
  for (const d of duplicates(players)) balance -= 4 * d.rigidExtras;
  const soloists = players.filter((p) => LINE[p.role] === 'ATT' && has(p, 'finisher', 'dribble'));
  if (soloists.length >= 2 && r.creators.length === 0) balance -= 8;
  const attacking = players.filter((p) => LINE[p.role] === 'ATT' || p.role === 'MOC').length;
  const defending = players.filter((p) => LINE[p.role] === 'DEF' || p.role === 'MDC').length;
  // Sans ligne défensive à pourvoir, un effectif tourné vers l'avant est la norme voulue :
  // seul le manque de relais devant la défense IA compte encore.
  if (AI_DEF) { if (attacking >= 4 && r.workers.length === 0) balance -= 6; }
  else if (attacking - defending >= 3) balance -= 6;
  balance = Math.max(0, balance);

  return Math.max(0, Math.min(100, Math.round(structure + complementarity + balance)));
}

// ---------------------------------------------------------------- Manques

function squadDeficits(players: Player[], r: Roles): string[] {
  if (players.length === 0) return ['Aucune fiche pour le moment : le diagnostic apparaîtra avec les premiers joueurs.'];
  const deficits: string[] = [];
  const covering = (role: PositionRole) => players.filter((p) => p.secondary === role);

  if (!AI_GK && r.goalkeepers.length === 0) {
    const backups = covering('G');
    deficits.push(backups.length
      ? `Pas de gardien titulaire : ${names(backups)} peut dépanner, mais un gardien fixe sécurise tout le bloc.`
      : 'Aucun gardien fixe : sans gardien humain, c’est l’IA qui garde nos buts.');
  }
  if (!AI_DEF) {
    if (r.centreBacks.length === 0) {
      const backups = covering('DC');
      deficits.push(`Aucun défenseur central : l’axe défensif est la priorité${backups.length ? ` (${names(backups)} peut dépanner)` : ''}.`);
    } else if (r.centreBacks.length === 1) {
      deficits.push(`Un seul défenseur central (${r.centreBacks[0].name}) : il lui faut un partenaire dans l’axe.`);
    }
  }
  if (r.workers.length === 0) {
    deficits.push(AI_DEF
      ? 'Personne devant la défense IA : un MDC ou une sentinelle éviterait qu’elle soit attaquée en direct.'
      : 'Manque d’un milieu récupérateur (MDC ou sentinelle) pour protéger la défense.');
  }
  if (r.creators.length === 0) {
    const backups = covering('MOC');
    deficits.push(`Aucun créateur : personne pour orienter le jeu (MOC, meneur de jeu, PlayStyles de passe)${backups.length ? ` — ${names(backups)} peut dépanner` : ''}.`);
  }
  if (r.finishers.length === 0) {
    const backups = [...covering('BU'), ...covering('AT')];
    deficits.push(`Pas de finisseur attitré en pointe (BU ou AT)${backups.length ? ` — ${names(backups)} peut dépanner` : ''}.`);
  }
  // Les couloirs ne se lisent que sur les postes que le club pourvoit.
  const leftNames = AI_DEF ? 'ni MG, ni AG' : 'ni DG, ni MG, ni AG';
  const rightNames = AI_DEF ? 'ni MD, ni AD' : 'ni DD, ni MD, ni AD';
  const wingBackups = (...roles: PositionRole[]) => {
    const found = roles.flatMap((role) => covering(role));
    return found.length ? ` — ${names([...new Set(found)])} peut dépanner` : '';
  };
  if (r.left.length === 0 && r.right.length === 0) deficits.push('Manque de largeur : aucun joueur de couloir déclaré.');
  else if (r.left.length === 0) deficits.push(`Couloir gauche vide : ${leftNames}${wingBackups('MG', 'AG', 'DG')}.`);
  else if (r.right.length === 0) deficits.push(`Couloir droit vide : ${rightNames}${wingBackups('MD', 'AD', 'DD')}.`);
  if (!AI_DEF && r.centreBacks.length > 0 && r.aerialDefenders.length === 0) {
    deficits.push('Aucun profil aérien en défense : les centres adverses feront mal.');
  }
  if (players.length >= 3 && !players.some((p) => has(p, 'defensive', 'ballWinner'))) {
    deficits.push('Aucun profil défensif (Interception, Anticipation, Tacle glissé…) dans l’effectif.');
  }
  for (const d of duplicates(players)) {
    if (d.rigidExtras > 0) {
      deficits.push(`${d.group.length} joueurs en ${d.role} (${POSITION_LABELS[d.role].toLowerCase()}) sans poste secondaire : prévoir une rotation ou un repositionnement.`);
    }
  }
  if (players.length >= 5 && !players.some((p) => p.profile.preferredFoot === 'Gauche')) {
    deficits.push('Aucun gaucher : le couloir gauche manquera d’angles naturels.');
  }
  return deficits;
}

// ---------------------------------------------------------------- Formation recommandée

const FORMATIONS: { name: string; slots: PositionRole[] }[] = [
  { name: '4-3-3', slots: ['G', 'DG', 'DC', 'DC', 'DD', 'MDC', 'MC', 'MC', 'AG', 'BU', 'AD'] },
  { name: '4-2-3-1', slots: ['G', 'DG', 'DC', 'DC', 'DD', 'MDC', 'MDC', 'MG', 'MOC', 'MD', 'BU'] },
  { name: '4-4-2', slots: ['G', 'DG', 'DC', 'DC', 'DD', 'MG', 'MC', 'MC', 'MD', 'BU', 'BU'] },
  { name: '4-1-2-1-2 (losange)', slots: ['G', 'DG', 'DC', 'DC', 'DD', 'MDC', 'MC', 'MC', 'MOC', 'BU', 'BU'] },
  { name: '3-5-2', slots: ['G', 'DC', 'DC', 'DC', 'MG', 'MDC', 'MC', 'MD', 'MOC', 'BU', 'BU'] },
  { name: '4-3-3 Faux 9', slots: ['G', 'DG', 'DC', 'DC', 'DD', 'MDC', 'MC', 'MC', 'AG', 'AT', 'AD'] },
];
/** Rôles qui peuvent occuper un créneau sans être à contre-emploi. */
const COMPATIBLE: Record<PositionRole, PositionRole[]> = {
  G: ['G'], DC: ['DC'], DG: ['DG', 'MG'], DD: ['DD', 'MD'], MDC: ['MDC', 'MC'], MC: ['MC', 'MDC', 'MOC'],
  MOC: ['MOC', 'MC', 'AT'], MG: ['MG', 'AG', 'DG'], MD: ['MD', 'AD', 'DD'], AG: ['AG', 'MG'], AD: ['AD', 'MD'],
  BU: ['BU', 'AT'], AT: ['AT', 'BU', 'MOC'],
};

function slotValue(player: Player, slot: PositionRole) {
  if (player.role === slot) return 3;
  if (COMPATIBLE[slot].includes(player.role)) return 2;
  if (player.secondary === slot) return 2;
  if (player.secondary && COMPATIBLE[slot].includes(player.secondary)) return 1;
  return 0;
}

/** Placement glouton des joueurs dans les créneaux, meilleures correspondances d'abord. */
function formationFit(players: Player[], allSlots: PositionRole[]) {
  // Les créneaux tenus par l'IA sont identiques d'une formation à l'autre : les comparer
  // n'apprend rien, et ils écraseraient le peu de postes humains sous leur nombre.
  const slots = allSlots.filter((slot) => !isAiLine(LINE[slot]) || players.some((p) => p.role === slot));
  const pairs = players.flatMap((p, pi) => slots.map((slot, si) => ({ pi, si, value: slotValue(p, slot) })))
    .filter((x) => x.value > 0)
    .sort((a, b) => b.value - a.value || a.si - b.si || a.pi - b.pi);
  const usedPlayers = new Set<number>();
  const usedSlots = new Set<number>();
  let total = 0;
  for (const { pi, si, value } of pairs) {
    if (usedPlayers.has(pi) || usedSlots.has(si)) continue;
    usedPlayers.add(pi); usedSlots.add(si); total += value;
  }
  // Un attaquant de soutien créateur donne tout son sens au faux 9.
  if (slots.includes('AT') && players.some((p) => p.role === 'AT' && has(p, 'creator'))) total += 1;
  return total + usedSlots.size * 0.5;
}

function recommendedFormation(players: Player[]) {
  let best = FORMATIONS[0];
  let bestFit = -1;
  for (const formation of FORMATIONS) {
    const fit = formationFit(players, formation.slots);
    if (fit > bestFit) { best = formation; bestFit = fit; }
  }
  return best.name;
}

// ---------------------------------------------------------------- Identité de jeu

function playstyleIdentity(players: Player[], r: Roles): TacticalAnalysis['playstyleIdentity'] {
  const recommended = recommendedFormation(players);
  if (players.length === 0) {
    return {
      title: 'Identité à construire',
      description: 'Crée les premières fiches : le style de jeu se dessinera à partir des postes et des profils déclarés.',
      recommendedFormation: recommended,
    };
  }
  const count = (...traits: Trait[]) => players.filter((p) => has(p, ...traits)).length;
  const first = (list: Player[]) => list[0]?.name;
  const pivots = r.aerialStrikers;
  const candidates = [
    {
      score: count('creator') * 2 + count('buildUp') + (r.creators.length >= 2 ? 3 : 0),
      title: 'Possession & circulation rapide',
      description: `Garder le ballon, faire tourner et trouver l’intervalle. La construction passe par ${names([...r.creators, ...r.builders].filter((p, i, a) => a.indexOf(p) === i).slice(0, 3)) || 'nos milieux'}.`,
    },
    {
      score: (count('pace') + count('runner')) * 1.3 + (r.builders.length ? 2 : 0) + (r.ballWinners.length ? 1 : 0),
      title: 'Transitions rapides & contre-attaque',
      description: `Récupérer bas, puis frapper vite dans l’espace. ${first(r.runners) ?? 'Nos attaquants'} attaque la profondeur dès que ${first(r.builders.filter((p) => p.role !== 'G')) ?? first(r.creators) ?? 'le porteur'} lève la tête.`,
    },
    {
      score: (count('engine') + count('pressing')) * 1.2 + count('ballWinner') * 0.6,
      title: 'Pressing haut & récupération',
      description: `Étouffer l’adversaire dès sa relance. ${names(r.ballWinners.slice(0, 2)) || 'Le milieu'} mène la course au ballon, le bloc remonte ensemble.`,
    },
    {
      score: pivots.length ? count('aerial', 'holdUp') * 1.4 + count('width', 'crossing') * 0.5 + 2 : 0,
      title: 'Jeu direct sur pivot',
      description: `Allonger vers ${first(pivots)}, jouer les remises et suivre les seconds ballons.`,
    },
    {
      score: r.wide.length >= 2 ? count('width', 'crossing') * 1.2 + (pivots.length ? 2 : 0) : 0,
      title: 'Jeu de couloirs & centres',
      description: `Écarter le jeu pour ${names(r.wide.slice(0, 2))}, puis attaquer la surface${pivots.length ? ` où ${first(pivots)} fait la différence` : ''}.`,
    },
    {
      score: count('dribble') * 1.2,
      title: 'Percussion & un-contre-un',
      description: `Isoler nos dribbleurs (${names(players.filter((p) => has(p, 'dribble')).slice(0, 3))}) et provoquer pour créer le surnombre.`,
    },
  ];
  const best = candidates.reduce((a, b) => (b.score > a.score ? b : a));
  if (best.score < 2) {
    return {
      title: 'Bloc équilibré & transitions',
      description: 'Pas encore de dominante nette : rester compact, sécuriser la relance et accélérer sur les ballons récupérés.',
      recommendedFormation: recommended,
    };
  }
  return { title: best.title, description: best.description, recommendedFormation: recommended };
}

// ---------------------------------------------------------------- Conseils individuels

const BASE_ADVICE: Record<PositionRole, string> = {
  G: 'Commande ta défense, organise la ligne et relance vite dès la récupération.',
  DC: 'Tiens l’axe, gagne les duels et ne te laisse pas aspirer hors de ta zone.',
  DG: 'Monte quand le ballon est de ton côté, replace-toi dès la perte.',
  DD: 'Monte quand le ballon est de ton côté, replace-toi dès la perte.',
  MDC: 'Reste en sentinelle devant la défense pour compenser la montée des latéraux.',
  MC: 'Fais le lien entre les lignes, soutiens l’attaque puis replace-toi à la perte.',
  MOC: 'Libère la balle rapidement pour exploiter les appels des attaquants.',
  MG: 'Apporte la largeur et double le couloir avec ton latéral.',
  MD: 'Apporte la largeur et double le couloir avec ton latéral.',
  AG: 'Étire la défense sur ton aile et provoque en un-contre-un.',
  AD: 'Étire la défense sur ton aile et provoque en un-contre-un.',
  BU: 'Reste le plus haut possible et attaque la profondeur au bon moment.',
  AT: 'Décroche entre les lignes pour créer le surnombre au milieu.',
};

function contextAdvice(player: Player, players: Player[], r: Roles): string | undefined {
  const others = (list: Player[]) => list.filter((p) => p !== player);
  const creator = others(r.creators)[0];
  const pivot = others(r.aerialStrikers)[0];
  const sameSide = LEFT.includes(player.role) ? r.left : RIGHT.includes(player.role) ? r.right : [];

  if (player.role === 'G' && r.centreBacks.length === 0) return 'Sans défenseur central déclaré, joue court et protège ta surface.';
  if (STRIKERS.includes(player.role) && creator) return `Fais tes appels quand ${creator.name} lève la tête.`;
  if (player.role === 'MC' && r.defensiveMids.length === 0) return 'Sans sentinelle derrière toi, garde ta position quand les latéraux montent.';
  if ((player.role === 'DG' || player.role === 'DD') && others(sameSide).length === 0) return 'Personne devant toi sur ce côté : la largeur dépend de tes montées.';
  if (player.profile.skillMovesStars >= 4 && (LINE[player.role] === 'ATT' || player.role === 'MOC')) {
    return `Tes gestes techniques ${player.profile.skillMovesStars}★ sont une arme : provoque dans le dernier tiers.`;
  }
  if (WINGERS.includes(player.role) && pivot) return `Cherche ${pivot.name} dans la surface avec tes centres.`;
  if (player.role === 'MDC' && others(r.builders).length === 0 && has(player, 'buildUp')) return 'Tu es la seule rampe de lancement : propose-toi à chaque relance.';
  if (player.profile.weakFootStars <= 2 && (LINE[player.role] === 'ATT' || player.role === 'MOC')) {
    return 'Mauvais pied limité : oriente tes contrôles vers ton pied fort avant de frapper.';
  }
  if (players.length === 1) return 'Premier inscrit : invite le reste du vestiaire à créer sa fiche.';
  return undefined;
}

function playerTips(players: Player[], r: Roles): TacticalAnalysis['playerTips'] {
  return players.map((player) => {
    const archetype = archetypeById(player.profile.archetype);
    const base = archetype?.tacticalAdvice ?? BASE_ADVICE[player.role];
    const context = contextAdvice(player, players, r);
    return {
      playerId: player.profile.id,
      playerName: player.name,
      roleAdvice: [`${archetype?.name ?? POSITION_LABELS[player.role]} (${player.role}) : ${base.charAt(0).toLowerCase()}${base.slice(1)}`, context].filter(Boolean).join(' '),
    };
  });
}

// ---------------------------------------------------------------- Point d'entrée

export function analyzeSquad(profiles: PlayerProfile[]): TacticalAnalysis {
  const players = enrich(profiles);
  const roles = squadRoles(players);
  return {
    synergyScore: synergyScore(players, roles),
    playstyleIdentity: playstyleIdentity(players, roles),
    squadDeficits: squadDeficits(players, roles),
    playerTips: playerTips(players, roles),
  };
}
