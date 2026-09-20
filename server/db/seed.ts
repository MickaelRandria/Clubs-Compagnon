import { sql } from 'drizzle-orm';
import { loadLocalEnv } from '../env.js';
import { getDb } from './client.js';
import { clubRatingSnapshots, clubs, matches, members } from './schema.js';

// Données statiques de l'ancien Dashboard.html, en attendant la synchro EA.
// ⚠️ Vide toutes les tables avant de les remplir (notes comprises).

loadLocalEnv();

const HOUR = 3_600_000;

const CLUB = {
  name: 'Dommage BJ FC',
  handle: '@dommagebj',
  skillRating: 1859,
  skillRatingMonthAgo: 1817, // → « ▲ +42 ce mois »
  region: 'Southern Europe',
  reputation: 'Well Known',
  bestDivision: 2,
  wins: 367,
  draws: 86,
  losses: 358,
  goalsFor: 3087,
  goalsAgainst: 2997,
  leagueApps: 765,
  playoffApps: 46,
};

const MEMBERS = [
  { gamertag: 'Rina94JJG',      position: 'FW', ovr: 86, matchesPlayed: 760, goals: 994, assists: 310, avgRating: 7.9, passPct: 85 },
  { gamertag: 'Naaks-75',       position: 'MF', ovr: 88, matchesPlayed: 511, goals: 219, assists: 188, avgRating: 7.9, passPct: 75 },
  { gamertag: 'Chef695046',     position: 'MF', ovr: 85, matchesPlayed: 434, goals: 478, assists: 142, avgRating: 7.8, passPct: 81 },
  { gamertag: 'Desparte971',    position: 'MF', ovr: 87, matchesPlayed: 456, goals: 236, assists: 167, avgRating: 7.7, passPct: 78 },
  { gamertag: 'WillouRkt',      position: 'MF', ovr: 81, matchesPlayed: 404, goals: 381, assists: 98,  avgRating: 7.5, passPct: 78 },
  { gamertag: 'vrYmika',        position: 'FW', ovr: 87, matchesPlayed: 375, goals: 336, assists: 201, avgRating: 7.6, passPct: 83 },
  { gamertag: 'S1MBA90',        position: 'MF', ovr: 80, matchesPlayed: 170, goals: 158, assists: 62,  avgRating: 7.4, passPct: 85 },
  { gamertag: 'Beeruus-_-sama', position: 'MF', ovr: 79, matchesPlayed: 165, goals: 133, assists: 55,  avgRating: 7.3, passPct: 80 },
  { gamertag: 'FIFIQLF',        position: 'FW', ovr: 81, matchesPlayed: 17,  goals: 19,  assists: 4,   avgRating: 7.6, passPct: 81 },
  { gamertag: 'Rjafetra',       position: 'MF', ovr: 73, matchesPlayed: 5,   goals: 0,   assists: 1,   avgRating: 6.8, passPct: 73 },
] as const;

const MATCHES = [
  { hoursAgo: 1,  result: 'loss', goalsFor: 2, goalsAgainst: 3, opponent: 'Eristof',     type: 'league',   possessionPct: 44, shots: 9 },
  { hoursAgo: 4,  result: 'win',  goalsFor: 4, goalsAgainst: 1, opponent: 'FC Zinzin',   type: 'league',   possessionPct: 58, shots: 16 },
  { hoursAgo: 8,  result: 'win',  goalsFor: 3, goalsAgainst: 2, opponent: 'Les Tontons', type: 'league',   possessionPct: 51, shots: 13 },
  { hoursAgo: 14, result: 'loss', goalsFor: 0, goalsAgainst: 2, opponent: 'Real Esport', type: 'league',   possessionPct: 38, shots: 5 },
  { hoursAgo: 20, result: 'win',  goalsFor: 5, goalsAgainst: 0, opponent: 'AJ Bangers',  type: 'league',   possessionPct: 65, shots: 20 },
  { hoursAgo: 28, result: 'draw', goalsFor: 2, goalsAgainst: 2, opponent: 'Monaco FC',   type: 'playoff',  possessionPct: 49, shots: 10 },
  { hoursAgo: 35, result: 'win',  goalsFor: 3, goalsAgainst: 1, opponent: 'LOSC Street', type: 'league',   possessionPct: 54, shots: 14 },
  { hoursAgo: 42, result: 'loss', goalsFor: 1, goalsAgainst: 4, opponent: 'Barça Clubs', type: 'league',   possessionPct: 35, shots: 6 },
  { hoursAgo: 50, result: 'win',  goalsFor: 2, goalsAgainst: 0, opponent: 'OL Academy',  type: 'league',   possessionPct: 57, shots: 12 },
  { hoursAgo: 58, result: 'win',  goalsFor: 6, goalsAgainst: 3, opponent: 'Nantes City', type: 'friendly', possessionPct: 61, shots: 22 },
] as const;

const db = getDb();
const now = Date.now();

await db.execute(sql`truncate table match_notes, matches, members, club_rating_snapshots, clubs restart identity cascade`);

const { skillRatingMonthAgo, ...clubValues } = CLUB;
const [club] = await db.insert(clubs).values(clubValues).returning({ id: clubs.id });

await db.insert(clubRatingSnapshots).values({
  clubId: club.id,
  skillRating: skillRatingMonthAgo,
  takenAt: new Date(now - 30 * 24 * HOUR),
});

await db.insert(members).values(
  MEMBERS.map((m) => ({ ...m, clubId: club.id, avgRating: m.avgRating.toFixed(1) })),
);

await db.insert(matches).values(
  MATCHES.map(({ hoursAgo, opponent, ...m }) => ({
    ...m,
    clubId: club.id,
    opponentName: opponent,
    playedAt: new Date(now - hoursAgo * HOUR),
  })),
);

console.log(`✔ Seed terminé : 1 club, ${MEMBERS.length} joueurs, ${MATCHES.length} matchs.`);
