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
  section?: 'saison' | 'fiche' | 'effectif' | 'rapport';
  /** Sélecteur de l'élément à éclairer. Absent = bulle centrée, sans spot. */
  target?: string;
  title: string;
  body: string;
  /** Côté préféré de la bulle. Le placement réel s'adapte à la place disponible. */
  placement?: 'top' | 'bottom' | 'left' | 'right';
  /** Cible qui peut légitimement ne pas exister (préparation archivée, effectif vide…). */
  optional?: boolean;
  /**
   * État de connexion exigé. Filtré AVANT de lancer le guide, donc sans délai : trier
   * sur la présence de la cible dans le DOM laissait apparaître l'étape une seconde ou
   * deux avant de la sauter, et on lisait « Te voilà connecté » en étant déconnecté.
   */
  requires?: 'signed-in' | 'signed-out';
}

export interface TourStep extends GuideStep { route: string }


export const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    route: '/',
    title: 'Bienvenue chez FoodBall Club',
    body: 'Une minute pour savoir où tout se trouve. Tout ce que tu vois arrive d’EA tout seul, après chaque match.',
  },
  {
    id: 'series',
    route: '/',
    target: '.fc-series',
    placement: 'bottom',
    optional: true,
    title: 'Où en est le club',
    body: 'La série en cours, calculée par EA, et le skill rating. C’est la première chose à regarder en arrivant.',
  },
  {
    id: 'last-match',
    route: '/',
    target: '.fc-card--last',
    placement: 'top',
    optional: true,
    title: 'Le dernier match, en duel',
    body: 'Le score, puis nos chiffres face aux leurs : tirs, passes réussies. Touche la tuile pour la fiche complète.',
  },
  {
    // Ancrée en haut : sur mobile, la bulle du guide occupe le bas et masquerait la barre d'onglets.
    id: 'nav',
    route: '/',
    target: '.fc-coach-nav-trigger',
    placement: 'bottom',
    title: 'Cinq onglets et un Coach',
    body: 'Accueil, Matchs, Effectif, Club et Vestiaire, où se jouent les paris quand ils sont ouverts. Une question ? Le Coach IA répond depuis cet éclair.',
  },
  {
    id: 'matches',
    route: '/matchs',
    target: '.fc-mrow',
    placement: 'bottom',
    optional: true,
    title: 'Chaque match a sa fiche',
    body: 'Duel nous contre eux, les feuilles des deux équipes, les notes du vestiaire et le débrief du Coach IA.',
  },
  {
    id: 'squad',
    route: '/joueurs',
    target: '.fc-players-top',
    placement: 'bottom',
    optional: true,
    title: 'L’effectif',
    body: 'Trie par buts, passes ou OVR. Touche un joueur pour sa fiche : son Pro, ses hommes du match et sa forme sur ses 10 derniers matchs.',
  },
  {
    id: 'club',
    route: '/club',
    target: '#classement',
    placement: 'bottom',
    optional: true,
    title: 'Le Club',
    body: 'Division et points de la saison, montées, palmarès des nuits Inhouse et des playoffs EA, bilan complet et maillots.',
  },
  {
    id: 'profil',
    route: '/profil',
    target: '.profile-panel, .profile-card, main',
    placement: 'bottom',
    optional: true,
    title: 'Relie ton joueur du club',
    body: 'Connecte-toi avec Discord et rattache ton pseudo Club Pro. Un administrateur valide la correspondance, puis tu peux parier au Vestiaire.',
  },
  {
    id: 'install',
    route: '/profil',
    target: '.pwa-install',
    placement: 'top',
    optional: true,
    title: 'Garde-la sous la main',
    body: 'Installe l’app sur ton téléphone : elle s’ouvre comme n’importe quelle autre, et reste consultable même sans réseau.',
  },
  {
    id: 'done',
    route: '/profil',
    title: 'À toi de jouer',
    body: 'Relie ton compte, parie sur le prochain match et suis le club au fil des sessions. Tu peux relancer ce guide depuis le bas de page.',
  },
];

/** Étapes pertinentes pour l'état courant. */
export const stepsFor = (signedIn: boolean, steps: TourStep[] = TOUR_STEPS) =>
  steps.filter((step) => step.requires === undefined
    || (step.requires === 'signed-in' ? signedIn : !signedIn));

// ---------------------------------------------------------------- Mémoire

/** Changer de clé rejoue le guide pour tout le monde : à faire quand les étapes changent vraiment. */
export const TOUR_STORAGE_KEY = 'dommage.tour.v3';
const STORAGE_KEY = TOUR_STORAGE_KEY;

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
