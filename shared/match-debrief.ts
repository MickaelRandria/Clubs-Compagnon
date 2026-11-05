import { z } from 'zod';
import { NOTE_TAGS, type NoteTag } from './notes.js';
import type { MatchDetail, MatchNote, MatchPlayer, Member, Position } from './types.js';

// Débrief de match par Mistral (v2, 05/11/2026). La v1 ne recevait que le score, la possession
// et les tirs : le modèle comblait le vide en inventant (« but de la tête sur corner », « à la 60e »),
// collait des tags faux (« Remontada » sur un 6-1) et glissait du markdown.
// Règle de la v2 : les chiffres viennent de la feuille de match EA, calculés ici (matchFacts) ;
// le modèle n'écrit que le texte, à partir de ces faits seulement. Tags et homme du match sont
// tranchés par le code, pas par le modèle.

/** Ce que le modèle rédige. Les bornes n'attrapent qu'une sortie cassée : les longueurs sont dans le prompt. */
export const matchDebriefSchema = z.object({
  headline: z.string().trim().min(3).max(160),
  lede: z.string().trim().min(20).max(700),
  keys: z.array(z.object({ title: z.string().trim().min(2).max(80), text: z.string().trim().min(10).max(500) })).min(1).max(4),
  players: z.array(z.object({ gamertag: z.string().trim().min(1), verdict: z.string().trim().min(5).max(320) })).max(5),
  advice: z.string().trim().min(10).max(600),
  suggestedNote: z.string().trim().min(10).max(1500),
  suggestedTags: z.array(z.enum(NOTE_TAGS)).max(3),
  suggestedMotm: z.string().nullable(),
});

export type MatchDebrief = z.infer<typeof matchDebriefSchema>;

/** Contrat envoyé à Mistral : pas de maxLength (le décodage contraint coupe en plein mot), pas de tags. */
export const MATCH_DEBRIEF_JSON_SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: 'Titre de 4 à 9 mots, comme un gros titre de journal sportif. Sans le score.' },
    lede: { type: 'string', description: 'Chapô de 2 phrases : ce qui a fait le match, avec un ou deux chiffres de la feuille.' },
    keys: {
      type: 'array',
      description: 'Les 3 clés du match, chacune appuyée sur un chiffre fourni.',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '2 à 5 mots.' },
          text: { type: 'string', description: '1 ou 2 phrases courtes.' },
        },
        required: ['title', 'text'],
        additionalProperties: false,
      },
    },
    players: {
      type: 'array',
      description: '2 à 4 joueurs du FoodBall Club qui ont compté, en bien ou en mal.',
      items: {
        type: 'object',
        properties: {
          gamertag: { type: 'string', description: 'Gamertag recopié exactement depuis notre feuille de match.' },
          verdict: { type: 'string', description: 'Une phrase sur son match, appuyée sur ses chiffres.' },
        },
        required: ['gamertag', 'verdict'],
        additionalProperties: false,
      },
    },
    advice: { type: 'string', description: 'Un seul conseil concret pour le prochain match, en 1 ou 2 phrases.' },
    suggestedNote: { type: 'string', description: 'Note de vestiaire de 3 à 5 phrases, écrite par un joueur (« on »), sans titre.' },
  },
  required: ['headline', 'lede', 'keys', 'players', 'advice', 'suggestedNote'],
  additionalProperties: false,
} as const;

export const MATCH_DEBRIEF_SYSTEM = `Tu es le consultant du "FoodBall Club", un club de potes sur EA Sports FC (Clubs Pro). Tu écris le débrief d'un match pour le vestiaire.

Règles absolues :
- Tu n'utilises QUE les faits fournis : score, feuilles de match, notes du vestiaire. Si un détail n'y est pas, tu ne l'écris pas.
- Interdit d'inventer : minute d'un but, façon de marquer (tête, corner, penalty, frappe de loin, contre-attaque), tirs cadrés, erreur précise, blessure, ambiance, remontée au score. EA ne donne ni la chronologie ni la possession.
- Tu ne fais AUCUN calcul : tu recopies les chiffres et pourcentages tels qu'ils sont donnés.
- Le conseil se déduit des chiffres (tacles ratés, passes, tirs, notes), jamais d'une action de jeu supposée.
- Les gamertags et le nom de l'adversaire s'écrivent exactement comme dans les données, sans mise en forme.
- Texte brut uniquement : aucun astérisque, aucun markdown, aucun emoji, aucun hashtag, aucun titre dans les textes.
- Français naturel, phrases courtes et variées. Ton de consultant TV complice, piquant si le match le mérite, jamais lourd. Pas de jeux de mots forcés, pas de métaphore filée, pas de « les gars » à chaque phrase.
- Sois juste : une défaite se dit, un joueur à 5,5 de note ne se maquille pas, un adversaire parti avant la fin relativise la victoire. Critique le jeu, jamais la personne : pas de « à remplacer », pas de moquerie.
- Le ton reste proportionné au score : un 2-1 n'est ni un écrasement ni une démonstration.
- Chaque clé du match et chaque verdict s'appuient sur un chiffre fourni (note, buts, passes réussies, tacles, arrêts, tirs).

Exemple de ton (pour un autre match, ne pas recopier) :
headline : "Le réalisme avant la manière"
lede : "Huit tirs, trois buts : le FoodBall Club n'a pas eu besoin de beaucoup pour plier l'affaire. Derrière, 2 arrêts de Kikou_GK ont suffi à garder l'avance."
clé : { "title": "Efficacité clinique", "text": "3 buts sur 8 tirs, quand l'adversaire en a eu besoin de 14 pour en marquer un." }`;

/** Libellé lisible d'un poste pour le modèle. */
const POSITION_LABEL: Record<Position, string> = { GK: 'gardien', DF: 'défenseur', MF: 'milieu', FW: 'attaquant' };

export interface TeamTotals {
  players: number;
  goals: number;
  assists: number;
  shots: number;
  passesMade: number;
  passAttempts: number;
  /** Pourcentage de passes réussies, null sans tentative. */
  passPct: number | null;
  tacklesMade: number;
  tackleAttempts: number;
  tacklePct: number | null;
  saves: number;
  redCards: number;
  avgRating: number | null;
}

/** Chiffres du match, calculés depuis les feuilles EA : affichés tels quels et donnés au modèle. */
export interface MatchFacts {
  ours: TeamTotals;
  theirs: TeamTotals | null;
  /** Homme du match désigné par EA dans notre équipe, sinon notre meilleure note. */
  motm: { gamertag: string; rating: number; fromEa: boolean } | null;
  /** Buts marqués pour 10 tirs. */
  conversion: number | null;
  /** Tags que les faits autorisent (Clean sheet, Carton rouge). */
  factTags: NoteTag[];
}

const pct = (made: number, attempts: number) => (attempts > 0 ? Math.round((made / attempts) * 100) : null);

export function teamTotals(players: MatchPlayer[]): TeamTotals {
  const sum = (key: keyof MatchPlayer) => players.reduce((n, p) => n + (Number(p[key]) || 0), 0);
  const passesMade = sum('passesMade');
  const passAttempts = sum('passAttempts');
  const tacklesMade = sum('tacklesMade');
  const tackleAttempts = sum('tackleAttempts');
  const rated = players.filter((p) => p.rating > 0);
  return {
    players: players.length,
    goals: sum('goals'), assists: sum('assists'), shots: sum('shots'),
    passesMade, passAttempts, passPct: pct(passesMade, passAttempts),
    tacklesMade, tackleAttempts, tacklePct: pct(tacklesMade, tackleAttempts),
    saves: sum('saves'), redCards: sum('redCards'),
    avgRating: rated.length ? Math.round((rated.reduce((n, p) => n + p.rating, 0) / rated.length) * 10) / 10 : null,
  };
}

export function matchFacts(detail: Pick<MatchDetail, 'match' | 'players' | 'opponent'>): MatchFacts {
  const { match, players } = detail;
  const ours = teamTotals(players);
  const theirs = detail.opponent && detail.opponent.players.length > 0 ? teamTotals(detail.opponent.players) : null;
  const ea = players.find((p) => p.motm);
  const best = [...players].sort((a, b) => b.rating - a.rating)[0];
  const motm = ea ? { gamertag: ea.gamertag, rating: ea.rating, fromEa: true }
    : best && best.rating > 0 ? { gamertag: best.gamertag, rating: best.rating, fromEa: false } : null;
  const shots = match.shots ?? (ours.shots || null);
  const factTags: NoteTag[] = [];
  if (match.goalsAgainst === 0) factTags.push('Clean sheet');
  if (ours.redCards > 0 || (theirs?.redCards ?? 0) > 0) factTags.push('Carton rouge');
  return { ours, theirs, motm, conversion: shots ? Math.round((match.goalsFor / shots) * 100) / 10 : null, factTags };
}

const playerLine = (p: MatchPlayer, ours: boolean) => {
  const bits = [
    `${p.gamertag} (${POSITION_LABEL[p.position]})`,
    `note ${p.rating.toFixed(1)}`,
    p.goals ? `${p.goals} but${p.goals > 1 ? 's' : ''}` : null,
    p.assists ? `${p.assists} passe${p.assists > 1 ? 's' : ''} décisive${p.assists > 1 ? 's' : ''}` : null,
    `${p.shots} tir${p.shots > 1 ? 's' : ''}`,
    p.passAttempts ? `${p.passesMade} passes réussies sur ${p.passAttempts} (${pct(p.passesMade, p.passAttempts)} %)` : null,
    p.tackleAttempts ? `${p.tacklesMade} tacles réussis sur ${p.tackleAttempts}, ${p.tackleAttempts - p.tacklesMade} ratés` : null,
    p.position === 'GK' || p.saves ? `${p.saves} arrêt${p.saves > 1 ? 's' : ''}` : null,
    p.redCards ? 'carton rouge' : null,
    p.motm ? (ours ? 'HOMME DU MATCH EA' : 'homme du match EA') : null,
    p.leftEarly ? 'ce joueur seul a quitté le match avant la fin, pas son équipe' : null,
  ];
  return `- ${bits.filter(Boolean).join(', ')}`;
};

const totalsLine = (t: TeamTotals) => [
  `${t.goals} buts`, `${t.shots} tirs`,
  t.passPct !== null ? `${t.passPct} % de passes réussies (${t.passesMade} sur ${t.passAttempts})` : null,
  t.tacklePct !== null ? `${t.tacklePct} % de tacles réussis (${t.tacklesMade} sur ${t.tackleAttempts})` : null,
  `${t.saves} arrêts`, t.avgRating !== null ? `note moyenne ${t.avgRating.toFixed(1)}` : null,
].filter(Boolean).join(', ');

const names = (list: MatchPlayer[], key: 'goals' | 'assists') =>
  list.filter((p) => p[key] > 0).sort((a, b) => b[key] - a[key]).map((p) => (p[key] > 1 ? `${p.gamertag} (${p[key]})` : p.gamertag)).join(', ');

/** Phrases déjà justes, pour que le modèle n'ait rien à déduire (il confondait nos arrêts et ceux de l'adversaire). */
function safeFacts(detail: Pick<MatchDetail, 'match' | 'players' | 'opponent'>, facts: MatchFacts): string[] {
  const { match, players } = detail;
  const out: string[] = [];
  if (players.length) {
    out.push(`- Nos buteurs : ${names(players, 'goals') || 'aucun'}. Nos passeurs décisifs : ${names(players, 'assists') || 'aucun'}.`);
    const sorted = [...players].sort((a, b) => b.rating - a.rating);
    out.push(`- Meilleure note chez nous : ${sorted[0].gamertag} (${sorted[0].rating.toFixed(1)}). Plus faible : ${sorted.at(-1)!.gamertag} (${sorted.at(-1)!.rating.toFixed(1)}).`);
    if (!players.some((p) => p.position === 'GK')) out.push('- Nous jouions sans gardien humain : nous n’avons fait aucun arrêt, ne parle pas de nos arrêts.');
  }
  if (facts.motm) out.push(`- Homme du match : ${facts.motm.gamertag}${facts.motm.fromEa ? ', désigné par EA' : ', meilleure note'}. Personne d'autre.`);
  const ourShots = match.shots ?? facts.ours.shots;
  out.push(`- Nos tirs : ${ourShots}.${facts.theirs ? ` Leurs tirs : ${facts.theirs.shots}.` : ''} EA ne dit pas combien étaient cadrés : n'emploie jamais le mot « cadré ».`);
  if (facts.theirs?.saves) out.push(`- Leur gardien a repoussé ${facts.theirs.saves} de nos tirs (ce sont SES arrêts, pas les nôtres).`);
  if (detail.opponent) {
    const scorers = names(detail.opponent.players, 'goals');
    if (scorers) out.push(`- Buteur(s) adverse(s) : ${scorers}.`);
  }
  out.push(match.goalsAgainst === 0 ? '- Aucun but encaissé.' : `- Buts encaissés : ${match.goalsAgainst}.`);
  return out;
}

export function buildMatchDebriefPrompt(detail: MatchDetail, notes: MatchNote[]): string {
  const { match } = detail;
  const facts = matchFacts(detail);
  const resultWord = match.result === 'win' ? 'Victoire' : match.result === 'loss' ? 'Défaite' : 'Match nul';
  const competition = match.type === 'playoff' ? 'Playoffs' : match.type === 'friendly' ? 'Amical' : 'Championnat (ligue)';
  const lines: string[] = [
    'LE MATCH',
    `- ${resultWord} ${match.goalsFor}-${match.goalsAgainst} contre ${match.opponent} (${competition})`,
    `- Date : ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'full', timeZone: 'Europe/Paris' }).format(new Date(match.playedAt))}`,
  ];
  if (match.ourSkillRating && match.opponentSkillRating) {
    const diff = match.opponentSkillRating - match.ourSkillRating;
    lines.push(`- Skill rating : nous ${match.ourSkillRating}, eux ${match.opponentSkillRating} (${diff > 0 ? `adversaire plus fort de ${diff}` : diff < 0 ? `adversaire plus faible de ${-diff}` : 'même niveau'})`);
  }
  if (match.opponentQuit) lines.push("- L'adversaire a quitté le match avant la fin.");
  if (detail.opponent?.minutes) lines.push(`- Minutes jouées : ${detail.opponent.minutes}`);
  if (facts.conversion !== null) lines.push(`- Réalisme : ${Math.round(facts.conversion * 10)} % de nos tirs ont fini au fond`);

  lines.push('', 'FAITS SÛRS (à reprendre tels quels, sans les modifier)', ...safeFacts(detail, facts));

  lines.push('', 'NOTRE ÉQUIPE (FoodBall Club)');
  if (detail.players.length) {
    lines.push(`- Total : ${totalsLine(facts.ours)}`, ...detail.players.map((p) => playerLine(p, true)));
  } else {
    lines.push(`- Feuille de match indisponible. Tirs : ${match.shots ?? 'inconnus'}.`);
  }
  if (facts.motm) lines.push(`- Homme du match retenu : ${facts.motm.gamertag} (${facts.motm.fromEa ? 'désigné par EA' : 'meilleure note'})`);

  if (facts.theirs && detail.opponent) {
    lines.push('', `ADVERSAIRE (${match.opponent})`, `- Total : ${totalsLine(facts.theirs)}${facts.theirs.saves ? ` (leurs arrêts = nos tirs repoussés)` : ''}`, ...detail.opponent.players.map((p) => playerLine(p, false)));
  }

  const previous = (detail.headToHead ?? []).filter((m) => m.id !== match.id).slice(0, 5);
  if (previous.length) {
    lines.push('', 'CONFRONTATIONS PRÉCÉDENTES', `- ${previous.map((m) => `${m.goalsFor}-${m.goalsAgainst}`).join(', ')} (du plus récent au plus ancien)`);
  }
  if (detail.opponentClub) {
    const c = detail.opponentClub;
    lines.push('', 'FICHE DU CLUB ADVERSE', `- ${c.wins} V, ${c.draws} N, ${c.losses} D sur ${c.gamesPlayed} matchs${c.winStreak > 1 ? `, série de ${c.winStreak} victoires` : ''}`);
  }

  lines.push('', 'NOTES DU VESTIAIRE (ce que les joueurs ont vu, seule source pour les faits de jeu)');
  lines.push(...(notes.length
    ? notes.map((n) => `- ${n.authorName} : "${n.body}"${n.tags.length ? ` (tags : ${n.tags.join(', ')})` : ''}`)
    : ['- Aucune note.']));

  lines.push('', 'Rédige le débrief au format JSON demandé.');
  return lines.join('\n');
}

/** Retire ce que le modèle glisse malgré la consigne : markdown, emojis, hashtags, guillemets d'enrobage. */
export function plainText(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/gs, '$1')
    .replace(/__(.+?)__/gs, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/^\s*[-•]\s+/gm, '')
    .replace(/(^|\s)#[\p{L}\p{N}_]+/gu, '$1')
    .replace(/\p{Extended_Pictographic}️?/gu, '')
    .replace(/[*_`]/g, '')
    .replace(/^["«»“”\s]+|["«»“”\s]+$/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([,.])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Sortie du modèle, avant que le code tranche tags et homme du match. */
type Drafted = Omit<MatchDebrief, 'suggestedTags' | 'suggestedMotm'>;

/** Gamertag connu (casse exacte), ou null : un joueur inventé décrédibiliserait tout le débrief. */
function knownGamertag(name: string, sheet: string[]): string | null {
  const wanted = plainText(name).toLowerCase();
  return sheet.find((g) => g.toLowerCase() === wanted) ?? null;
}

/** Nettoie le texte, écarte les joueurs inconnus, puis tranche tags et homme du match à partir des faits. */
export function sanitizeMatchDebrief(data: Drafted, detail: Pick<MatchDetail, 'match' | 'players' | 'opponent'>, notes: MatchNote[], members: Member[]): MatchDebrief {
  const facts = matchFacts(detail);
  const sheet = detail.players.length ? detail.players.map((p) => p.gamertag) : members.map((m) => m.gamertag);
  const seen = new Set<string>();
  const players = data.players.flatMap((p) => {
    const gamertag = knownGamertag(p.gamertag, sheet);
    if (!gamertag || seen.has(gamertag)) return [];
    seen.add(gamertag);
    const verdict = plainText(p.verdict);
    return verdict ? [{ gamertag, verdict }] : [];
  }).slice(0, 4);

  // Tags : seulement ce que les faits prouvent ou ce que le vestiaire a déjà mis.
  const noteTags = notes.flatMap((n) => n.tags).filter((t): t is NoteTag => NOTE_TAGS.includes(t as NoteTag));
  const suggestedTags = [...new Set([...facts.factTags, ...noteTags])].slice(0, 3);

  return {
    headline: plainText(data.headline).replace(/\s*[.!]+$/, ''),
    lede: plainText(data.lede),
    keys: data.keys.map((k) => ({ title: plainText(k.title).replace(/\s*[.:]+$/, ''), text: plainText(k.text) })).filter((k) => k.title && k.text).slice(0, 3),
    players,
    advice: plainText(data.advice),
    suggestedNote: plainText(data.suggestedNote),
    suggestedTags,
    suggestedMotm: facts.motm && members.some((m) => m.gamertag === facts.motm!.gamertag) ? facts.motm.gamertag : null,
  };
}

/** Schéma de la sortie brute du modèle (avant tags et MOTM). */
export const draftedDebriefSchema = matchDebriefSchema.omit({ suggestedTags: true, suggestedMotm: true });

