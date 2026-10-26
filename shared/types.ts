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
}
