import { useMutation } from '@tanstack/react-query';
import type { CoachHttpResult } from '../../server/coach-http';
import type { CoachAction, CoachResponse } from '../../shared/coach-assistant';
import { apiRequest } from './client';

export type { CoachAction, CoachHttpResult, CoachResponse };

export interface AskCoachInput {
  question: string;
  history?: { role: 'user' | 'assistant'; content: string }[];
}

export function useAskCoach() {
  return useMutation({
    mutationFn: (input: AskCoachInput) =>
      apiRequest<CoachHttpResult>('/api/coach', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
  });
}

