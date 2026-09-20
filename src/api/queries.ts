import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NewMatchNote } from '../../shared/notes';
import type { Club, Match, MatchDetail, MatchNote, Member } from '../../shared/types';
import { ApiError, apiRequest } from './client';

const notFound = (error: unknown) => error instanceof ApiError && error.status === 404;

export const useClub = () => useQuery({ queryKey: ['club'], queryFn: () => apiRequest<Club>('/api/club') });

export const useMembers = () => useQuery({ queryKey: ['members'], queryFn: () => apiRequest<Member[]>('/api/members') });

export const useMatches = () => useQuery({ queryKey: ['matches'], queryFn: () => apiRequest<Match[]>('/api/matches') });

export const useMatchDetail = (matchId: number) =>
  useQuery({
    queryKey: ['match', matchId],
    queryFn: () => apiRequest<MatchDetail>(`/api/matches/${matchId}`),
    enabled: Number.isInteger(matchId) && matchId > 0,
    retry: (count, error) => !notFound(error) && count < 1,
  });

export function useAddMatchNote(matchId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (note: NewMatchNote) =>
      apiRequest<MatchNote>(`/api/matches/${matchId}/notes`, { method: 'POST', body: JSON.stringify(note) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['match', matchId] }),
  });
}
