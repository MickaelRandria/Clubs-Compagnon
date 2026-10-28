import type { Club, Match } from '../../../shared/types';
import { HeroShards } from '../ui/HeroShards';
import { Tile } from '../ui/Tile';

/** La série en cours, calculée par EA : c'est ce qu'on lit en premier en ouvrant l'app. */
function streakTitle(club: Club) {
  if (club.winStreak >= 2) return `${club.winStreak} victoires de suite`;
  if (club.unbeatenStreak >= 2) return `Invaincus depuis ${club.unbeatenStreak} matchs`;
  return 'Skill Rating';
}

/** A · Série en cours et skill rating — aplat Bleu Dommage. */
export function StreakTile({ club, last }: { club: Club; last: Match | undefined }) {
  const lastLine = last ? `Dernier : ${last.goalsFor}–${last.goalsAgainst} contre ${last.opponent}. ` : '';
  return (
    <Tile className="fc-hero fc-series" to="/club" delay={0}>
      <span className="fc-hero-copy">
        <span className="fc-badge">Série en cours · EA</span>
        <span className="fc-title fc-title--xl">{streakTitle(club)}</span>
        <span className="fc-body">
          {lastLine}{club.wins} V · {club.draws} N · {club.losses} D au total.
        </span>
      </span>
      <span className="fc-hero-art">
        <HeroShards />
        <span className="fc-hero-trend">Skill rating</span>
        <span className="fc-hero-num">{club.skillRating}</span>
      </span>
    </Tile>
  );
}
