import { Link, useParams } from 'react-router';
import type { Member } from '../../shared/types';
import { useMembers } from '../api/queries';
import { DataGate } from '../components/ui/DataGate';
import { NotFoundBlock } from '../components/ui/NotFoundBlock';
import { Skeleton } from '../components/ui/Skeleton';
import { frNum } from '../lib/format';
import { usePageTitle } from '../lib/hooks';
import { POS_LABEL, POS_SHORT, posColorClass } from '../lib/labels';

/** Ligne de l'écran Pro : libellé, valeur, jauge (absente pour un simple compteur). */
function ProLine({ label, value, pct, active = false }: { label: string; value: string; pct?: number | null; active?: boolean }) {
  return (
    <div className={`fc-pro-line${active ? ' is-active' : ''}`}>
      <span>{label}</span>
      <span className="fc-pro-value">{value}</span>
      {pct === undefined ? <span /> : <span className="fc-pro-bar"><i style={{ width: `${Math.max(0, Math.min(100, pct ?? 0))}%` }} /></span>}
    </div>
  );
}

const percent = (value: number | null) => (value === null ? '—' : `${value} %`);

/** Fiche d'un joueur, sur le modèle de l'écran Pro de FIFA 17 : saison au club et forme récente. */
export function PlayerView() {
  const id = Number(useParams().id);
  const members = useMembers();
  const player = members.data?.find((m) => m.id === id);
  usePageTitle(player?.gamertag ?? 'Joueur');

  if (members.data && !player) {
    return <NotFoundBlock title="Joueur introuvable" text="Ce joueur ne fait plus partie de l'effectif actif." to="/joueurs" cta="Voir l'effectif" />;
  }

  return (
    <DataGate queries={[members]} skeleton={<Skeleton rows={[[[0.4, 1], 140], [[1], 520]]} />}>
      {() => <ProSheet player={player!} />}
    </DataGate>
  );
}

function ProSheet({ player: p }: { player: Member }) {
  const motmPct = p.matchesPlayed > 0 ? Math.round((p.motm / p.matchesPlayed) * 100) : null;
  const pro = [p.proName && `Pro : ${p.proName}`, p.heightCm && `${frNum(p.heightCm / 100, 2)} m`].filter(Boolean).join(' · ');
  const maxGoals = Math.max(1, ...p.form.map((f) => f.goals));

  return (
    <div className="fc-view">
      <div className="fc-pro-head">
        <div className="fc-pro-ovr">
          <span className="fc-pro-ovr-num">{p.ovr}</span>
          <span className={`fc-pos ${posColorClass(p.position)}`}>{POS_SHORT[p.position]}</span>
        </div>
        <div className="fc-block fc-marine fc-pro-id">
          <span className="fc-title fc-title--md fc-name">{p.gamertag}</span>
          {pro && <span className="fc-pro-sub">{pro}</span>}
          <span className="fc-muted">{POS_LABEL[p.position]} · {p.matchesPlayed} matchs au club</span>
        </div>
      </div>

      <section className="fc-block fc-marine fc-pro" aria-label={`Saison de ${p.gamertag}`}>
        <h2 className="fc-pro-section">Saison <small>au club</small></h2>
        <div className="fc-pro-counts">
          {([[p.matchesPlayed, 'Matchs'], [p.goals, 'Buts'], [p.assists, 'Passes D']] as const).map(([value, label]) => (
            <span key={label}><b>{value}</b>{label}</span>
          ))}
        </div>
        <ProLine label="Hommes du match" value={String(p.motm)} pct={motmPct} active />
        <ProLine label="Victoires quand il joue" value={percent(p.winPct)} pct={p.winPct} />
        <ProLine label="Note moyenne" value={p.avgRating === null ? '—' : frNum(p.avgRating, 1)} pct={p.avgRating === null ? null : p.avgRating * 10} />
        <ProLine label="Passes réussies" value={percent(p.passPct)} pct={p.passPct} />
        <ProLine label="Tirs réussis" value={percent(p.shotPct)} pct={p.shotPct} />
        <ProLine label="Tacles réussis" value={percent(p.tacklePct)} pct={p.tacklePct} />
        <ProLine label="Cartons rouges" value={String(p.redCards)} />

        <h2 className="fc-pro-section">Forme <small>buts et note, ses {p.form.length} derniers matchs</small></h2>
        {p.form.length === 0 ? (
          <p className="fc-muted fc-pro-empty">Aucune feuille de match EA pour l'instant.</p>
        ) : (
          <div className="fc-pro-form">
            {p.form.map((f, i) => (
              <Link key={f.matchId} to={`/matchs/${f.matchId}`} className={i === p.form.length - 1 ? 'is-last' : undefined}
                aria-label={`${f.goals} but${f.goals > 1 ? 's' : ''}, note ${frNum(f.rating, 1)}`}>
                <span>{f.goals}</span>
                <i style={{ height: `${8 + (f.goals / maxGoals) * 52}px` }} />
                <small>{frNum(f.rating, 1)}</small>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
