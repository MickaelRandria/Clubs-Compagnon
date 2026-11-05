// Partage d'une vidéo de célébration comme vrai fichier MP4 : sur téléphone, le menu de partage
// propose story Instagram, WhatsApp, Snap, DM… ; sur ordinateur, on télécharge le fichier.
// Le fichier est préchargé dès que la célébration s'ouvre : iOS refuse navigator.share si le
// geste de l'utilisateur est « trop vieux », et télécharger 14 Mo après le tap le rendrait trop vieux.

const blobs = new Map<string, Promise<Blob>>();

/** Lance (une fois) le téléchargement du fichier en mémoire. */
export function preloadVideo(url: string): Promise<Blob> {
  let pending = blobs.get(url);
  if (!pending) {
    pending = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`Vidéo introuvable (${r.status})`);
      return r.blob();
    });
    pending.catch(() => blobs.delete(url));
    blobs.set(url, pending);
  }
  return pending;
}

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled' | 'failed';

const download = (url: string, name: string) => {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
};

/** Partage le MP4 ; à défaut (ordinateur, navigateur sans partage de fichiers), le télécharge. */
export async function shareVideo(url: string, { title, text }: { title: string; text: string }): Promise<ShareOutcome> {
  const name = url.split('/').pop() || 'video.mp4';
  try {
    const blob = await preloadVideo(url);
    const file = new File([blob], name, { type: 'video/mp4' });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title, text });
      return 'shared';
    }
  } catch (error) {
    if ((error as DOMException)?.name === 'AbortError') return 'cancelled';
    // NotAllowedError (geste expiré) ou réseau : on retombe sur le téléchargement.
  }
  try {
    download(url, name);
    return 'downloaded';
  } catch {
    return 'failed';
  }
}

export const SHARE_LABEL: Record<ShareOutcome, string | null> = {
  shared: 'Vidéo partagée',
  downloaded: 'Vidéo téléchargée',
  cancelled: null,
  failed: 'Partage impossible',
};
