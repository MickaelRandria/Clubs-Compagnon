import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ClubProfile, ProfileAction } from '../../shared/profile';
import { useMe } from './auth';
import { apiRequest, ApiError } from './client';

export function useProfile() {
  const me = useMe();
  const accountId = me.data?.signedIn ? me.data.account.id : null;
  return useQuery({
    queryKey: ['profile', accountId],
    queryFn: () => apiRequest<ClubProfile>('/api/profile'),
    enabled: accountId !== null,
    staleTime: 5_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    retry: false,
  });
}
export function useProfileAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (action: ProfileAction) => apiRequest<ClubProfile>('/api/profile', { method: 'POST', body: JSON.stringify(action) }),
    onError: error => {
      if (error instanceof ApiError && error.status === 401) void client.invalidateQueries({ queryKey: ['me'] });
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['profile'] }),
  });
}
