import { and, asc, desc, eq, gt, sql } from 'drizzle-orm';
import { promotionStreak, promotionTarget, replayDivision } from '../shared/division-progress.js';
import type { Club, DivisionEvent, DivisionProgress, MatchResult } from '../shared/types.js';
import { isAdminAccount } from './db/accounts.js';
import { getDb } from './db/client.js';
import { clubDivisionEvents, clubs, clubSeasonSnapshots, matches } from './db/schema.js';
import { HttpError } from './http.js';
import { readSession } from './session.js';

// Progression en division : relevés de la saison EA à la synchro, événements de montée et de
// descente, puis points et chances recalculés depuis nos matchs (règles : shared/division-progress.ts).

type Raw = Record<string, unknown>;
const obj = (value: unknown): Raw => (value && typeof value === 'object' && !Array.isArray(value) ? value as Raw : {});
const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
};

export interface SeasonCounters {
  division: number; gamesPlayed: number; wins: number; draws: number; losses: number; promotions: number; relegations: number;
}

/** Compteurs de la saison, lus dans l'entrée du classement EA (`ea_raw.season`). null : EA ne l'a pas renvoyée. */
export function seasonCounters(season: unknown): SeasonCounters | null {
  const s = obj(season);
  const division = num(s.currentDivision);
  const gamesPlayed = num(s.gamesPlayed);
  if (division === null || division < 1 || gamesPlayed === null) return null;
  return {
    division, gamesPlayed,
    wins: num(s.wins) ?? 0, draws: num(s.ties) ?? 0, losses: num(s.losses) ?? 0,
    promotions: num(s.promotions) ?? 0, relegations: num(s.relegations) ?? 0,
  };
}

type PlayedMatch = { id: number; playedAt: Date; result: MatchResult; opponentName: string; goalsFor: number; goalsAgainst: number };

/** Nos matchs de ligue joués après `after`, du plus ancien au plus récent. */
async function leagueMatches(clubId: number, after: Date | null): Promise<PlayedMatch[]> {
  return getDb()
    .select({ id: matches.id, playedAt: matches.playedAt, result: matches.result, opponentName: matches.opponentName,
      goalsFor: matches.goalsFor, goalsAgainst: matches.goalsAgainst })
    .from(matches)
    .where(and(eq(matches.clubId, clubId), eq(matches.type, 'league'), after ? gt(matches.playedAt, after) : undefined))
    .orderBy(asc(matches.playedAt), asc(matches.id));
}

type EventRow = typeof clubDivisionEvents.$inferSelect;

/** Événements du plus récent au plus ancien : le premier ouvre la division en cours. */
async function divisionEvents(clubId: number): Promise<EventRow[]> {
  return getDb().select().from(clubDivisionEvents).where(eq(clubDivisionEvents.clubId, clubId))
    .orderBy(desc(clubDivisionEvents.startsAfter), desc(clubDivisionEvents.id));
}

/** Points atteints au match décisif des montées suivies depuis `division`, de la plus ancienne à la plus récente. */
const observedTargets = (events: EventRow[], division: number) => events
  .filter((e) => e.kind === 'promotion' && e.fromDivision === division && e.points !== null)
  .map((e) => e.points!)
  .reverse();

/**
 * Relève la saison EA si elle a bougé, et date un changement de division par son match décisif.
 * Appelée par la synchro une fois les nouveaux matchs en base.
 */
export async function recordSeason(clubId: number, season: unknown) {
  const now = seasonCounters(season);
  if (!now) return;
  const db = getDb();
  const [last] = await db.select().from(clubSeasonSnapshots).where(eq(clubSeasonSnapshots.clubId, clubId))
    .orderBy(desc(clubSeasonSnapshots.takenAt)).limit(1);
  if (last && (Object.keys(now) as (keyof SeasonCounters)[]).every((k) => last[k] === now[k])) return;
  await db.insert(clubSeasonSnapshots).values({ clubId, ...now });
  if (!last) return;

  if (now.gamesPlayed < last.gamesPlayed) {
    // Nouvelle saison EA : ses `gamesPlayed` premiers matchs sont les derniers arrivés en base.
    const recent = await db.select({ playedAt: matches.playedAt }).from(matches)
      .where(and(eq(matches.clubId, clubId), eq(matches.type, 'league')))
      .orderBy(desc(matches.playedAt)).limit(now.gamesPlayed + 1);
    const before = recent[now.gamesPlayed];
    await db.insert(clubDivisionEvents).values({
      clubId, kind: 'season', fromDivision: last.division, toDivision: now.division,
      startsAfter: before?.playedAt ?? last.takenAt, exact: before !== undefined,
    });
    return;
  }
  if (now.division === last.division) return;

  const kind = now.division < last.division ? 'promotion' : 'relegation';
  const window = await leagueMatches(clubId, last.takenAt);
  const events = await divisionEvents(clubId);
  const period = events[0]?.toDivision === last.division ? events[0] : null;
  let decisive: PlayedMatch | null = null;
  let points: number | null = null;
  if (period) {
    // Division suivie depuis son début : les règles désignent le match décisif parmi les nouveaux.
    const target = promotionTarget(last.division, observedTargets(events, last.division)).points;
    const replay = replayDivision(await leagueMatches(clubId, period.startsAfter), target, promotionStreak(last.division));
    const hit = kind === 'promotion' ? replay.promotedAfter : replay.relegatedAfter;
    decisive = window.find((m) => m.id === hit) ?? null;
    const at = decisive ?? window.at(-1);
    points = replay.steps.find((s) => s.matchId === at?.id)?.points ?? null;
  }
  decisive ??= window.at(-1) ?? null;
  await db.insert(clubDivisionEvents).values({
    clubId, kind, fromDivision: last.division, toDivision: now.division,
    startsAfter: decisive?.playedAt ?? last.takenAt,
    matchId: decisive?.id ?? null,
    points,
    // Exact quand un seul match sépare les deux relevés ; sinon le match décisif est déduit.
    exact: window.length === 1 && now.gamesPlayed - last.gamesPlayed === 1,
  });
}

const blankRecord = () => ({ wins: 0, draws: 0, losses: 0 });
const tally = (list: PlayedMatch[]) => {
  const record = blankRecord();
  for (const m of list) record[m.result === 'win' ? 'wins' : m.result === 'draw' ? 'draws' : 'losses']++;
  return record;
};

/** Progression dans la division actuelle et historique des changements, pour /api/club. */
export async function fetchDivision(clubId: number, eaRaw: unknown): Promise<Pick<Club, 'progress' | 'divisionEvents'>> {
  const db = getDb();
  const events = await divisionEvents(clubId);
  const oldest = events.at(-1);
  // Une seule lecture des matchs couvre la division en cours, l'historique et la forme récente.
  const played = await leagueMatches(clubId, oldest ? new Date(oldest.startsAfter.getTime() - 1) : null);
  const byId = new Map(played.map((m) => [m.id, m]));

  const history: DivisionEvent[] = events.slice(0, 12).map((e, i) => {
    const m = e.matchId === null ? undefined : byId.get(e.matchId);
    const previous = events[i + 1];
    // Bilan dans la division quittée, si on la suivait depuis son début.
    const left = (e.kind === 'promotion' || e.kind === 'relegation') && previous
      ? played.filter((p) => p.playedAt > previous.startsAfter && p.playedAt <= e.startsAfter) : null;
    return {
      id: e.id, kind: e.kind, fromDivision: e.fromDivision, toDivision: e.toDivision, at: e.startsAfter.toISOString(),
      match: m ? { id: m.id, opponent: m.opponentName, goalsFor: m.goalsFor, goalsAgainst: m.goalsAgainst } : null,
      points: e.points, record: left ? tally(left) : null, exact: e.exact,
    };
  });

  const counters = seasonCounters(obj(eaRaw).season);
  if (!counters) return { progress: null, divisionEvents: history };
  const division = counters.division;
  const target = promotionTarget(division, observedTargets(events, division));
  const lastTen = (oldest ? played : await leagueMatches(clubId, null)).slice(-10);
  const pointsPerMatch = lastTen.length === 0 ? null
    : Math.round((lastTen.reduce((sum, m) => sum + (m.result === 'win' ? 3 : m.result === 'draw' ? 1 : 0), 0) / lastTen.length) * 10) / 10;

  // Le dernier événement doit ouvrir la division où EA nous voit, sinon on ne sait pas d'où on part.
  const period = events[0]?.toDivision === division ? events[0] : null;
  const base: DivisionProgress = {
    division, status: 'calibrating', target: target.points, targetSource: target.source,
    points: 0, chances: 3, relegationMatchNext: false, record: blankRecord(), steps: [],
    targetReached: false, missingMatches: 0, verifiedSince: null, pointsPerMatch,
    streakNeeded: promotionStreak(division), streak: 0, seriesStarted: false,
  };
  if (!period) return { progress: base, divisionEvents: history };

  const inDivision = played.filter((m) => m.playedAt > period.startsAfter);
  const replay = replayDivision(inDivision, target.points, base.streakNeeded);

  // Matchs manquants : EA en a compté plus que la base n'en a reçu depuis le premier relevé de la division.
  const [first] = await db.select().from(clubSeasonSnapshots)
    .where(and(eq(clubSeasonSnapshots.clubId, clubId), eq(clubSeasonSnapshots.division, division),
      sql`${clubSeasonSnapshots.takenAt} >= ${period.startsAfter}`))
    .orderBy(asc(clubSeasonSnapshots.takenAt)).limit(1);
  let missingMatches = 0;
  if (first && counters.gamesPlayed >= first.gamesPlayed) {
    const found = inDivision.filter((m) => m.playedAt > first.takenAt).length;
    missingMatches = Math.max(0, counters.gamesPlayed - first.gamesPlayed - found);
  }

  return {
    progress: {
      ...base,
      status: 'tracking',
      points: replay.points,
      chances: replay.chances,
      relegationMatchNext: replay.relegationMatchNext,
      record: replay.record,
      steps: replay.steps,
      // Montée acquise selon nos règles (seuil, puis série finale s'il y en a une) : EA doit suivre.
      targetReached: replay.promotedAfter !== null,
      streak: replay.streak,
      seriesStarted: replay.seriesStarted,
      missingMatches,
      verifiedSince: first ? first.takenAt.toISOString() : null,
    },
    divisionEvents: history,
  };
}

/**
 * POST /api/club { matchId } : un admin indique le premier match joué dans la division actuelle
 * (null : aucun encore). Sert à démarrer le suivi sans attendre le prochain changement de division.
 */
export async function postDivisionStart(request: Request): Promise<Response> {
  const accountId = readSession(request);
  if (accountId === null) throw new HttpError(401, 'Connecte-toi pour régler le suivi de la division.');
  if (!await isAdminAccount(accountId)) throw new HttpError(403, 'Réservé aux admins du club.');
  const body = obj(await request.json().catch(() => null));
  const matchId = body.matchId === null ? null : num(body.matchId);
  if (matchId === null && body.matchId !== null) throw new HttpError(400, 'Match invalide.');

  const db = getDb();
  const [club] = await db.select({ id: clubs.id, eaRaw: clubs.eaRaw }).from(clubs).orderBy(asc(clubs.id)).limit(1);
  if (!club) throw new HttpError(404, 'Aucun club en base.');
  const counters = seasonCounters(obj(club.eaRaw).season);
  if (!counters) throw new HttpError(409, 'EA n’a pas encore renvoyé notre division : réessaie après la prochaine synchro.');

  let startsAfter = new Date();
  if (matchId !== null) {
    const [m] = await db.select({ playedAt: matches.playedAt }).from(matches)
      .where(and(eq(matches.id, matchId), eq(matches.clubId, club.id), eq(matches.type, 'league')));
    if (!m) throw new HttpError(404, 'Match de ligue introuvable.');
    startsAfter = new Date(m.playedAt.getTime() - 1000);
  }
  const [latest] = await divisionEvents(club.id);
  if (latest && startsAfter <= latest.startsAfter) {
    throw new HttpError(400, 'Ce match est antérieur au dernier changement de division détecté.');
  }
  await db.insert(clubDivisionEvents).values({
    clubId: club.id, kind: 'anchor', toDivision: counters.division, startsAfter, matchId, exact: true,
  });
  return Response.json({ ok: true });
}
