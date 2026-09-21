import { createBrowserRouter } from 'react-router';
import { AppLayout } from './components/layout/AppLayout';
import { HomeView } from './views/HomeView';
import { MatchDetailView } from './views/MatchDetailView';
import { MatchesView } from './views/MatchesView';
import { NotFoundView } from './views/NotFoundView';
import { PlayersView } from './views/PlayersView';
import { PlayoffsView } from './views/PlayoffsView';
import { StatsView } from './views/StatsView';

export const router = createBrowserRouter([
  { path: '/fc27/nom', lazy: async () => ({ Component: (await import('./views/FC27NamingView')).FC27NamingView }) },
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <HomeView /> },
      { path: '/joueurs', element: <PlayersView /> },
      { path: '/profil', lazy: async () => ({ Component: (await import('./views/ProfileView')).ProfileView }) },
      { path: '/matchs', element: <MatchesView /> },
      { path: '/matchs/:id', element: <MatchDetailView /> },
      { path: '/stats', element: <StatsView /> },
      { path: '/playoffs', element: <PlayoffsView /> },
      { path: '/fc27', lazy: async () => ({ Component: (await import('./views/FC27View')).FC27View }) },
      { path: '*', element: <NotFoundView /> },
    ],
  },
]);
