import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { router } from './routes';
import { PwaProvider } from './components/pwa/PwaProvider';

// Ordre d'import = ordre de la cascade d'origine. responsive.css doit rester en dernier.
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
import './styles/responsive.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1, refetchOnWindowFocus: false },
    // Fail offline writes immediately; never replay a vote or profile change later.
    mutations: { networkMode: 'always', retry: false },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <PwaProvider><RouterProvider router={router} /></PwaProvider>
    </QueryClientProvider>
  </StrictMode>,
);
