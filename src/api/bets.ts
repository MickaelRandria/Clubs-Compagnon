import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BetsAdminAction, BetsMode, BetsPlayAction, BetsState, BetsStatus } from '../../shared/bets';
import type { LobbyMusic } from '../../shared/lobby';
import { useMe } from './auth';
import { apiRequest } from './client';
import { setUploadedPhotos } from '../lib/player-photos';

const LOCKED: BetsStatus = { mode: 'off', access: 'locked', canConfigure: false, live: null };

/**
 * Interrupteur de Vestiaire Bets vu par le visiteur. Échoue fermé : tant que la réponse
 * n'est pas arrivée, ou si le serveur ne répond pas, la fonctionnalité reste grisée.
 */
export function useBetsStatus() {
  const me = useMe();
  const accountId = me.data?.signedIn ? me.data.account.id : null;
  const query = useQuery({
    queryKey: ['bets-status', accountId],
    queryFn: () => apiRequest<BetsStatus>('/api/bets/status'),
    enabled: !me.isPending,
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });
  return { status: query.data ?? LOCKED, ready: query.isSuccess || query.isError };
}

export function useSetBetsMode() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (mode: BetsMode) => apiRequest<BetsStatus>('/api/bets/mode', { method: 'POST', body: JSON.stringify({ mode }) }),
    onSuccess: () => client.invalidateQueries({ queryKey: ['bets-status'] }),
  });
}

/** État complet de la soirée pour le compte connecté. Rafraîchi souvent : le match peut tomber à tout moment. */
export function useBetsState(enabled: boolean) {
  return useQuery({
    queryKey: ['bets-state'],
    queryFn: () => apiRequest<BetsState>('/api/bets/state'),
    enabled,
    // Toujours frais : le match peut être réglé à tout moment.
    staleTime: 0,
    // 15 s : la salle d'attente montre qui est là et passe seule à la phase suivante.
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}

/** Les soirées passées, pour l'accueil : simple lecture, sans compter comme présent dans le salon FoodBet. */
export function useBetsHistory(enabled: boolean) {
  return useQuery({
    queryKey: ['bets-history'],
    queryFn: () => apiRequest<BetsState>('/api/bets/state?peek'),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/** La musique du lobby (titre Spotify en cours chez l'hôte), relue toutes les 15 s. */
export function useLobbyMusic() {
  const me = useMe();
  const accountId = me.data?.signedIn ? me.data.account.id : null;
  return useQuery({
    queryKey: ['lobby-music', accountId],
    queryFn: () => apiRequest<LobbyMusic>('/api/bets/lobby'),
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: false,
  });
}

/** Admins : coller (ou effacer) le lien de la Jam de la soirée. */
export function useSaveJam() {
  const client = useQueryClient();
  const me = useMe();
  const accountId = me.data?.signedIn ? me.data.account.id : null;
  return useMutation({
    mutationFn: (url: string) => apiRequest<LobbyMusic>('/api/bets/jam', { method: 'POST', body: JSON.stringify({ url }) }),
    onSuccess: async (music) => {
      await client.cancelQueries({ queryKey: ['lobby-music'] });
      client.setQueryData(['lobby-music', accountId], music);
    },
  });
}

/** Arrêter le partage du compte hôte et supprimer ses jetons conservés sur le serveur. */
export function useDisconnectSpotify() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest<LobbyMusic>('/api/bets/spotify-disconnect', { method: 'POST' }),
    onSuccess: async (music) => {
      await client.cancelQueries({ queryKey: ['lobby-music'] });
      client.setQueriesData({ queryKey: ['lobby-music'] }, music);
    },
  });
}

/** Les photos envoyées par les joueurs. Les écrans qui affichent des visages s'y abonnent. */
export function usePlayerPhotos() {
  const query = useQuery({ queryKey: ['player-photos'], queryFn: () => apiRequest<Record<string, string>>('/api/bets/photos'), staleTime: 60_000 });
  if (query.data) setUploadedPhotos(query.data);
  return query.data;
}

/** Envoyer sa photo (data URL WebP déjà recadrée) : elle remplace la précédente. */
export function useUploadPhoto() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (image: string) => apiRequest<Record<string, string>>('/api/bets/photo-upload', { method: 'POST', body: JSON.stringify({ image }) }),
    onSuccess: (map) => { setUploadedPhotos(map); client.setQueryData(['player-photos'], map); },
  });
}

function useBetsMutation<T>(path: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (action: T) => apiRequest<BetsState>(path, { method: 'POST', body: JSON.stringify(action) }),
    onSuccess: (state) => {
      client.setQueryData(['bets-state'], state);
      void client.invalidateQueries({ queryKey: ['bets-status'] });
    },
  });
}

export const useBetsPlay = () => useBetsMutation<BetsPlayAction>('/api/bets/play');
export const useBetsAdmin = () => useBetsMutation<BetsAdminAction>('/api/bets/admin');
