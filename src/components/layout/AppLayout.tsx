import { Outlet, ScrollRestoration } from 'react-router';
import { TourHost } from '../tour/TourHost';
import { Footer } from './Footer';
import { TopNav } from './TopNav';
import { Wall } from './Wall';

export function AppLayout() {
  return (
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
        <ScrollRestoration />
      </div>
    </TourHost>
  );
}
