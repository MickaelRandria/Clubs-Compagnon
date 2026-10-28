import { createBrowserRouter, Navigate } from 'react-router';
import { AppLayout } from './components/layout/AppLayout';
import { HomeView } from './views/HomeView';
import { NotFoundView } from './views/NotFoundView';

export const router = createBrowserRouter([
  // L'ancienne arène du vote du nom renvoie vers la saison.
  { path: '/fc27/nom', element: <Navigate to="/fc27" replace /> },
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <HomeView /> },
      { path: '/joueurs', lazy: async () => ({ Component: (await import('./views/PlayersView')).PlayersView }) },
      { path: '/joueurs/:id', lazy: async () => ({ Component: (await import('./views/PlayerView')).PlayerView }) },
      { path: '/club', lazy: async () => ({ Component: (await import('./views/ClubView')).ClubView }) },
      // Stats a rejoint la page Club ; l'ancienne adresse y mène toujours.
      { path: '/stats', element: <Navigate to="/club#bilan" replace /> },
      { path: '/profil', lazy: async () => ({ Component: (await import('./views/ProfileView')).ProfileView }) },
      { path: '/matchs', lazy: async () => ({ Component: (await import('./views/MatchesView')).MatchesView }) },
      { path: '/matchs/:id', lazy: async () => ({ Component: (await import('./views/MatchDetailView')).MatchDetailView }) },
      { path: '/playoffs', lazy: async () => ({ Component: (await import('./views/PlayoffsView')).PlayoffsView }) },
      { path: '/fc27', lazy: async () => ({ Component: (await import('./views/FC27View')).FC27View }) },
      { path: '/paris', lazy: async () => ({ Component: (await import('./views/BetsView')).BetsView }) },
      { path: '*', element: <NotFoundView /> },
    ],
  },
]);
