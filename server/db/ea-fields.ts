import type { Club, Member } from '../../shared/types.js';

// Lecture des réponses EA brutes (`ea_raw`, voir drizzle/0019_ea_raw.sql) : EA renvoie des
// nombres en texte et omet les champs inconnus, d'où les lectures défensives.

type Raw = Record<string, unknown>;

const obj = (value: unknown): Raw => (value && typeof value === 'object' && !Array.isArray(value) ? value as Raw : {});
const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** Résultat d'une saison de playoffs EA (`bestFinishGroup`). */
const FINISH: Record<number, string> = { 1: 'Champion', 2: 'Finaliste', 3: 'Compétitif', 4: 'Milieu de tableau', 5: 'Figurant', 6: 'Participant' };

/** EA code une couleur de maillot en entier RGB. */
const hex = (value: unknown) => {
  const n = num(value);
  return n === null || n < 0 ? null : `#${Math.round(n).toString(16).padStart(6, '0').slice(-6)}`;
};
const kit = (customKit: Raw, keys: string[]) => {
  const colors = keys.map((k) => hex(customKit[k]));
  return colors.every((c) => c !== null) ? colors as string[] : null;
};

export type ClubExtras = Pick<Club, 'winStreak' | 'unbeatenStreak' | 'promotions' | 'relegations' | 'season' | 'playoffHistory' | 'stadium' | 'kits'>;

export function clubExtras(eaRaw: unknown): ClubExtras {
  const raw = obj(eaRaw);
  const overall = obj(raw.overall);
  const season = raw.season ? obj(raw.season) : null;
  const customKit = obj(obj(raw.info).customKit);
  const home = kit(customKit, ['kitColor1', 'kitColor2', 'kitColor3', 'kitColor4']);
  const away = kit(customKit, ['kitAColor1', 'kitAColor2', 'kitAColor3', 'kitAColor4']);
  const third = kit(customKit, ['kitThrdColor1', 'kitThrdColor2', 'kitThrdColor3', 'kitThrdColor4']);
  const playoffs = Array.isArray(raw.playoffs) ? raw.playoffs.map(obj) : [];

  return {
    winStreak: num(overall.wstreak) ?? 0,
    unbeatenStreak: num(overall.unbeatenstreak) ?? 0,
    promotions: num(overall.promotions) ?? 0,
    relegations: num(overall.relegations) ?? 0,
    season: season && {
      rank: num(season.rank), division: num(season.currentDivision), points: num(season.points),
      wins: num(season.wins) ?? 0, draws: num(season.ties) ?? 0, losses: num(season.losses) ?? 0,
      goalsFor: num(season.goals) ?? 0, goalsAgainst: num(season.goalsAgainst) ?? 0, cleanSheets: num(season.cleanSheets) ?? 0,
    },
    playoffHistory: playoffs
      .sort((a, b) => (num(b.seasonId) ?? 0) - (num(a.seasonId) ?? 0))
      .map((p) => ({
        season: (text(p.seasonLabel) ?? text(p.seasonName) ?? `Saison ${num(p.seasonId) ?? '?'}`).replace(/^Season\b/, 'Saison'),
        division: num(p.bestDivision),
        finish: FINISH[num(p.bestFinishGroup) ?? 0] ?? null,
      })),
    stadium: text(customKit.stadName),
    kits: home && away && third ? { home, away, third } : null,
  };
}

export type MemberExtras = Pick<Member, 'proName' | 'heightCm' | 'winPct' | 'motm' | 'shotPct' | 'tacklePct' | 'redCards' | 'career'>;

export function memberExtras(eaRaw: unknown): MemberExtras {
  const raw = obj(eaRaw);
  const career = raw.career ? obj(raw.career) : null;
  return {
    career: career && {
      matches: num(career.gamesPlayed) ?? 0,
      goals: num(career.goals) ?? 0,
      assists: num(career.assists) ?? 0,
      motm: num(career.manOfTheMatch) ?? 0,
      rating: num(career.ratingAve),
    },
    proName: text(raw.proName),
    heightCm: num(raw.proHeight),
    winPct: num(raw.winRate),
    motm: num(raw.manOfTheMatch) ?? 0,
    shotPct: num(raw.shotSuccessRate),
    tacklePct: num(raw.tackleSuccessRate),
    redCards: num(raw.redCards) ?? 0,
  };
}
