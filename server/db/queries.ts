import { and, asc, desc, eq, getTableColumns, isNotNull, lte, sql } from 'drizzle-orm';
import type { ClubMatch } from 'proclubs-sdk';
import type { NewMatchNote } from '../../shared/notes.js';
import { opponentStrength } from '../../shared/skill-rating.js';
import type { Club, Match, MatchDetail, MatchNote, Member } from '../../shared/types.js';
import { syncFromEa, toPlayers } from '../ea-sync.js';
import { clubExtras, kitColor, memberExtras, opponentClubSheet } from './ea-fields.js';
import { HttpError } from '../http.js';
import { getDb } from './client.js';
import { clubRatingSnapshots, clubs, matches, matchNotes, members, opponentClubs } from './schema.js';

// Les matchs EA bruts (`ea_raw`) pèsent lourd : les listes les laissent en base, seule la fiche d'un match les lit.
const { eaRaw: _matchRaw, ...matchColumns } = getTableColumns(matches);

type MatchRow = Omit<typeof matches.$inferSelect, 'eaRaw'>;
type NoteRow = typeof matchNotes.$inferSelect;

const toMatch = (m: MatchRow): Match => ({
  id: m.id,
  playedAt: m.playedAt.toISOString(),
  type: m.type,
  opponent: m.opponentName,
  goalsFor: m.goalsFor,
  goalsAgainst: m.goalsAgainst,
  result: m.result,
  possessionPct: m.possessionPct,
  shots: m.shots,
  opponentQuit: m.opponentQuit,
  opponentSkillRating: m.opponentSkillRating,
  ourSkillRating: m.ourSkillRating,
  opponentSrEstimated: m.opponentSrEstimated,
});

const toNote = (n: NoteRow, motmGamertag: string | null): MatchNote => ({
  id: n.id,
  matchId: n.matchId,
  authorName: n.authorName,
  body: n.body,
  motm: n.motmMemberId !== null && motmGamertag !== null ? { id: n.motmMemberId, gamertag: motmGamertag } : null,
  videoUrl: n.videoUrl,
  tags: n.tags,
  createdAt: n.createdAt.toISOString(),
});

/** L'app suit un seul club : le premier enregistré. */
async function requireClub() {
  const [club] = await getDb().select().from(clubs).orderBy(asc(clubs.id)).limit(1);
  if (!club) throw new HttpError(404, 'Aucun club en base. Lance « npm run db:seed ».');
  return club;
}

export async function fetchClub(): Promise<Club> {
  await syncFromEa();
  const club = await requireClub();
  const [reference] = await getDb()
    .select({ skillRating: clubRatingSnapshots.skillRating })
    .from(clubRatingSnapshots)
    .where(and(eq(clubRatingSnapshots.clubId, club.id), lte(clubRatingSnapshots.takenAt, sql`now() - interval '30 days'`)))
    .orderBy(desc(clubRatingSnapshots.takenAt))
    .limit(1);

  return {
    id: club.id,
    name: club.name,
    handle: club.handle,
    region: club.region,
    reputation: club.reputation,
    skillRating: club.skillRating,
    skillRatingTrend: reference ? club.skillRating - reference.skillRating : null,
    bestDivision: club.bestDivision,
    gamesPlayed: club.gamesPlayed ?? club.wins + club.draws + club.losses,
    wins: club.wins,
    draws: club.draws,
    losses: club.losses,
    goalsFor: club.goalsFor,
    goalsAgainst: club.goalsAgainst,
    leagueApps: club.leagueApps,
    playoffApps: club.playoffApps,
    ...clubExtras(club.eaRaw),
    opponents: await opponentsSummary(club.id),
  };
}

/** Niveau de nos adversaires : moyenne des 10 derniers connus, bilan selon l'écart de niveau. */
async function opponentsSummary(clubId: number): Promise<Club['opponents']> {
  const rows = await getDb()
    .select({ result: matches.result, ours: matches.ourSkillRating, theirs: matches.opponentSkillRating })
    .from(matches)
    .where(and(eq(matches.clubId, clubId), isNotNull(matches.opponentSkillRating)))
    .orderBy(desc(matches.playedAt));
  const recent = rows.slice(0, 10);
  const blank = () => ({ wins: 0, draws: 0, losses: 0 });
  const record: Club['opponents']['record'] = { stronger: blank(), even: blank(), weaker: blank() };
  for (const r of rows) {
    const strength = opponentStrength(r.ours, r.theirs);
    if (strength) record[strength][r.result === 'win' ? 'wins' : r.result === 'draw' ? 'draws' : 'losses']++;
  }
  return {
    averageSr: recent.length > 0 ? Math.round(recent.reduce((sum, r) => sum + r.theirs!, 0) / recent.length) : null,
    sample: recent.length,
    record,
  };
}

/** Forme : les 10 derniers matchs de chaque joueur, lus dans les feuilles de match récentes. */
async function recentForm(clubId: number) {
  const rows = await getDb()
    .select({ id: matches.id, playerStats: matches.playerStats })
    .from(matches)
    .where(eq(matches.clubId, clubId))
    .orderBy(desc(matches.playedAt))
    .limit(60);
  const form = new Map<string, Member['form']>();
  for (const row of rows) {
    for (const p of row.playerStats ?? []) {
      const list = form.get(p.gamertag) ?? [];
      if (list.length < 10) list.unshift({ matchId: row.id, goals: p.goals, rating: p.rating });
      form.set(p.gamertag, list);
    }
  }
  return form;
}

export async function fetchMembers(): Promise<Member[]> {
  await syncFromEa();
  const club = await requireClub();
  const [rows, form] = await Promise.all([
    getDb()
      .select()
      .from(members)
      .where(and(eq(members.clubId, club.id), eq(members.isActive, true)))
      .orderBy(asc(members.id)), // ordre d'arrivée : départage les ex æquo comme avant
    recentForm(club.id),
  ]);

  return rows.map((m) => ({
    id: m.id,
    gamertag: m.gamertag,
    position: m.position,
    ovr: m.ovr,
    matchesPlayed: m.matchesPlayed,
    goals: m.goals,
    assists: m.assists,
    avgRating: m.avgRating === null ? null : Number(m.avgRating),
    passPct: m.passPct,
    ...memberExtras(m.eaRaw),
    form: form.get(m.gamertag) ?? [],
  }));
}

export async function fetchMatches(limit: number): Promise<Match[]> {
  await syncFromEa();
  const club = await requireClub();
  const rows = await getDb()
    .select(matchColumns)
    .from(matches)
    .where(eq(matches.clubId, club.id))
    .orderBy(desc(matches.playedAt))
    .limit(limit);
  return rows.map(toMatch);
}

async function requireMatch(clubId: number, matchId: number) {
  const [match] = await getDb()
    .select(matchColumns)
    .from(matches)
    .where(and(eq(matches.id, matchId), eq(matches.clubId, clubId)))
    .limit(1);
  if (!match) throw new HttpError(404, "Ce match n'existe pas.");
  return match;
}

export async function fetchMatchDetail(matchId: number): Promise<MatchDetail> {
  const club = await requireClub();
  const match = await requireMatch(club.id, matchId);
  const [rows, [raw], [sheet], headToHead] = await Promise.all([
    getDb()
      .select({ note: matchNotes, motmGamertag: members.gamertag })
      .from(matchNotes)
      .leftJoin(members, eq(matchNotes.motmMemberId, members.id))
      .where(eq(matchNotes.matchId, matchId))
      .orderBy(desc(matchNotes.createdAt)),
    getDb().select({ eaRaw: matches.eaRaw }).from(matches).where(eq(matches.id, matchId)).limit(1),
    match.opponentEaClubId
      ? getDb().select().from(opponentClubs).where(eq(opponentClubs.eaClubId, match.opponentEaClubId)).limit(1)
      : Promise.resolve([]),
    match.opponentEaClubId
      ? getDb().select(matchColumns).from(matches)
        .where(and(eq(matches.clubId, club.id), eq(matches.opponentEaClubId, match.opponentEaClubId)))
        .orderBy(desc(matches.playedAt))
      : Promise.resolve([match]),
  ]);

  return {
    match: toMatch(match),
    players: match.playerStats ?? [],
    notes: rows.map((r) => toNote(r.note, r.motmGamertag)),
    opponent: opponentSheet(raw?.eaRaw as ClubMatch | null, match.opponentEaClubId),
    opponentClub: sheet ? opponentClubSheet(sheet.overall, sheet.fetchedAt) : null,
    headToHead: headToHead.map(toMatch),
  };
}

/** Moins des trois quarts du temps de jeu du plus présent : parti en cours de match. */
const LEFT_EARLY = 0.75;

/** Feuille adverse, durée du match et couleur du maillot adverse, lues dans le match EA brut. */
function opponentSheet(raw: ClubMatch | null, opponentEaClubId: string | null): MatchDetail['opponent'] {
  if (!raw || !opponentEaClubId) return null;
  const seconds = Object.values(raw.players ?? {}).flatMap((team) => Object.values(team).map((p) => Number(p.secondsPlayed) || 0));
  const longest = Math.max(0, ...seconds);
  const played = new Map(Object.values(raw.players?.[opponentEaClubId] ?? {})
    .map((p) => [String(p.playername ?? ''), Number(p.secondsPlayed) || 0]));
  const players = toPlayers(opponentEaClubId, raw).map((p) =>
    (longest > 0 && (played.get(p.gamertag) ?? longest) < longest * LEFT_EARLY ? { ...p, leftEarly: true } : p));
  return { players, minutes: longest > 0 ? Math.round(longest / 60) : null, kitColor: kitColor(raw, opponentEaClubId) };
}

export async function addMatchNote(matchId: number, input: NewMatchNote): Promise<MatchNote> {
  const club = await requireClub();
  await requireMatch(club.id, matchId);

  let motmGamertag: string | null = null;
  if (input.motmMemberId !== null) {
    const [member] = await getDb()
      .select({ gamertag: members.gamertag })
      .from(members)
      .where(and(eq(members.id, input.motmMemberId), eq(members.clubId, club.id)))
      .limit(1);
    if (!member) throw new HttpError(400, "L'homme du match choisi ne fait pas partie du club.");
    motmGamertag = member.gamertag;
  }

  const [note] = await getDb()
    .insert(matchNotes)
    .values({
      matchId,
      authorName: input.authorName,
      body: input.body,
      motmMemberId: input.motmMemberId,
      videoUrl: input.videoUrl,
      tags: input.tags,
    })
    .returning();

  return toNote(note, motmGamertag);
}
