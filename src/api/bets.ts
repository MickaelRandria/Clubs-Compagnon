import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BetsAdminAction, BetsMode, BetsPlayAction, BetsState, BetsStatus } from '../../shared/bets';
import { useMe } from './auth';
import { apiRequest } from './client';

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
