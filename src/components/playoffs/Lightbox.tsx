import { useEffect, useRef } from 'react';

type Photo = { src: string; caption: string };

/** Visionneuse plein écran — Échap pour fermer, ← → pour naviguer, swipe tactile sur mobile. */
export function Lightbox({
  photos,
  index,
  onChange,
  onClose,
}: {
  photos: ReadonlyArray<Photo>;
  index: number;
  onChange: (index: number) => void;
  onClose: () => void;
}) {
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && index > 0) onChange(index - 1);
      if (e.key === 'ArrowRight' && index < photos.length - 1) onChange(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, photos.length, onChange, onClose]);

  const photo = photos[index];

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    if (diff > 50 && index < photos.length - 1) onChange(index + 1);
    else if (diff < -50 && index > 0) onChange(index - 1);
    touchStartX.current = null;
  };

  return (
    <div
      className="fc-lightbox"
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      role="dialog"
      aria-modal="true"
      aria-label="Photo en plein écran"
    >
      <figure onClick={(e) => e.stopPropagation()}>
        <img src={photo.src} alt={photo.caption} />
        <figcaption>
          {photo.caption} · {index + 1}/{photos.length}
        </figcaption>
        {index > 0 && (
          <button type="button" className="fc-lb-btn fc-lb-prev" aria-label="Photo précédente" onClick={() => onChange(index - 1)}>
            ‹
          </button>
        )}
        {index < photos.length - 1 && (
          <button type="button" className="fc-lb-btn fc-lb-next" aria-label="Photo suivante" onClick={() => onChange(index + 1)}>
            ›
          </button>
        )}
        <button type="button" className="fc-lb-btn fc-lb-close" aria-label="Fermer" onClick={onClose}>
          ✕
        </button>
      </figure>
    </div>
  );
}
