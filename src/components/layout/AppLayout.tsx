import { Outlet, ScrollRestoration } from 'react-router';
import { CoachProvider } from '../coach/CoachContext';
import { TourHost } from '../tour/TourHost';
import { BottomNav } from './BottomNav';
import { Footer } from './Footer';
import { TopNav } from './TopNav';
import { Wall } from './Wall';

export function AppLayout() {
  return (
    <CoachProvider>
      <TourHost>
        <div className="fc-app">
          <Wall />
          <div className="fc-frame">
            <TopNav />
            <main>
              <Outlet />
            </main>
            <Footer />
          </div>
          <BottomNav />
          <ScrollRestoration />
        </div>
      </TourHost>
    </CoachProvider>
  );
}
