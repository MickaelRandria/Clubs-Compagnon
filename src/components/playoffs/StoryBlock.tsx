import { PLAYOFF_NIGHT } from '../../content/playoffs';
import { CornerShardLg } from '../ui/CornerShardLg';

/** Récit de la soirée — bloc Marine. */
export function StoryBlock() {
  const night = PLAYOFF_NIGHT;
  return (
    <div className="fc-block fc-marine fc-story" style={{ animationDelay: '180ms' }}>
      <CornerShardLg />
      <span className="fc-kicker">La soirée</span>
      <span className="fc-story-title">
        <span>
          {night.wins} victoires, {night.losses} défaite.
        </span>
        <span>
          L'homme des Playoffs : <em>{night.mvp}</em>.
        </span>
      </span>
      <p>{night.story}</p>
    </div>
  );
}
