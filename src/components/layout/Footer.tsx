import { TourReplay } from '../tour/TourHost';
import { Glyph } from '../ui/Glyph';
import { Wordmark } from './Wordmark';
import { InstallApp } from '../pwa/PwaProvider';

export function Footer() {
  return (
    <footer className="fc-foot">
      <span className="fc-hint">
        <Glyph name="cross" size={20} /> Sélectionner
      </span>
      <TourReplay />
      <InstallApp />
      <Wordmark />
    </footer>
  );
}
