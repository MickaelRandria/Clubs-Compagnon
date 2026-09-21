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
    title: 'Bienvenue chez Dommage BJ FC',
    body: 'Une minute pour savoir où tout se trouve et ce qui t’attend avant FC 27. Tu peux partir quand tu veux.',
  },
  {
    id: 'fc27-tab',
    route: '/',
    target: '.fc-tab--preparation',
    placement: 'bottom',
    optional: true,
    title: 'C’est ici que ça se passe',
    body: 'Les autres onglets racontent l’histoire du club. L’onglet FC 27 est le seul où tu as des choses à faire. On y va.',
  },
  {
    // Disparaît dès qu'on est connecté : l'étape se saute alors toute seule.
    id: 'signin',
    requires: 'signed-out',
    route: '/fc27',
    section: 'fiche',
    target: '.fc27-signin',
    placement: 'top',
    optional: true,
    title: 'D’abord, connecte-toi',
    body: 'Tout passe par ton compte Discord : ta fiche n’appartient qu’à toi, et ta voix au vote compte une fois. Un clic, aucun mot de passe.',
  },
  {
    // Le pendant du précédent : présent seulement une fois connecté.
    id: 'account',
    requires: 'signed-in',
    route: '/fc27',
    target: '.fc27-account',
    placement: 'bottom',
    optional: true,
    title: 'Te voilà connecté',
    body: 'Ton compte s’affiche ici, avec sa déconnexion. Ce que tu crées à partir de maintenant est à toi, et personne d’autre ne peut y toucher.',
  },
  {
    id: 'arena',
    route: '/fc27',
    section: 'nom',
    target: '.fc27-arena-entry',
    placement: 'right',
    title: 'Premier chantier : le nom du club',
    body: 'Trois propositions au maximum chacun, puis une voix par personne. L’arène s’ouvre en plein écran — c’est un moment à vivre ensemble.',
  },
  {
    id: 'card',
    route: '/fc27',
    section: 'fiche',
    target: '.fc27-player-tile',
    placement: 'left',
    optional: true,
    title: 'Deuxième chantier : ta fiche',
    body: 'Deux choix suffisent : ton poste, puis ton archétype. Ou pars d’un joueur que tu admires — tape « Zidane » et tout se remplit.',
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
    body: 'Formation conseillée, manques de l’effectif, consigne pour chacun. Tout se recalcule à chaque nouvelle fiche — y compris la tienne.',
  },
  {
    id: 'profil',
    route: '/profil',
    target: '.profile-panel, .profile-card, main',
    placement: 'bottom',
    optional: true,
    title: 'Relie ton joueur du club',
    body: 'Ta fiche FC 27 est ton projet ; ici tu rattaches ton pseudo Club Pro pour retrouver tes buts et tes passes. Un administrateur valide la correspondance.',
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
    body: 'Connecte-toi, propose un nom, crée ta fiche, et garde ta feuille sous la main pour le jour J. Tu peux relancer ce guide depuis le bas de page.',
  },
];

/** Étapes pertinentes pour l'état courant. */
export const stepsFor = (signedIn: boolean, steps: TourStep[] = TOUR_STEPS) =>
  steps.filter((step) => step.requires === undefined
    || (step.requires === 'signed-in' ? signedIn : !signedIn));

// ---------------------------------------------------------------- Mémoire

/** Changer de clé rejoue le guide pour tout le monde : à faire quand les étapes changent vraiment. */
const STORAGE_KEY = 'dommage.tour.v2';

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
