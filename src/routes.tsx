import { createBrowserRouter } from 'react-router';
import { AppLayout } from './components/layout/AppLayout';
import { HomeView } from './views/HomeView';
import { NotFoundView } from './views/NotFoundView';

export const router = createBrowserRouter([
  { path: '/fc27/nom', lazy: async () => ({ Component: (await import('./views/FC27NamingView')).FC27NamingView }) },
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <HomeView /> },
      { path: '/joueurs', lazy: async () => ({ Component: (await import('./views/PlayersView')).PlayersView }) },
      { path: '/profil', lazy: async () => ({ Component: (await import('./views/ProfileView')).ProfileView }) },
      { path: '/matchs', lazy: async () => ({ Component: (await import('./views/MatchesView')).MatchesView }) },
      { path: '/matchs/:id', lazy: async () => ({ Component: (await import('./views/MatchDetailView')).MatchDetailView }) },
      { path: '/stats', lazy: async () => ({ Component: (await import('./views/StatsView')).StatsView }) },
      { path: '/playoffs', lazy: async () => ({ Component: (await import('./views/PlayoffsView')).PlayoffsView }) },
      { path: '/fc27', lazy: async () => ({ Component: (await import('./views/FC27View')).FC27View }) },
      { path: '/paris', lazy: async () => ({ Component: (await import('./views/BetsView')).BetsView }) },
      { path: '*', element: <NotFoundView /> },
    ],
  },
]);
