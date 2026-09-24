import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BetsMode, BetsStatus } from '../../shared/bets';
import { useMe } from './auth';
import { apiRequest } from './client';

const LOCKED: BetsStatus = { mode: 'off', access: 'locked', canConfigure: false };

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
    staleTime: 60_000,
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
