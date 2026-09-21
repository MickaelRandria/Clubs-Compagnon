import { z } from 'zod';
import { NOTE_TAGS, type NoteTag } from './notes.js';
import type { Match, MatchNote, Member } from './types.js';

export const matchDebriefSchema = z.object({
  headline: z.string().trim().min(3).max(120),
  summary: z.string().trim().min(20).max(800),
  advice: z.string().trim().min(10).max(400),
  suggestedNote: z.string().trim().min(10).max(1000),
  suggestedTags: z.array(z.enum(NOTE_TAGS)).max(3),
  suggestedMotm: z.string().nullable(),
});

export type MatchDebrief = z.infer<typeof matchDebriefSchema>;

export const MATCH_DEBRIEF_JSON_SCHEMA = {
  type: 'object',
  properties: {
    headline: {
      type: 'string',
      description: 'Titre accrocheur façon téléfoot ou gros titre vestiaire (ex: "Hold-up glacial à Anfield", "Domination stérile face au bus").',
    },
    summary: {
      type: 'string',
      description: 'Analyse synthétique en 2-3 phrases qui confronte la possession, le nombre de tirs, le réalisme et le score final.',
    },
    advice: {
      type: 'string',
      description: 'Conseil tactique concret pour les prochaines rencontres (ex: "Plus de verticalité dans les 30 derniers mètres").',
    },
    suggestedNote: {
      type: 'string',
      description: 'Proposition de note de match rédigée pour le vestiaire, prête à être validée ou modifiée par un joueur.',
    },
    suggestedTags: {
      type: 'array',
      items: {
        type: 'string',
        enum: NOTE_TAGS,
      },
      description: 'Sélection des 1 à 3 tags les plus pertinents parmi la liste autorisée.',
    },
    suggestedMotm: {
      type: ['string', 'null'],
      description: 'Gamertag du joueur qui mérite le titre d’homme du match d’après les commentaires et stats, ou null.',
    },
  },
  required: ['headline', 'summary', 'advice', 'suggestedNote', 'suggestedTags', 'suggestedMotm'],
  additionalProperties: false,
} as const;

export const MATCH_DEBRIEF_SYSTEM = `Tu es l'analyste vidéo et coach adjoint de "Dommage BJ FC", un club passionné évoluant sur EA Sports FC Clubs (Club Pro).
Ton rôle :
1. Analyser le match avec un regard tactique et percutant façon consultant TV / vestiaire de potes.
2. Tirer les enseignements clés des chiffres : rapport possession / tirs, efficacité devant le but, clean sheet ou fébrilité défensive.
3. Rédiger une analyse rythmée en français, sans langue de bois ni métaphores creuses.
4. Proposer une note de vestiaire crédible et dynamique, avec tags adaptés parmi ceux imposés : ${NOTE_TAGS.join(', ')}.
Si aucun joueur ne se dégage clairement pour l'homme du match, mets null.`;

export function buildMatchDebriefPrompt(
  match: Match,
  members: Member[],
  notes: MatchNote[],
): string {
  const resultWord = match.result === 'win' ? 'Victoire' : match.result === 'loss' ? 'Défaite' : 'Match nul';
  const possDommage = match.possessionPct !== null ? `${match.possessionPct}%` : 'non renseignée';
  const shotsDommage = match.shots !== null ? `${match.shots}` : 'non renseignés';

  const notesSummary = notes.length > 0
    ? notes.map((n) => `- Par ${n.authorName} : "${n.body}" (MOTM : ${n.motm?.gamertag ?? 'aucun'}, Tags : ${n.tags.join(', ') || 'aucun'})`).join('\n')
    : 'Aucune note de vestiaire enregistrée pour ce match.';

  const squadList = members.map((m) => `${m.gamertag} (${m.position}, OVR ${m.ovr})`).join(', ');

  return `MATCH À ANALYSER :
- Adversaire : ${match.opponent}
- Compétition : ${match.type === 'playoff' ? 'Playoffs' : 'Championnat Club Pro'}
- Résultat final : ${resultWord} (${match.goalsFor} - ${match.goalsAgainst})
- Possession Dommage FC : ${possDommage} (Adversaire : ${match.possessionPct !== null ? 100 - match.possessionPct + '%' : 'inconnue'})
- Tirs Dommage FC : ${shotsDommage}
- Date du match : ${match.playedAt}

NOTES EXISTANTES DU VESTIAIRE :
${notesSummary}

EFFECTIF DISPONIBLE (Gamertags) :
${squadList}

Rédige le débriefing au format JSON requis.`;
}

/** Nettoie et fiabilise le débrief généré par le modèle. */
export function sanitizeMatchDebrief(data: MatchDebrief, members: Member[]): MatchDebrief {
  let motm = data.suggestedMotm?.trim() || null;
  if (motm) {
    const exact = members.find((m) => m.gamertag.toLowerCase() === motm!.toLowerCase());
    if (exact) {
      motm = exact.gamertag;
    } else {
      const partial = members.find(
        (m) =>
          m.gamertag.toLowerCase().includes(motm!.toLowerCase()) ||
          motm!.toLowerCase().includes(m.gamertag.toLowerCase()),
      );
      motm = partial ? partial.gamertag : null;
    }
  }

  // Filtrer les tags sur la liste stricte
  const validTags = data.suggestedTags.filter((t): t is NoteTag => NOTE_TAGS.includes(t as NoteTag)).slice(0, 3);

  return {
    headline: data.headline.slice(0, 120),
    summary: data.summary.slice(0, 800),
    advice: data.advice.slice(0, 400),
    suggestedNote: data.suggestedNote.slice(0, 1000),
    suggestedTags: validTags,
    suggestedMotm: motm,
  };
}
