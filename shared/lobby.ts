import { z } from 'zod';

/** « En ce moment dans le lobby » : ce que l'hôte écoute sur Spotify, et le lien de la Jam. */
export interface LobbyMusic {
  /** Rien ne joue (ou Spotify n'est pas relié) : null. `at` : l'heure de la mesure, pour faire avancer la barre. */
  playing: { title: string; artist: string; album: string; cover: string | null; url: string | null; progressMs: number; durationMs: number; at: string } | null;
  next: { title: string; artist: string; url: string | null } | null;
  /** Le joueur qui met la musique (nom affiché). */
  host: string | null;
  jamUrl: string | null;
  /** Pour les admins : le compte Spotify de l'hôte est-il relié ? */
  connected: boolean;
}

/** Un lien de Jam Spotify : spotify.link ou open.spotify.com, en https. */
export const jamUrlSchema = z.object({
  url: z.union([z.literal(''), z.string().max(300).refine((value) => {
    try {
      const url = new URL(value);
      return !/[\u0000-\u0020\\]/.test(value) && url.protocol === 'https:' && !url.username && !url.password && !url.port
        && ['spotify.link', 'open.spotify.com'].includes(url.hostname) && url.pathname.length > 1;
    } catch { return false; }
  }, 'Lien Spotify attendu.')]),
});
