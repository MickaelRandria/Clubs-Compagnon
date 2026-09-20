import type { GuideStep } from './tour';

export const PLAYER_TOUR_KEY = 'dommage.player-tour.v1';

interface PlayerTourStep extends GuideStep {
  page: 0 | 1;
  advanced?: boolean;
}

export const PLAYER_TOUR_STEPS: readonly PlayerTourStep[] = [
  {
    id: 'identity', page: 0, target: '[data-player-guide="identity"]', placement: 'right',
    title: 'Ton identité dans le vestiaire',
    body: 'Choisis ton pseudo, le nom sur ton maillot et un numéro libre de 1 à 99. Ta fiche est liée à ton compte Discord : tu la retrouveras à ta prochaine connexion. Cette visite conserve tes choix et te ramène ensuite à ton formulaire.',
  },
  {
    id: 'jersey', page: 0, target: '.fc27-jersey-card', placement: 'left',
    title: 'Ton maillot prend forme',
    body: 'Le nom et le numéro apparaissent ici au fil de ta saisie. Si le numéro est déjà pris, une alerte te le signale. Le 65 est le général de départ affiché pour tous les joueurs.',
  },
  {
    id: 'inspiration', page: 1, target: '.fc27-lookalike', placement: 'bottom',
    title: 'Tu veux jouer comme qui ?',
    body: 'Zidane, Kanté, Ronaldinho… Choisis une inspiration pour remplir ton poste, ton archétype, ton gabarit et tes priorités. Un nom absent ? Lance la recherche étendue. Les suggestions IA sont approximatives ; tu peux tout ajuster.',
  },
  {
    id: 'position', page: 1, target: '[data-player-guide="position"]', placement: 'right',
    title: 'Ta place dans le collectif',
    body: 'Choisis le poste où tu veux jouer le plus souvent. Chez nous, le gardien et la défense sont normalement tenus par l’IA : le collectif se construit au milieu et devant. Tu peux quand même choisir de jouer derrière.',
  },
  {
    id: 'archetype', page: 1, target: '[data-player-guide="archetype"]', placement: 'top',
    title: 'Ta façon de jouer',
    body: 'Ton poste ouvre les archétypes de sa ligne. Compare leurs spécialités : finir les actions, créer, récupérer… En choisir un préremplit ton build. Changer de ligne demande de choisir un nouvel archétype compatible.',
  },
  {
    id: 'priorities', page: 1, target: '[data-player-guide="archetype"]', placement: 'top',
    title: 'Les attributs à monter en premier',
    body: 'Après ton choix d’archétype, tu découvriras son PlayStyle signature et ton ordre de dépense. Cette liste indique quels attributs monter en premier dans le jeu. Tu pourras les réordonner ou les remplacer selon tes envies.',
  },
  {
    id: 'advanced', page: 1, advanced: true, target: '[data-player-guide="advanced"]', placement: 'top',
    title: 'Les détails qui te ressemblent',
    body: '« Affiner ma fiche » est facultatif : poste secondaire, pied fort, taille, poids, étoiles et notes. Les valeurs sont déjà remplies. Change seulement ce qui ne te correspond pas ; les fourchettes au poste servent de repères.',
  },
  {
    id: 'save', page: 1, target: '[data-player-guide="save"]', placement: 'top',
    title: 'Prêt à rejoindre le vestiaire',
    body: 'Une fois tes choix faits, « Valider ma fiche » enregistre ton joueur et met à jour l’effectif et les conseils du coach. Tu pourras modifier ta fiche plus tard. « Terminer » ferme seulement ce guide : à toi de créer ton joueur !',
  },
];

/** Montre les vraies priorités si un build est déjà choisi, sans créer de choix de démonstration. */
export function playerTourSteps(hasArchetype: boolean): readonly PlayerTourStep[] {
  return PLAYER_TOUR_STEPS.map((step) => step.id === 'priorities' && hasArchetype ? {
    ...step, target: '.fc27-spend',
    body: 'Voici les attributs à monter en premier dans le jeu. Les flèches changent leur ordre ; chaque liste permet de remplacer un attribut. Tu peux aussi revenir au conseil de l’archétype. Ta feuille de build conservera cet ordre.',
  } : step);
}
