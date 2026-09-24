import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FC27Action, FC27State } from '../../shared/fc27';
import type { StaffResponse } from '../../server/staff-http';
import type { LookupResponse } from '../../server/lookalike-http';
import { apiRequest, ApiError } from './client';

/** Une réponse mise en cache avant les étapes (migration 0014) n'a ni `stages` ni `my_ballot`. Fonction stable : TanStack mémoïse le résultat. */
const withStages = (state: FC27State): FC27State => state.stages && state.my_ballot ? state : { ...state, stages: state.stages ?? [], my_ballot: state.my_ballot ?? [] };

/** `live` : rafraîchissement rapproché, pour l'arène pendant un vote (scores et changement d'étape). */
export function useFC27(campaignId?: number, { live = false }: { live?: boolean } = {}) {
  return useQuery({
    queryKey: ['fc27', campaignId ?? 'latest'],
    queryFn: () => apiRequest<FC27State>(`/api/fc27${campaignId === undefined ? '' : `?campaign=${campaignId}`}`),
    select: withStages,
    staleTime: 5_000,
    // Une préparation de saison ne bouge pas toutes les quinze secondes. Le rafraîchissement
    // au retour sur l'onglet suffit, et évite un aller-retour réseau permanent sur mobile.
    refetchInterval: live ? 15_000 : 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useFC27Action() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (action: FC27Action) => apiRequest<FC27State>('/api/fc27', { method: 'POST', body: JSON.stringify(action) }),
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) void client.invalidateQueries({ queryKey: ['me'] });
    },
    // Refresh after conflicts too: another visitor may have closed the ballot.
    onSettled: () => client.invalidateQueries({ queryKey: ['fc27'] }),
  });
}

/** Recherche déclenchée explicitement ; aucune génération à chaque frappe ou retour de focus. */
export function useLookalikeLookup(query: string) {
  return useQuery({
    queryKey: ['fc27-lookalike', query],
    queryFn: ({ signal }) => apiRequest<LookupResponse>(`/api/fc27/lookalike?q=${encodeURIComponent(query)}`, { signal }),
    enabled: query.length >= 2 && query.length <= 60,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/**
 * Lecture du staff : analyse rédigée, mise en cache par composition d'effectif.
 * `hash` n'est pas envoyé au serveur — il ne sert qu'à réinterroger la route quand
 * l'effectif change, et à ne PAS la réinterroger quand seul l'horodatage a bougé.
 * Aucune relance automatique : une génération coûte un appel facturé.
 */
export function useStaffReport(campaignId: number, hash: string, enabled = true) {
  return useQuery({
    queryKey: ['fc27-staff', campaignId, hash],
    queryFn: () => apiRequest<StaffResponse>(`/api/fc27/report?campaign=${campaignId}`),
    enabled,
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
