import { z } from 'zod';

/** « En ce moment dans le lobby » : ce que l'hôte écoute sur Spotify, et le lien de la Jam. */
export interface LobbyMusic {
  /** Rien ne joue (ou Spotify n'est pas relié) : null. `at` : l'heure de la mesure, pour faire avancer la barre. */
  playing: { title: string; artist: string; album: string; cover: string | null; progressMs: number; durationMs: number; at: string } | null;
  next: { title: string; artist: string } | null;
  /** Le joueur qui met la musique (nom affiché). */
  host: string | null;
  jamUrl: string | null;
  /** Pour les admins : le compte Spotify de l'hôte est-il relié ? */
  connected: boolean;
}

/** Un lien de Jam Spotify : spotify.link ou open.spotify.com, en https. */
export const jamUrlSchema = z.object({
  url: z.union([z.literal(''), z.string().url().max(300).refine((u) => /^https:\/\/(spotify\.link|open\.spotify\.com)\//.test(u), 'Lien Spotify attendu.')]),
});
