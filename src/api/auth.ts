import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { MeResponse } from '../../server/auth-http';
import { clearPersistedCache } from '../lib/persist';
import { apiRequest } from './client';

/** Qui est connecté. `canSignIn` dit si la connexion Discord est configurée sur ce site. */
export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => apiRequest<MeResponse>('/api/auth/me'),
    staleTime: 60_000,
    retry: false,
  });
}

export function useLogout() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => apiRequest<MeResponse>('/api/auth/logout', { method: 'POST' }),
    onSuccess: (me) => client.setQueryData(['me'], me),
    // La fiche affichée dépend du compte : tout se recharge après une déconnexion,
    // y compris ce qui avait été écrit sur l'appareil.
    onSettled: () => {
      clearPersistedCache();
      return client.invalidateQueries();
    },
  });
}
