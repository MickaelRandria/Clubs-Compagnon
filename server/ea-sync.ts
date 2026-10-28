import { ProClubsClient, resolveReputationLabel, type ClubMatch, type Platform } from 'proclubs-sdk';
import { and, asc, desc, eq, isNotNull, isNull, notInArray, sql } from 'drizzle-orm';
import type { MatchPlayer, Position } from '../shared/types.js';
import { getDb } from './db/client.js';
import { clubRatingSnapshots, clubs, matches, members, opponentClubs } from './db/schema.js';

// Synchronisation du club depuis l'API publique Pro Clubs d'EA (via proclubs-sdk).
//
// Pas de cron : la limite de 12 fonctions Vercel Hobby est atteinte et un cron Hobby
// ne tourne qu'une fois par jour. La synchro part donc des lectures (/api/club,
// /api/members, /api/matches) au plus une fois toutes les 5 minutes. Le verrou est
// en base : la première requête qui fait avancer `ea_synced_at` synchronise, les
// requêtes parallèles servent les données déjà en base.
//
// EA ne renvoie que les 10 derniers matchs de chaque type : l'historique se
// construit au fil des synchros, rien n'est jamais effacé ici.

const SYNC_INTERVAL = '5 minutes';
const MATCH_TYPES = [
  ['leagueMatch', 'league'],
  ['playoffMatch', 'playoff'],
  ['friendlyMatch', 'friendly'],
] as const;

/** Fiches adverses lues par synchro : les matchs déjà en base sont rattrapés par paquets. */
const OPPONENT_BATCH = 10;
/** Lu plus tard, le skill rating adverse n'est plus forcément celui du jour du match. */
const FRESH_MATCH_MS = 3 * 3_600_000;

const POSITIONS: Record<string, Position> = { forward: 'FW', midfielder: 'MF', defender: 'DF', goalkeeper: 'GK' };

const int = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : fallback;
};

const between = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Réserve la synchro si la dernière date de plus de 5 minutes. null : rien à faire. */
async function claimSync() {
  const [claimed] = await getDb()
    .update(clubs)
    .set({ eaSyncedAt: sql`now()` })
    .where(and(
      eq(clubs.id, sql`(select min(id) from clubs)`),
      sql`${clubs.eaClubId} is not null`,
      sql`(${clubs.eaSyncedAt} is null or ${clubs.eaSyncedAt} < now() - interval '${sql.raw(SYNC_INTERVAL)}')`,
    ))
    .returning({ id: clubs.id, eaClubId: clubs.eaClubId, platform: clubs.platform });
  return claimed?.eaClubId ? { id: claimed.id, eaClubId: claimed.eaClubId, platform: (claimed.platform ?? 'common-gen5') as Platform } : null;
}

/** Feuille de match d'une des deux équipes (la nôtre, ou l'adversaire depuis `ea_raw`). */
export function toPlayers(eaClubId: string, m: ClubMatch): MatchPlayer[] {
  return Object.values(m.players?.[eaClubId] ?? {})
    .map((p) => ({
      gamertag: String(p.playername ?? ''),
      position: POSITIONS[String(p.pos)] ?? 'MF',
      rating: Number(p.rating) || 0,
      goals: int(p.goals),
      assists: int(p.assists),
      shots: int(p.shots),
      passesMade: int(p.passesmade),
      passAttempts: int(p.passattempts),
      tacklesMade: int(p.tacklesmade),
      tackleAttempts: int(p.tackleattempts),
      saves: int(p.saves),
      redCards: int(p.redcards),
      motm: int(p.mom) > 0,
    }))
    .filter((p) => p.gamertag)
    .sort((a, b) => b.rating - a.rating);
}

function toMatchRow(clubId: number, eaClubId: string, type: 'league' | 'playoff' | 'friendly', m: ClubMatch) {
  const teams = m.clubs ?? {};
  const ours = teams[eaClubId];
  const opponentId = Object.keys(teams).find((id) => id !== eaClubId);
  if (!ours || !opponentId) return null;
  const goalsFor = int(ours.goals);
  const goalsAgainst = int(ours.goalsAgainst);
  const shots = m.aggregate?.[eaClubId]?.shots;
  return {
    clubId,
    eaMatchId: String(m.matchId),
    playedAt: new Date(int(m.timestamp) * 1000),
    type,
    opponentName: teams[opponentId].details?.name ?? 'Adversaire inconnu',
    opponentEaClubId: opponentId,
    goalsFor,
    goalsAgainst,
    result: goalsFor > goalsAgainst ? 'win' as const : goalsFor < goalsAgainst ? 'loss' as const : 'draw' as const,
    // EA ne publie pas la possession dans l'historique des matchs.
    possessionPct: null,
    shots: shots === undefined ? null : int(shots),
    playerStats: toPlayers(eaClubId, m),
    eaRaw: m,
    // EA marque `winnerByDnf` sur le club vainqueur d'un match que l'adversaire n'a pas fini.
    opponentQuit: ours.winnerByDnf === undefined || ours.winnerByDnf === null ? null : int(ours.winnerByDnf) > 0,
  };
}

async function syncClub(target: { id: number; eaClubId: string; platform: Platform }) {
  const ea = new ProClubsClient({ platform: target.platform, timeoutMs: 6000, maxAttempts: 2, cache: false });
  const request = { clubId: target.eaClubId };
  const [info, overall, roster, ...lists] = await Promise.all([
    ea.clubs.get(request),
    ea.clubs.overallStats(request),
    ea.members.stats(request),
    ...MATCH_TYPES.map(([type]) => ea.matches.list({ ...request, type, limit: 10 })),
  ]);
  // Classements (EA les cherche par nom), palmarès des playoffs et carrières des joueurs :
  // secondaires, une panne ici ne doit pas faire échouer la synchro du reste.
  const [ranking, allTimeRanking, playoffs, careers] = await Promise.all([
    info?.name ? ea.rankings.searchCurrentSeason({ name: info.name }).catch(() => []) : [],
    info?.name ? ea.rankings.searchAllTime({ name: info.name }).catch(() => []) : [],
    ea.clubs.playoffAchievements(request).catch(() => []),
    ea.members.careerStats(request).catch(() => null),
  ]);
  const ours = (entries: typeof ranking) => entries.find((entry) => String(entry.clubId) === target.eaClubId) ?? null;
  const season = ours(ranking);
  const allTime = ours(allTimeRanking);
  const careerByName = new Map((careers?.members ?? []).map((c) => [c.name, c]));
  const db = getDb();

  if (overall) {
    const skillRating = int(overall.skillRating);
    await db.update(clubs).set({
      ...(info?.name ? { name: info.name } : {}),
      ...(typeof info?.regionLabel === 'string' ? { region: info.regionLabel } : {}),
      reputation: resolveReputationLabel(overall.reputationtier) ?? 'Inconnue',
      skillRating,
      bestDivision: overall.bestDivision ? int(overall.bestDivision) : null,
      wins: int(overall.wins),
      draws: int(overall.ties),
      losses: int(overall.losses),
      goalsFor: int(overall.goals),
      goalsAgainst: int(overall.goalsAgainst),
      leagueApps: int(overall.leagueAppearances),
      playoffApps: int(overall.gamesPlayedPlayoff),
      eaRaw: { info, overall, season, allTime, playoffs },
      updatedAt: sql`now()`,
    }).where(eq(clubs.id, target.id));

    // Un point par jour au plus, ou dès que le rating bouge : de quoi calculer la tendance à 30 jours.
    const [last] = await db.select().from(clubRatingSnapshots).where(eq(clubRatingSnapshots.clubId, target.id))
      .orderBy(desc(clubRatingSnapshots.takenAt)).limit(1);
    if (!last || last.skillRating !== skillRating || Date.now() - last.takenAt.getTime() > 86_400_000) {
      await db.insert(clubRatingSnapshots).values({ clubId: target.id, skillRating });
    }
  }

  const players = roster.members.flatMap((p) => (p.name ? [{ ...p, name: p.name }] : []));
  if (players.length > 0) {
    for (const p of players) {
      const values = {
        position: POSITIONS[String(p.favoritePosition)] ?? 'MF',
        ovr: between(int(p.proOverall), 0, 99),
        matchesPlayed: int(p.gamesPlayed),
        goals: int(p.goals),
        assists: int(p.assists),
        avgRating: p.ratingAve ? String(between(Number(p.ratingAve), 0, 10)) : null,
        passPct: p.passSuccessRate ? between(int(p.passSuccessRate), 0, 100) : null,
        isActive: true,
        // `career` : la fiche EA du Pro sur toute sa carrière, tous clubs confondus.
        eaRaw: { ...p, career: careerByName.get(p.name) ?? null },
        updatedAt: sql`now()`,
      };
      await db.insert(members).values({ clubId: target.id, gamertag: p.name, ...values })
        .onConflictDoUpdate({ target: [members.clubId, members.gamertag], set: values });
    }
    // Les joueurs partis du club EA restent en base (fiches, réclamations) mais sortent de l'effectif.
    await db.update(members).set({ isActive: false })
      .where(and(eq(members.clubId, target.id), notInArray(members.gamertag, players.map((p) => p.name))));
  }

  const rows = MATCH_TYPES.flatMap(([, type], i) => lists[i].map((m) => toMatchRow(target.id, target.eaClubId, type, m)))
    .filter((row) => row !== null);
  // Mise à jour de la feuille de match : les matchs déjà en base la reçoivent aussi, tant qu'EA les renvoie.
  if (rows.length > 0) {
    await db.insert(matches).values(rows)
      .onConflictDoUpdate({ target: matches.eaMatchId, set: {
        playerStats: sql`excluded.player_stats`,
        eaRaw: sql`excluded.ea_raw`,
        opponentQuit: sql`excluded.opponent_quit`,
      } });
  }
  await rateOpponents(ea, target.id, overall ? int(overall.skillRating) : null)
    .catch((error) => console.error('[ea-sync] niveau des adversaires indisponible :', error));
  // Un nouveau match peut régler les paris en attente (Vestiaire Bets).
  await db.execute(sql`select bets_settle()`).catch((error) => console.error('[ea-sync] règlement des paris impossible :', error));
}

/**
 * Skill rating des adversaires. EA ne le met pas dans les matchs : on lit la fiche de chaque
 * club adverse et on fige sur le match son SR et le nôtre (dernier relevé avant le coup d'envoi).
 * Un club introuvable compte comme lu ; une panne EA laisse le match à relire au passage suivant.
 */
export async function rateOpponents(ea: Pick<ProClubsClient, 'clubs'>, clubId: number, currentSr: number | null) {
  const db = getDb();
  const pending = await db
    .select({ id: matches.id, playedAt: matches.playedAt, opponentName: matches.opponentName, opponentId: matches.opponentEaClubId })
    .from(matches)
    .where(and(eq(matches.clubId, clubId), isNull(matches.opponentCheckedAt), isNotNull(matches.opponentEaClubId)))
    .orderBy(desc(matches.playedAt))
    .limit(OPPONENT_BATCH);
  if (pending.length === 0) return;

  // Par club : sa fiche, null s'il est introuvable chez EA, undefined si EA n'a pas répondu.
  const names = new Map(pending.map((m) => [m.opponentId!, m.opponentName]));
  const sheets = new Map(await Promise.all([...names.keys()].map(async (id) =>
    [id, await ea.clubs.overallStats({ clubId: id }).catch(() => undefined)] as const)));
  for (const [id, sheet] of sheets) {
    if (!sheet) continue;
    await db.insert(opponentClubs).values({ eaClubId: id, name: names.get(id)!, overall: sheet })
      .onConflictDoUpdate({ target: opponentClubs.eaClubId, set: { name: names.get(id)!, overall: sheet, fetchedAt: sql`now()` } });
  }

  const snapshots = await db.select().from(clubRatingSnapshots).where(eq(clubRatingSnapshots.clubId, clubId))
    .orderBy(asc(clubRatingSnapshots.takenAt));
  for (const m of pending) {
    const sheet = sheets.get(m.opponentId!);
    if (sheet === undefined) continue;
    const sr = int(sheet?.skillRating, 0);
    const ours = snapshots.filter((s) => s.takenAt <= m.playedAt).at(-1)?.skillRating ?? currentSr;
    await db.update(matches).set({
      opponentSkillRating: sr > 0 ? sr : null,
      ourSkillRating: ours,
      opponentSrEstimated: Date.now() - m.playedAt.getTime() > FRESH_MATCH_MS,
      opponentCheckedAt: sql`now()`,
    }).where(eq(matches.id, m.id));
  }
}

/**
 * Synchronise le club si besoin. Une panne EA ne bloque jamais la lecture :
 * on journalise et on sert ce qui est en base.
 */
export async function syncFromEa() {
  // Sans base (tests, aperçu), la lecture renverra elle-même l'erreur explicite.
  if (!process.env.DATABASE_URL) return;
  try {
    const target = await claimSync();
    if (target) await syncClub(target);
  } catch (error) {
    console.error('[ea-sync] synchro EA impossible :', error);
  }
}
