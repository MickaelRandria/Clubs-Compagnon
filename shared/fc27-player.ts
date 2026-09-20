import { archetypeById, MORPHOLOGY } from './data/archetypes.js';
import type { FC27Player, Foot, PositionRole } from './fc27.js';

// Carte joueur FC 27 : types du tunnel de création et traits tactiques lus par tacticalAdvisor.ts.
// Les archétypes, la morphologie et le général de départ sont dans shared/data/archetypes.ts.

export type Stars = 1 | 2 | 3 | 4 | 5;

export interface PlayerProfile {
  id: string;
  // Étape 1 : identité
  pseudo: string;
  kitName: string;
  kitNumber: number;
  // Étape 2 : poste, archétype et morphologie
  primaryPosition: PositionRole;
  secondaryPosition?: PositionRole;
  archetype: string;
  preferredFoot: Foot;
  heightCm: number;
  weightKg: number;
  // Étape 3 : profil de jeu
  weakFootStars: Stars;
  skillMovesStars: Stars;
}

export interface TacticalAnalysis {
  synergyScore: number;
  playstyleIdentity: { title: string; description: string; recommendedFormation: string };
  squadDeficits: string[];
  playerTips: { playerId: string; playerName: string; roleAdvice: string }[];
}

/** Traits tactiques internes, déduits de l'archétype, du gabarit et des étoiles. */
export type Trait =
  | 'finisher' | 'creator' | 'buildUp' | 'longPass' | 'pace' | 'runner' | 'aerial' | 'holdUp'
  | 'ballWinner' | 'anchor' | 'engine' | 'pressing' | 'width' | 'crossing' | 'dribble'
  | 'defensive' | 'shotStopper' | 'sweeper';

export const LIMITS = {
  kitName: 30,
  kitNumber: { min: 1, max: 99 },
  heightCm: MORPHOLOGY.heightCm,
  weightKg: MORPHOLOGY.weightKg,
} as const;

export function traitsOf(profile: PlayerProfile): Set<Trait> {
  const traits = new Set<Trait>(archetypeById(profile.archetype)?.tacticalTraits ?? []);
  if (profile.heightCm >= 188) traits.add('aerial');
  if (profile.skillMovesStars >= 4) traits.add('dribble');
  return traits;
}

/** Convertit une ligne de l'API en carte. Les fiches incomplètes reçoivent des valeurs neutres. */
export function profileFromPlayer(player: FC27Player): PlayerProfile {
  const stars = (value: number | null): Stars => (value !== null && value >= 1 && value <= 5 ? value : 3) as Stars;
  return {
    id: String(player.id),
    pseudo: player.pseudo,
    kitName: player.in_game_name || player.pseudo,
    kitNumber: player.kit_number ?? 0,
    primaryPosition: player.primary_position,
    secondaryPosition: player.secondary_positions[0],
    archetype: player.archetype ?? '',
    preferredFoot: player.preferred_foot ?? 'Droit',
    heightCm: player.height_cm ?? 180,
    weightKg: player.weight_kg ?? 75,
    weakFootStars: stars(player.weak_foot),
    skillMovesStars: stars(player.skill_moves),
  };
}
