import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { router } from './routes';
import { PwaProvider } from './components/pwa/PwaProvider';
import { persistOptions } from './lib/persist';

// Ordre d'import = ordre de la cascade d'origine. responsive.css doit rester en dernier.
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/tiles.css';
import './styles/home.css';
import './styles/detail.css';
import './styles/players.css';
import './styles/matches.css';
import './styles/stats.css';
import './styles/playoffs.css';
import './styles/states.css';
import './styles/match-detail.css';
import './styles/fc27.css';
import './styles/fc27-player.css';
import './styles/fc27-visuals.css';
import './styles/fc27-mobile.css';
import './styles/tour.css';
import './styles/pwa.css';
import './styles/coach.css';
import './styles/responsive.css';

const queryClient = new QueryClient({
  defaultOptions: {
    // gcTime doit couvrir maxAge du cache persiste, sinon une requete restauree est
    // jetee avant d'avoir servi.
    queries: { staleTime: 60_000, gcTime: 24 * 60 * 60_000, retry: 1, refetchOnWindowFocus: false },
    // Fail offline writes immediately; never replay a vote or profile change later.
    mutations: { networkMode: 'always', retry: false },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* L'état FC 27 porte le bulletin du visiteur : restauré du disque (par exemple juste après la
        connexion Discord), il est toujours revalidé, même s'il a moins de cinq secondes. */}
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions} onSuccess={() => queryClient.invalidateQueries({ queryKey: ['fc27'] })}>
      <PwaProvider><RouterProvider router={router} /></PwaProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
);
