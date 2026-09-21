import { useQuery } from '@tanstack/react-query';
import type { MatchDebriefResponse } from '../../server/match-debrief-http';
import { apiRequest } from './client';

export function useMatchDebrief(matchId: number, enabled = true) {
  return useQuery({
    queryKey: ['match-debrief', matchId],
    queryFn: () => apiRequest<MatchDebriefResponse>(`/api/matches/${matchId}/debrief`),
    enabled: enabled && Number.isInteger(matchId) && matchId > 0,
    // Un débrief rédigé ne change plus ; un refus (« connecte-toi ») dépend de qui regarde
    // et doit être redemandé dès le retour de Discord, pas 15 minutes plus tard.
    staleTime: (query) => (query.state.data?.available ? 15 * 60_000 : 0),
    gcTime: 30 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

