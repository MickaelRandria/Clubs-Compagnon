import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import type { Query } from '@tanstack/react-query';

// Cache des requêtes conservé d'une session à l'autre.
//
// Le cache de TanStack Query vit en mémoire : à chaque relance de la PWA il est vide,
// et `DataGate` affiche un squelette le temps de l'aller-retour vers l'API. Sur un
// téléphone, avec une base serverless qui peut mettre une seconde à se réveiller, c'est
// précisément le « ça s'affiche pas direct » ressenti à l'ouverture.
//
// On écrit donc le cache dans localStorage. À la relance, le dernier état connu est
// affiché immédiatement, puis rafraîchi en arrière-plan (`staleTime` fait son travail).

const CLE = 'dommage.query.v1';

/**
 * À incrémenter quand la forme des réponses de l'API change : un cache restauré dans
 * l'ancien format ferait planter le rendu avant même le premier rafraîchissement.
 */
const VERSION = '2'; // 2 : étapes du vote du nom (stages, my_ballot).

/** Au-delà, on préfère un squelette à des données franchement périmées. */
const DUREE = 24 * 60 * 60 * 1000;

export const persister = createSyncStoragePersister({
  storage: typeof window === 'undefined' ? undefined : window.localStorage,
  key: CLE,
});

export const persistOptions = {
  persister,
  maxAge: DUREE,
  buster: VERSION,
  dehydrateOptions: {
    /**
     * Tout est conservé sauf l'identité. Réafficher un compte connecté depuis le disque
     * alors que la session a expiré côté serveur donnerait une app qui se croit connectée :
     * `me` repart donc toujours du serveur, et lui seul fait foi.
     */
    shouldDehydrateQuery: (query: Query) =>
      query.state.status === 'success' && query.queryKey[0] !== 'me'
      // Même raison pour un débrief refusé : restauré après la connexion Discord, il
      // afficherait « connecte-toi » à quelqu'un qui vient de le faire.
      && !(query.queryKey[0] === 'match-debrief' && !(query.state.data as { available?: boolean })?.available),
  },
};

/** Après une déconnexion, plus rien du compte précédent ne doit survivre sur l'appareil. */
export function clearPersistedCache() {
  try {
    window.localStorage.removeItem(CLE);
  } catch {
    // Navigation privée ou stockage refusé : il n'y avait rien à effacer.
  }
}
