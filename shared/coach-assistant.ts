import { z } from 'zod';
import type { Club, Member } from './types.js';

export const coachActionSchema = z.object({
  label: z.string().trim().min(2).max(50),
  to: z.string().trim().min(1).max(100),
});

export type CoachAction = z.infer<typeof coachActionSchema>;

export const coachResponseSchema = z.object({
  reply: z.string().trim().min(5).max(1500),
  action: coachActionSchema.nullable(),
  suggestedQuestions: z.array(z.string().trim().min(3).max(100)).max(3),
});

export type CoachResponse = z.infer<typeof coachResponseSchema>;

export const COACH_JSON_SCHEMA = {
  type: 'object',
  properties: {
    reply: {
      type: 'string',
      description: 'Réponse concise, chaleureuse et structurée (markdown léger autorisé : **gras**, puces). Ton vestiaire / coach bienveillant mais précis.',
    },
    action: {
      type: ['object', 'null'],
      properties: {
        label: { type: 'string', description: 'Libellé court du bouton d’action (ex: "Ouvrir Mon Profil", "Voter pour le nom FC 27", "Voir les Buteurs").' },
        to: { type: 'string', description: 'Chemin interne dans l’app : /profil, /fc27/nom, /fc27, /joueurs, /matchs, /stats, ou /playoffs.' },
      },
      required: ['label', 'to'],
      additionalProperties: false,
      description: 'Action de navigation recommandée pour diriger directement l’utilisateur vers la bonne page, ou null si non pertinent.',
    },
    suggestedQuestions: {
      type: 'array',
      items: { type: 'string' },
      description: '2 à 3 questions de suite rapides et pertinentes que l’utilisateur pourrait vouloir poser.',
    },
  },
  required: ['reply', 'action', 'suggestedQuestions'],
  additionalProperties: false,
} as const;

export const COACH_SYSTEM = `Tu es le "Coach IA" officiel du club "Dommage BJ FC" sur EA Sports FC Clubs.
Ton but principal est d'aider les joueurs et visiteurs à utiliser l'application et à trouver ce qu'ils cherchent immédiatement.

CARTOGRAPHIE COMPLÈTE DE L'APPLICATION :
- **/profil** : Page personnelle. Permet de se connecter avec son compte Discord, de lier son profil joueur parmi l'effectif du club, de consulter ses statistiques individuelles (OVR, buts, passes) et son statut d'administration.
- **/fc27** : Hub de préparation de la saison prochaine sur FC 27. Permet de consulter l'effectif préparatoire et l'analyse tactique du staff.
- **/fc27/nom** : Espace de vote et de propositions pour le futur nom officiel du club sur FC 27.
- **/joueurs** : Annuaire des joueurs du club, fiches détaillées, filtres par poste (ATT, MIL, DEF, GB) et classements (buteurs, passeurs, OVR).
- **/matchs** : Historique des matchs de championnat et playoffs. En cliquant sur un match (/matchs/:id), on accède aux statistiques détaillées (possession, tirs), à l'analyse tactique "L'œil du Coach" et à l'espace notes de vestiaire.
- **/stats** : Statistiques globales du club (Skill Rating, courbe des 30 derniers jours, bilans victoires/nuls/défaites, moyennes de buts).
- **/playoffs** : Rétrospective de la soirée LAN Playoffs, récit épique du tournoi et galerie de photos souvenir.

DIRECTIVES :
1. Reste concis (1 à 3 petits paragraphes max), percutant, avec l'esprit d'un coach de vestiaire complice.
2. Si la question concerne une fonctionnalité de l'application, inclus TOUJOURS un bouton d'action pertinent (champ \`action\`) pointant vers le bon chemin interne.
3. Si la question porte sur les statistiques du club ou les joueurs, appuie-toi sur les données réelles fournies dans le contexte.
4. RÈGLE CRITIQUE — INTERDICTION ABSOLUE DES PLACEHOLDERS : Tu ne dois JAMAIS utiliser de placeholders ou de textes génériques comme "[Nom Joueur]", "[Nom Joueur 1]", "[Joueur X]", etc. Utilise EXCLUSIVEMENT les vrais gamertags et les vraies statistiques de l'effectif listé ci-dessous. Si une statistique demandée n'existe pas, dis-le clairement plutôt que d'inventer.
5. Réponds toujours en français.`;

export function buildCoachPrompt(
  question: string,
  club: Club | null,
  members: Member[],
  history?: { role: 'user' | 'assistant'; content: string }[],
): string {
  let clubContext = 'Données du club non disponibles.';
  if (club) {
    const topScorer = [...members].sort((a, b) => b.goals - a.goals)[0];
    const topAssister = [...members].sort((a, b) => b.assists - a.assists)[0];
    const topOvr = [...members].sort((a, b) => b.ovr - a.ovr)[0];

    const squadList = members
      .map(
        (m) =>
          `- ${m.gamertag} (${m.position}, OVR ${m.ovr}) : ${m.goals} buts, ${m.assists} passes en ${m.matchesPlayed} matchs`,
      )
      .join('\n');

    clubContext = `CONTEXTE ACTUEL DU CLUB :
- Nom : ${club.name}
- Matchs joués : ${club.gamesPlayed} (${club.wins} victoires, ${club.draws} nuls, ${club.losses} défaites)
- Meilleure division atteinte : Division ${club.bestDivision}
- Skill Rating : ${club.skillRating} points
- Buts marqués : ${club.goalsFor} | Buts encaissés : ${club.goalsAgainst}
- Meilleur buteur : ${topScorer ? `${topScorer.gamertag} (${topScorer.goals} buts en ${topScorer.matchesPlayed} matchs)` : 'N/A'}
- Meilleur passeur : ${topAssister ? `${topAssister.gamertag} (${topAssister.assists} passes)` : 'N/A'}
- Plus gros OVR : ${topOvr ? `${topOvr.gamertag} (OVR ${topOvr.ovr})` : 'N/A'}
- Effectif actif (${members.length} joueurs) :
${squadList}`;
  }

  const historyContext = history && history.length > 0
    ? `HISTORIQUE RÉCENT :\n` + history.slice(-4).map((h) => `${h.role === 'user' ? 'Joueur' : 'Coach'} : ${h.content}`).join('\n') + '\n'
    : '';

  return `${clubContext}\n\n${historyContext}QUESTION DU JOUEUR :\n"${question}"\n\nRédige la réponse au format JSON attendu. N'invente aucun joueur, cite les vrais noms de l'effectif.`;
}

/** Réponses de repli déterministes si Mistral est injoignable ou non configuré. */
export function getDeterministicCoachFallback(question: string, club: Club | null, members: Member[]): CoachResponse {
  const q = question.toLowerCase();

  if (q.includes('discord') || q.includes('lier') || q.includes('compte') || q.includes('profil') || q.includes('rattacher')) {
    return {
      reply: "Pour rattacher ton compte Discord et réclamer ton joueur Club Pro, rends-toi sur la page **Mon Profil**. Connecte-toi via Discord, puis choisis ton gamertag dans la liste de l'effectif. Les capitaines valideront ensuite ta demande !",
      action: { label: 'Ouvrir Mon Profil', to: '/profil' },
      suggestedQuestions: ['Comment voter pour FC 27 ?', 'Qui est notre meilleur buteur ?'],
    };
  }

  if (q.includes('vote') || q.includes('nom') || q.includes('fc27') || q.includes('fc 27') || q.includes('saison')) {
    return {
      reply: "La préparation du prochain opus FC 27 est en cours ! Tu peux voter pour le nouveau nom du club et soumettre ta propre idée de nom dans l'espace dédié.",
      action: { label: 'Voter pour le nom FC 27', to: '/fc27/nom' },
      suggestedQuestions: ['Comment préparer ma fiche joueur ?', 'Quel est le bilan du club ?'],
    };
  }

  if (q.includes('buteur') || q.includes('passeur') || q.includes('joueur') || q.includes('effectif') || q.includes('ovr')) {
    const topScorer = members.length > 0 ? [...members].sort((a, b) => b.goals - a.goals)[0] : null;
    const topScorerText = topScorer ? `Notre goleador actuel est **${topScorer.gamertag}** avec **${topScorer.goals} buts** au compteur.` : '';
    return {
      reply: `${topScorerText} Tu peux retrouver l'ensemble des fiches joueurs, les ratios de passes et le classement complet dans la section **Joueurs**.`,
      action: { label: 'Voir l’effectif et buteurs', to: '/joueurs' },
      suggestedQuestions: ['Quel est notre bilan général ?', 'Comment voir les matchs ?'],
    };
  }

  if (q.includes('stats') || q.includes('bilan') || q.includes('classement') || q.includes('skill') || q.includes('division')) {
    const statsText = club
      ? `Dommage BJ FC affiche un bilan de **${club.wins}V / ${club.draws}N / ${club.losses}D** pour **${club.gamesPlayed} matchs** disputés, avec un Skill Rating de **${club.skillRating} pts** (Meilleure division : ${club.bestDivision}).`
      : 'Le club continue d’écrire son histoire sur le terrain !';
    return {
      reply: `${statsText} Retrouve toutes les métriques détaillées et la progression sur 30 jours dans l'onglet **Stats**.`,
      action: { label: 'Consulter les Stats', to: '/stats' },
      suggestedQuestions: ['Qui est le meilleur buteur ?', 'Où revoir la soirée LAN ?'],
    };
  }

  if (q.includes('lan') || q.includes('playoff') || q.includes('soiree') || q.includes('photo')) {
    return {
      reply: "La légendaire soirée LAN Playoffs du club est immortalisée dans l'onglet **Playoffs** ! Tu y trouveras le récapitulatif du tournoi ainsi que la galerie photos complète.",
      action: { label: 'Voir la soirée Playoffs', to: '/playoffs' },
      suggestedQuestions: ['Quel est le bilan du club ?', 'Comment lier mon compte Discord ?'],
    };
  }

  return {
    reply: "Je suis là pour t'accompagner sur l'app de Dommage BJ FC ! Tu peux naviguer entre le **Dashboard**, les fiches **Joueurs**, l'historique des **Matchs**, les **Stats** du club, la **LAN Playoffs** et la préparation **FC 27**.",
    action: { label: 'Voir le Dashboard', to: '/' },
    suggestedQuestions: ['Comment lier mon profil Discord ?', 'Qui est notre meilleur buteur ?', 'Comment voter pour FC 27 ?'],
  };
}

