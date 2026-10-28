// Types échangés entre les fonctions /api et le front.

export type Position = 'FW' | 'MF' | 'DF' | 'GK';
export type MatchType = 'league' | 'playoff' | 'friendly';
export type MatchResult = 'win' | 'draw' | 'loss';

export interface Club {
  id: number;
  name: string;
  handle: string | null;
  region: string;
  reputation: string;
  skillRating: number;
  /** Écart avec le skill rating d'il y a 30 jours (null sans historique). */
  skillRatingTrend: number | null;
  bestDivision: number | null;
  gamesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  leagueApps: number;
  playoffApps: number;
  /** Séries en cours, calculées par EA. */
  winStreak: number;
  unbeatenStreak: number;
  promotions: number;
  relegations: number;
  /** Classement de la saison EA en cours (null tant qu'EA ne l'a pas renvoyé). */
  season: { rank: number | null; division: number | null; points: number | null } | null;
  /** Playoffs EA, de la saison la plus récente à la plus ancienne. */
  playoffHistory: { season: string; division: number | null; finish: string | null }[];
  stadium: string | null;
  /** Couleurs des maillots (#rrggbb), 4 par tenue. */
  kits: { home: string[]; away: string[]; third: string[] } | null;
}

export interface Member {
  id: number;
  gamertag: string;
  position: Position;
  ovr: number;
  matchesPlayed: number;
  goals: number;
  assists: number;
  avgRating: number | null;
  passPct: number | null;
  /** Le Pro créé dans EA (nom affiché, taille en cm). */
  proName: string | null;
  heightCm: number | null;
  winPct: number | null;
  motm: number;
  shotPct: number | null;
  tacklePct: number | null;
  redCards: number;
  /** Ses 10 derniers matchs au club, du plus ancien au plus récent (feuilles de match EA). */
  form: { matchId: number; goals: number; rating: number }[];
}

export interface Match {
  id: number;
  playedAt: string;
  type: MatchType;
  opponent: string;
  goalsFor: number;
  goalsAgainst: number;
  result: MatchResult;
  possessionPct: number | null;
  shots: number | null;
  /** L'adversaire a quitté le match. null : inconnu (match synchronisé avant le 28/10/2026). */
  opponentQuit: boolean | null;
}

/** Ligne de la feuille de match EA, pour un joueur du club. */
export interface MatchPlayer {
  gamertag: string;
  position: Position;
  rating: number;
  goals: number;
  assists: number;
  shots: number;
  passesMade: number;
  passAttempts: number;
  tacklesMade: number;
  tackleAttempts: number;
  saves: number;
  redCards: number;
  motm: boolean;
}

export interface MatchNote {
  id: number;
  matchId: number;
  authorName: string;
  body: string;
  motm: { id: number; gamertag: string } | null;
  videoUrl: string | null;
  tags: string[];
  createdAt: string;
}

export interface MatchDetail {
  match: Match;
  /** Vide pour les matchs enregistrés avant la synchro des feuilles de match. */
  players: MatchPlayer[];
  notes: MatchNote[];
  /** Feuille de match adverse et minutes jouées. null : match synchronisé avant le 28/10/2026. */
  opponent: { players: MatchPlayer[]; minutes: number | null } | null;
}
