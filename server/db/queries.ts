import { and, asc, desc, eq, lte, sql } from 'drizzle-orm';
import type { NewMatchNote } from '../../shared/notes.js';
import type { Club, Match, MatchDetail, MatchNote, Member } from '../../shared/types.js';
import { HttpError } from '../http.js';
import { getDb } from './client.js';
import { clubRatingSnapshots, clubs, matches, matchNotes, members } from './schema.js';

type MatchRow = typeof matches.$inferSelect;
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
  };
}

export async function fetchMembers(): Promise<Member[]> {
  const club = await requireClub();
  const rows = await getDb()
    .select()
    .from(members)
    .where(and(eq(members.clubId, club.id), eq(members.isActive, true)))
    .orderBy(asc(members.id)); // ordre d'arrivée : départage les ex æquo comme avant

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
  }));
}

export async function fetchMatches(limit: number): Promise<Match[]> {
  const club = await requireClub();
  const rows = await getDb()
    .select()
    .from(matches)
    .where(eq(matches.clubId, club.id))
    .orderBy(desc(matches.playedAt))
    .limit(limit);
  return rows.map(toMatch);
}

async function requireMatch(clubId: number, matchId: number) {
  const [match] = await getDb()
    .select()
    .from(matches)
    .where(and(eq(matches.id, matchId), eq(matches.clubId, clubId)))
    .limit(1);
  if (!match) throw new HttpError(404, "Ce match n'existe pas.");
  return match;
}

export async function fetchMatchDetail(matchId: number): Promise<MatchDetail> {
  const club = await requireClub();
  const match = await requireMatch(club.id, matchId);
  const rows = await getDb()
    .select({ note: matchNotes, motmGamertag: members.gamertag })
    .from(matchNotes)
    .leftJoin(members, eq(matchNotes.motmMemberId, members.id))
    .where(eq(matchNotes.matchId, matchId))
    .orderBy(desc(matchNotes.createdAt));

  return { match: toMatch(match), notes: rows.map((r) => toNote(r.note, r.motmGamertag)) };
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
