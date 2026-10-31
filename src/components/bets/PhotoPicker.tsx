import { useRef, useState } from 'react';
import { useUploadPhoto } from '../../api/bets';

/** Recadre en carré (le haut de la photo, là où est le visage), 420 px, WebP : moins de 400 Ko. */
async function squareWebp(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((done, fail) => { const i = new Image(); i.onload = () => done(i); i.onerror = fail; i.src = url; });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = Math.max(0, (img.naturalHeight - side) * 0.25);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 420;
    canvas.getContext('2d')!.drawImage(img, sx, sy, side, side, 0, 0, 420, 420);
    let quality = 0.82;
    let data = canvas.toDataURL('image/webp', quality);
    while (data.length > 380_000 && quality > 0.4) { quality -= 0.15; data = canvas.toDataURL('image/webp', quality); }
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Bouton « Choisir / Remplacer ma photo » : galerie ou appareil photo, envoi direct. */
export function PhotoPicker({ label, className, onDone }: { label: string; className?: string; onDone?: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const upload = useUploadPhoto();
  const [error, setError] = useState<string | null>(null);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      await upload.mutateAsync(await squareWebp(file));
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Envoi impossible, réessaie.');
    }
  };
  return <>
    <button type="button" className={className} data-action disabled={upload.isPending} onClick={() => input.current?.click()}>
      {upload.isPending ? 'Envoi…' : upload.isSuccess ? 'Photo ajoutée ✓' : label}
    </button>
    <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void pick(e.target.files?.[0])} />
    {error && <p className="rc-q" role="alert">{error}</p>}
  </>;
}
