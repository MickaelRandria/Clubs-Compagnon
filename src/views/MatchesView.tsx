import { useSearchParams } from 'react-router';
import type { MatchResult } from '../../shared/types';
import { useMatches } from '../api/queries';
import { MatchesSummary } from '../components/matches/MatchesSummary';
import { MatchRow } from '../components/matches/MatchRow';
import { CornerShardLg } from '../components/ui/CornerShardLg';
import { DataGate } from '../components/ui/DataGate';
import { Skeleton } from '../components/ui/Skeleton';
import { Strip } from '../components/ui/Strip';
import { useIsMobile, usePageTitle } from '../lib/hooks';

/** Filtres de résultat, avec leur valeur dans l'URL (?resultat=…). */
const FILTERS = [
  { param: 'tous', result: null, label: 'Tous' },
  { param: 'victoires', result: 'win', label: 'Victoires' },
  { param: 'nuls', result: 'draw', label: 'Nuls' },
  { param: 'defaites', result: 'loss', label: 'Défaites' },
] as const satisfies ReadonlyArray<{ param: string; result: MatchResult | null; label: string }>;

export function MatchesView() {
  usePageTitle('Matchs');
  const isMobile = useIsMobile();
  const matches = useMatches();
  const [params, setParams] = useSearchParams();
  const filter = FILTERS.find((f) => f.param === params.get('resultat')) ?? FILTERS[0];

  const setFilter = (value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === FILTERS[0].param) next.delete('resultat');
        else next.set('resultat', value);
        return next;
      },
      { replace: true },
    );

  return (
    <DataGate queries={[matches]} skeleton={<Skeleton rows={[[[1.6, 0.62, 0.62, 0.62], 220], [[1], 520]]} />}>
      {() => {
        const all = matches.data!;
        if (all.length === 0) {
          return (
            <div className="fc-block fc-marine fc-empty">
              <CornerShardLg />
              <span className="fc-title fc-title--lg">Aucun match enregistré</span>
              <span className="fc-body">Les matchs apparaîtront ici dès qu'ils seront en base.</span>
            </div>
          );
        }
        const shown = filter.result === null ? all : all.filter((m) => m.result === filter.result);

        return (
          <div className="fc-view">
            <MatchesSummary matches={all} />

            <div className="fc-controls">
              <Strip
                label="Résultat"
                value={filter.param}
                onChange={setFilter}
                options={FILTERS.map((f) => [
                  f.param,
                  f.label,
                  f.result === null ? all.length : all.filter((m) => m.result === f.result).length,
                ])}
              />
            </div>

            <div className="fc-block fc-marine fc-history" style={{ animationDelay: '160ms' }}>
              {shown.map((m) => (
                <MatchRow key={m.id} match={m} mobile={isMobile} />
              ))}
            </div>
          </div>
        );
      }}
    </DataGate>
  );
}
