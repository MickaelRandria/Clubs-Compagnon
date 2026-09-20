import type { Club } from '../../../shared/types';
import { frNum, signed } from '../../lib/format';
import { Glyph } from '../ui/Glyph';
import { HeroShards } from '../ui/HeroShards';
import { Spill } from '../ui/Spill';
import { Tile } from '../ui/Tile';

/** A · Skill Rating — aplat Bleu Dommage (équivalent « Seasons »). */
export function HeroTile({ club }: { club: Club }) {
  const games = Math.max(club.gamesPlayed, 1);
  const goalDiff = club.goalsFor - club.goalsAgainst;
  const kpis = [
    [`${Math.round((club.wins / games) * 100)}%`, 'Victoires'],
    [frNum(club.goalsFor / games), 'Buts / match'],
    [signed(goalDiff), 'Diff. buts'],
  ];
  const trend = club.skillRatingTrend;

  return (
    <Tile className="fc-hero" to="/stats" delay={0}>
      <span className="fc-hero-copy">
        <span className="fc-title fc-title--xl">Skill Rating</span>
        <span className="fc-body">
          {club.name}, {club.region}. Réputation {club.reputation} après {club.gamesPlayed} matchs en Pro Clubs.
        </span>
        <span className="fc-mention">
          <Glyph name="bars" />
          <span>
            {club.wins} V · {club.draws} N · {club.losses} D
          </span>
        </span>
        <span className="fc-kpis">
          {kpis.map(([value, label]) => (
            <span key={label}>
              <span className="fc-kpi-value">{value}</span>
              <span className="fc-kpi-label">{label}</span>
            </span>
          ))}
        </span>
      </span>

      <span className="fc-hero-art">
        <HeroShards />
        {trend !== null && (
          <span className="fc-hero-trend">
            {trend >= 0 ? '▲' : '▼'} {signed(trend)} ce mois
          </span>
        )}
        <span className="fc-hero-num">{club.skillRating}</span>
      </span>

      <Spill at="bottom" />
      <Spill at="edge" />
    </Tile>
  );
}
