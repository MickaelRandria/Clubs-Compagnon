import { useState } from 'react';
import { PLAYOFF_NIGHT } from '../../content/playoffs';
import { Glyph } from '../ui/Glyph';
import { Lightbox } from './Lightbox';

/** Galerie : une grande photo + deux petites, légendes sous l'image. */
export function Gallery() {
  const photos = PLAYOFF_NIGHT.photos;
  const [active, setActive] = useState<number | null>(null);

  return (
    <>
      <span className="fc-kicker fc-section">Photos de la nuit</span>
      <div className="fc-gallery">
        {photos.map((photo, i) => (
          <button
            key={photo.src}
            type="button"
            className="fc-tile fc-photo"
            onClick={() => setActive(i)}
            style={{ animationDelay: `${240 + i * 60}ms` }}
          >
            <img src={photo.src} alt="" style={{ objectPosition: photo.position }} />
            <span className="fc-photo-cap">
              <span>{photo.caption}</span>
              <Glyph name="expand" size={18} />
            </span>
          </button>
        ))}
      </div>
      {active !== null && <Lightbox photos={photos} index={active} onChange={setActive} onClose={() => setActive(null)} />}
    </>
  );
}
