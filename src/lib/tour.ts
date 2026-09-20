// Guide pas à pas : définition des étapes et mémoire du « déjà vu ».
// Le guide éclaire de vrais éléments de la page : chaque `target` est un sélecteur qui doit
// exister dans le rendu. Une étape dont la cible reste introuvable est sautée si `optional`,
// sinon affichée au centre sans spot — jamais bloquante.

export interface GuideStep {
  id: string;
  /** Route sur laquelle l'étape se joue. Le guide y navigue si besoin. */
  route?: string;
  /**
   * Section de la page FC 27 à ouvrir avant de chercher la cible.
   * Sur mobile une seule section est montée à la fois : sans ça, la cible serait
   * introuvable et l'étape s'afficherait sans spot.
   */
  section?: 'nom' | 'fiche' | 'effectif' | 'rapport';
  /** Sélecteur de l'élément à éclairer. Absent = bulle centrée, sans spot. */
  target?: string;
  title: string;
  body: string;
  /** Côté préféré de la bulle. Le placement réel s'adapte à la place disponible. */
  placement?: 'top' | 'bottom' | 'left' | 'right';
  /** Cible qui peut légitimement ne pas exister (préparation archivée, effectif vide…). */
  optional?: boolean;
}

export interface TourStep extends GuideStep { route: string }

export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    route: '/',
    title: 'Bienvenue chez Dommage BJ FC',
    body: 'Un tour d’une minute pour savoir où tout se trouve, et ce qui t’attend avant la sortie de FC 27. Tu peux partir quand tu veux.',
  },
  {
    id: 'tabs',
    route: '/',
    target: '.fc-tabs',
    placement: 'bottom',
    title: 'Les sections du club',
    body: 'L’historique vit ici : le tableau de bord, les joueurs, les matchs, les stats et les playoffs. Tout est en lecture, rien à remplir.',
  },
  {
    id: 'dashboard',
    route: '/',
    target: '.fc-row--top',
    placement: 'bottom',
    title: 'Le tableau de bord',
    body: 'La forme du club en un coup d’œil : le dernier match, le meilleur buteur, la série en cours. C’est la page d’accueil.',
  },
  {
    id: 'fc27-tab',
    route: '/',
    target: '.fc-tab--preparation',
    placement: 'bottom',
    optional: true,
    title: 'C’est ici que ça se passe',
    body: 'L’onglet FC 27 est le seul où tu as des choses à faire. On y va tout de suite.',
  },
  {
    id: 'arena',
    route: '/fc27',
    section: 'nom',
    target: '.fc27-arena-entry',
    placement: 'right',
    title: 'Premier chantier : le nom du club',
    body: 'Chacun propose un nom, puis le collectif vote. L’arène s’ouvre en plein écran — c’est un moment à vivre ensemble.',
  },
  {
    id: 'card',
    route: '/fc27',
    section: 'fiche',
    target: '.fc27-player-tile',
    placement: 'left',
    optional: true,
    title: 'Deuxième chantier : ta fiche',
    body: 'Deux choix suffisent — ton poste, puis ton archétype. Le reste est pré-rempli. Tu y découvres aussi les nouveautés de FC 27 Clubs et les bonus de maîtrise.',
  },
  {
    id: 'roster',
    route: '/fc27',
    section: 'effectif',
    target: '.fc27-roster',
    placement: 'top',
    title: 'L’effectif se dessine',
    body: 'Chaque fiche prend sa place sur le terrain. Ouvre la tienne pour retrouver ta feuille à recopier : c’est l’écran à garder ouvert le jour où tu crées ton joueur en jeu.',
  },
  {
    id: 'report',
    route: '/fc27',
    section: 'rapport',
    target: '.fc27-report',
    placement: 'top',
    title: 'Le staff analyse le vestiaire',
    body: 'Formation conseillée, manques de l’effectif, consigne pour chaque joueur. Tout se recalcule à chaque nouvelle fiche — y compris la tienne.',
  },
  {
    id: 'done',
    route: '/fc27',
    title: 'À toi de jouer',
    body: 'Vote le nom, crée ta fiche, garde ta feuille sous la main pour le 25 septembre. Tu peux relancer ce guide à tout moment depuis le bas de page.',
  },
];

// ---------------------------------------------------------------- Mémoire

/** Changer de clé rejoue le guide pour tout le monde : à faire quand les étapes changent vraiment. */
const STORAGE_KEY = 'dommage.tour.v1';

/**
 * L'app n'a pas de compte : le « déjà vu » ne peut vivre que dans le navigateur.
 * Navigation privée ou stockage bloqué : on considère que le guide n'a jamais été vu,
 * l'invitation réapparaît, et rien ne casse.
 */
export function tourSeen(storageKey = STORAGE_KEY): boolean {
  try {
    return localStorage.getItem(storageKey) !== null;
  } catch {
    return false;
  }
}

export function markTourSeen(outcome: 'done' | 'dismissed', storageKey = STORAGE_KEY): void {
  try {
    localStorage.setItem(storageKey, outcome);
  } catch {
    // Stockage indisponible : l'invitation reviendra, ce n'est pas une erreur.
  }
}
