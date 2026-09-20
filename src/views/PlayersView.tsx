import { useSearchParams } from 'react-router';
import { useMembers } from '../api/queries';
import { PlayerLeadTile } from '../components/players/PlayerLeadTile';
import { PlayersTable } from '../components/players/PlayersTable';
import { PodiumCard } from '../components/players/PodiumCard';
import { POSITIONS, SORTS, statValue } from '../components/players/playerSort';
import { CornerShardLg } from '../components/ui/CornerShardLg';
import { DataGate } from '../components/ui/DataGate';
import { Skeleton } from '../components/ui/Skeleton';
import { Strip } from '../components/ui/Strip';
import { usePageTitle } from '../lib/hooks';
import { POS_LABEL } from '../lib/labels';

export function PlayersView() {
  usePageTitle('Joueurs');
  const members = useMembers();
  const [params, setParams] = useSearchParams();

  const sort = SORTS.find((s) => s.param === params.get('tri')) ?? SORTS[0];
  const filter = POSITIONS.find((p) => p.param === params.get('poste')) ?? POSITIONS[0];

  const setParam = (name: string, value: string, fallback: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value === fallback) next.delete(name);
        else next.set(name, value);
        return next;
      },
      { replace: true },
    );

  return (
    <div className="fc-view">
      <div className="fc-controls">
        <Strip
          label="Poste"
          value={filter.param}
          onChange={(v) => setParam('poste', v, POSITIONS[0].param)}
          options={POSITIONS.map((p) => [
            p.param,
            p.label,
            members.data?.filter((m) => p.position === null || m.position === p.position).length,
          ])}
        />
        <Strip
          label="Trier par"
          value={sort.param}
          onChange={(v) => setParam('tri', v, SORTS[0].param)}
          options={SORTS.map((s) => [s.param, s.label])}
        />
      </div>

      <DataGate queries={[members]} skeleton={<Skeleton rows={[[[1.55, 1], 340], [[1], 460]]} />}>
        {() => {
          const filtered = members.data!.filter((m) => filter.position === null || m.position === filter.position);
          const ranked = [...filtered].sort((a, b) => statValue(b, sort.key) - statValue(a, sort.key));
          const [first, ...others] = ranked;
          const podium = others.slice(0, 2);
          const rest = others.slice(2);
          const maxValue = Math.max(...ranked.map((p) => statValue(p, sort.key)), 1);

          if (!first) {
            return (
              <div className="fc-block fc-marine fc-empty">
                <CornerShardLg />
                <span className="fc-title fc-title--lg">
                  Aucun {filter.position ? POS_LABEL[filter.position].toLowerCase() : 'joueur'}
                </span>
                <span className="fc-body">
                  Personne n'est enregistré à ce poste dans l'effectif. Choisis un autre poste pour voir le classement.
                </span>
              </div>
            );
          }

          return (
            <>
              <div className="fc-players-top">
                <PlayerLeadTile player={first} sortKey={sort.key} sortLabel={sort.label} spill={rest.length > 0} />
                {podium.length > 0 && (
                  <div className="fc-podium">
                    {podium.map((p, i) => (
                      <PodiumCard
                        key={p.id}
                        player={p}
                        rank={i + 2}
                        sortKey={sort.key}
                        sortLabel={sort.label}
                        delay={70 + i * 60}
                      />
                    ))}
                  </div>
                )}
              </div>
              {rest.length > 0 && (
                <PlayersTable players={rest} firstRank={4} sortKey={sort.key} sortLabel={sort.label} maxValue={maxValue} />
              )}
            </>
          );
        }}
      </DataGate>
    </div>
  );
}
