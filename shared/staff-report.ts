import { z } from 'zod';
import { ATTRIBUTES, archetypeById, formatSignature } from './data/archetypes.js';
import { AI_LINES, CLUB_POLICY } from './data/club-policy.js';
import { POSITION_LABELS, type FC27Player } from './fc27.js';
import { profileFromPlayer } from './fc27-player.js';
import { analyzeSquad } from './tacticalAdvisor.js';

// Lecture du staff : une analyse rédigée par un modèle, posée SUR les faits du moteur déterministe.
// Le moteur reste seul juge du score, de la formation et des manques ; le modèle ne fait que les lire
// et en tirer des priorités et des conseils croisés. Il ne renvoie jamais un chiffre affiché tel quel.

/**
 * Budgets de longueur, en caractères. Ce sont des **préférences de mise en page**, annoncées
 * au modèle dans le prompt — pas des règles de correction.
 *
 * Les bornes zag en dessous ne sont qu'un garde-fou contre une sortie manifestement cassée
 * (un dump de plusieurs milliers de caractères). Un modèle léger écrit régulièrement 30 %
 * plus long que demandé : jeter une analyse juste pour ça serait absurde, et la mise en page
 * absorbe très bien un texte un peu long. Marge large, donc, et volontairement.
 */
export const BUDGETS = { headline: 110, reading: 700, need: 60, why: 280, stopgap: 180, advice: 260 } as const;
const MARGIN = 2.5;
const bounded = (min: number, budget: number) => z.string().trim().min(min).max(Math.round(budget * MARGIN));
/** `reading` a déjà un budget large : une marge de 2,5× n'aurait plus aucun sens comme garde-fou. */
const boundedReading = z.string().trim().min(40).max(1600);

export const staffReportSchema = z.object({
  /** Une phrase qui nomme ce que raconte l'effectif actuel. */
  headline: bounded(10, BUDGETS.headline),
  /** Deux à quatre phrases : ce que la composition permet, et ce qu'elle coûte. */
  reading: boundedReading,
  /** Manques classés par urgence, avec une solution de dépannage quand elle existe. */
  priorities: z.array(z.object({
    need: bounded(3, BUDGETS.need),
    why: bounded(10, BUDGETS.why),
    stopgap: bounded(0, BUDGETS.stopgap).nullable(),
  })).min(1).max(4),
  /** Conseils individuels qui tiennent compte des coéquipiers, pas seulement du poste. */
  players: z.array(z.object({
    pseudo: z.string().trim().min(1).max(40),
    advice: bounded(10, BUDGETS.advice),
  })).max(16),
});
export type StaffReport = z.infer<typeof staffReportSchema>;

/**
 * Empreinte de l'effectif : tout ce qui change l'analyse, et rien d'autre.
 * Deux effectifs identiques donnent la même empreinte, donc la même analyse en cache ;
 * la moindre fiche modifiée ou ajoutée en produit une nouvelle.
 */
export function squadFingerprint(players: FC27Player[]): string {
  const rows = players
    .map((p) => [
      p.id, p.pseudo, p.in_game_name ?? '', p.primary_position, [...p.secondary_positions].sort().join('+'),
      p.archetype ?? '', p.height_cm ?? '', p.weight_kg ?? '', p.preferred_foot ?? '',
      p.weak_foot ?? '', p.skill_moves ?? '', (p.attribute_priorities ?? []).join('>'), p.notes ?? '',
    ].join('|'))
    .sort();
  // djb2 : suffisant pour une clé de cache, jamais utilisé pour de la sécurité.
  let hash = 5381;
  // Invalide aussi les rapports antérieurs à la politique de club, à effectif identique.
  const text = ['staff-v2', [...AI_LINES].sort().join(','), ...rows].join('\n');
  for (let i = 0; i < text.length; i += 1) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  return `${players.length}-${hash.toString(36)}`;
}

/** Fiche d'un joueur, telle que le modèle doit la lire : lisible, sans jargon interne. */
function describePlayer(player: FC27Player): string {
  const archetype = archetypeById(player.archetype);
  const parts = [
    `${player.in_game_name || player.pseudo} (pseudo ${player.pseudo})`,
    `${player.primary_position} ${POSITION_LABELS[player.primary_position]}`,
  ];
  if (player.secondary_positions.length > 0) parts.push(`peut dépanner en ${player.secondary_positions.join(' et ')}`);
  if (archetype) {
    parts.push(`archétype ${archetype.name} — ${archetype.specialty}`);
    parts.push(`PlayStyle ${formatSignature(archetype).fr}`);
    parts.push(`attributs clés ${archetype.keyAttributes.map((k) => ATTRIBUTES[k].label).join(' et ')}`);
  } else {
    parts.push('archétype non choisi');
  }
  if (player.height_cm) parts.push(`${player.height_cm} cm, ${player.weight_kg} kg`);
  if (player.preferred_foot) parts.push(`pied ${player.preferred_foot.toLowerCase()}`);
  if (player.weak_foot !== null) parts.push(`mauvais pied ${player.weak_foot}/5`);
  if (player.skill_moves !== null) parts.push(`gestes ${player.skill_moves}/5`);
  if (player.notes?.trim()) parts.push(`note perso : ${player.notes.trim()}`);
  return `- ${parts.join(' · ')}`;
}

/** Consigne fixe : elle ne dépend pas de l'effectif, ce qui la rend cachable côté fournisseur. */
export const STAFF_SYSTEM = [
  'Tu es l’entraîneur adjoint d’un club amateur de EA SPORTS FC 27 en mode Clubs.',
  'Tu t’adresses aux joueurs du club, en français, en les tutoyant. Ton direct, concret, sans flatterie ni jargon de consultant.',
  '',
  ...(AI_LINES.length > 0 ? [
    `IMPORTANT — ${CLUB_POLICY.label}. ${CLUB_POLICY.why}`,
    'Ne réclame donc JAMAIS un gardien ou un défenseur : ce n’est pas un manque, c’est le fonctionnement du club.',
    'Ne présente pas non plus l’IA de derrière comme une catastrophe. Raisonne avec elle : quels postes de milieu',
    'et d’attaque limitent le travail qu’elle aura à faire, et comment le collectif compense devant.',
    '',
  ] : []),
  'Un moteur d’analyse déterministe a déjà calculé le score de synergie, la formation conseillée et la liste des manques.',
  'Ces chiffres sont la vérité : ne les recalcule pas, ne les contredis pas, ne les répète pas tels quels.',
  'Ton travail est d’expliquer ce que la composition produit concrètement sur le terrain, et de hiérarchiser ce qui manque.',
  '',
  'Règles strictes :',
  '- N’invente aucun joueur. N’utilise que les pseudos exacts de la liste fournie.',
  '- Tu n’as AUCUNE donnée statistique. N’invente jamais de chiffre : pas de « 3 buts par match »,',
  '  pas de pourcentage, pas de moyenne, pas de coût de point, pas de palier de niveau.',
  '- N’utilise aucun formatage : pas de gras, pas d’astérisques, pas de markdown, pas de titres.',
  '  Ton texte est affiché tel quel dans une page ; un astérisque s’y verrait.',
  '- Si l’effectif est trop petit pour conclure, dis-le franchement plutôt que de meubler.',
  '- Une priorité doit nommer un poste ou un profil précis, jamais « renforcer le milieu ».',
  '- Le dépannage (stopgap) ne cite qu’un joueur déjà présent, et seulement si c’est crédible. Sinon null.',
  '- Les conseils individuels doivent tenir compte des coéquipiers : qui couvre qui, qui cherche qui.',
].join('\n');

/** Le message qui change à chaque composition : faits du moteur, puis l'effectif. */
export function buildStaffPrompt(players: FC27Player[]): string {
  const analysis = analyzeSquad(players.map(profileFromPlayer));
  const lines = [
    '## Faits calculés par le moteur (à ne pas recalculer)',
    `Score de synergie : ${analysis.synergyScore}/100`,
    `Formation conseillée : ${analysis.playstyleIdentity.recommendedFormation}`,
    `Identité : ${analysis.playstyleIdentity.title} — ${analysis.playstyleIdentity.description}`,
    analysis.squadDeficits.length > 0
      ? `Manques détectés :\n${analysis.squadDeficits.map((d) => `- ${d}`).join('\n')}`
      : 'Manques détectés : aucun manque majeur.',
    '',
    `## Effectif (${players.length} fiche${players.length > 1 ? 's' : ''})`,
    players.length > 0 ? players.map(describePlayer).join('\n') : '- Aucune fiche pour le moment.',
    '',
    '## Ce que tu dois produire',
    'Un objet JSON conforme au schéma imposé :',
    `- headline : UNE phrase courte qui nomme ce que raconte cet effectif. ${BUDGETS.headline} caractères maximum, compte-les.`,
    `- reading : deux à quatre phrases sur ce que cette composition permet et ce qu’elle coûte en match. ${BUDGETS.reading} caractères maximum.`,
    '- priorities : les manques classés du plus urgent au moins urgent.',
    `  need = UNIQUEMENT le poste ou le profil recherché, comme une petite annonce. ${BUDGETS.need} caractères maximum.`,
    '         Bon : « Un défenseur central ». « Un gardien ». « Un latéral gauche rapide ».',
    '         Mauvais : « Un gardien humain pour sécuriser les arrêts et gérer le jeu de pied » — ça, c’est le why.',
    `  why = la situation de match que ce manque provoque, pas la reformulation du manque (${BUDGETS.why} caractères maximum).`,
    `  stopgap = un joueur déjà présent qui peut dépanner, nommé par son pseudo, ou null. ${BUDGETS.stopgap} caractères maximum.`,
    `- players : un conseil par joueur, avec son pseudo exact, ${BUDGETS.advice} caractères maximum chacun.`,
    `  ${players.length > 12 ? 'Limite-toi aux douze joueurs les plus concernés.' : 'Couvre tout le monde.'}`,
    '',
    'Respecte ces budgets de caractères, et termine toujours tes phrases : une phrase coupée est inutilisable.',
  ];
  return lines.join('\n');
}

/**
 * Schéma JSON envoyé au fournisseur pour contraindre le décodage.
 *
 * ⚠ NE PAS y remettre `maxLength`. Le décodage contraint ne raccourcit pas le texte :
 * il le COUPE au caractère près, en plein milieu d'un mot (« on peut exploser en contre
 * avec deux but »). Constaté en vrai sur ministral-8b le 2026-09-19.
 * Les budgets de longueur sont annoncés au modèle dans le prompt, et `staffReportSchema`
 * les borne avec une marge : une phrase entière un peu longue vaut mieux qu'une phrase coupée.
 */
export const STAFF_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['headline', 'reading', 'priorities', 'players'],
  properties: {
    headline: { type: 'string' },
    reading: { type: 'string' },
    priorities: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['need', 'why', 'stopgap'],
        properties: {
          need: { type: 'string' },
          why: { type: 'string' },
          stopgap: { type: ['string', 'null'] },
        },
      },
    },
    players: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['pseudo', 'advice'],
        properties: { pseudo: { type: 'string' }, advice: { type: 'string' } },
      },
    },
  },
} as const;

/**
 * Retire le formatage markdown que les modèles glissent malgré la consigne.
 * Le texte est inséré tel quel dans la page : un « **défensivement nue** » y apparaîtrait
 * avec ses astérisques. Constaté sur ministral-14b le 2026-09-19.
 */
function plain(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/^\s*#+\s*/gm, '')
    .replace(/[*_`]/g, '')
    .replace(/[ 	]{2,}/g, ' ')
    .trim();
}

/**
 * Un dépannage n'est retenu que s'il nomme quelqu'un de l'effectif.
 * Les modèles déforment les pseudos proches (« fdsf » pour « dsfds », vu sur ministral-14b) :
 * un dépannage qui désigne un joueur inexistant ferait passer tout le rapport pour du remplissage.
 * Dans le doute, pas de dépannage.
 */
function keptStopgap(stopgap: string | null, players: FC27Player[]): string | null {
  if (stopgap === null) return null;
  const text = plain(stopgap);
  if (text === '') return null;
  const haystack = text.toLowerCase();
  const names = players.flatMap((p) => [p.pseudo, p.in_game_name ?? ''].filter((n) => n.trim().length >= 3));
  return names.some((name) => haystack.includes(name.toLowerCase())) ? text : null;
}

/**
 * Nettoie la sortie du modèle avant affichage : on ne fait confiance à rien.
 * Les conseils visant un joueur inconnu sont écartés — un pseudo inventé ferait passer
 * tout le rapport pour du remplissage.
 */
export function sanitizeReport(report: StaffReport, players: FC27Player[]): StaffReport {
  const known = new Set(players.map((p) => p.pseudo));
  const seen = new Set<string>();
  return {
    headline: plain(report.headline),
    reading: plain(report.reading),
    priorities: report.priorities.map((priority) => ({
      need: plain(priority.need),
      why: plain(priority.why),
      stopgap: keptStopgap(priority.stopgap, players),
    })),
    players: report.players
      .filter((entry) => {
        if (!known.has(entry.pseudo) || seen.has(entry.pseudo)) return false;
        seen.add(entry.pseudo);
        return true;
      })
      .map((entry) => ({ pseudo: entry.pseudo, advice: plain(entry.advice) })),
  };
}
