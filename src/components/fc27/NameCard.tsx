import type { CSSProperties } from 'react';
import type { FC27Proposal } from '../../../shared/fc27';

export function ClubCrest({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 100 118" fill="none" aria-hidden="true">
    <path d="M50 4 94 20v43c0 24-26 42-44 51C32 105 6 87 6 63V20Z" fill="currentColor" fillOpacity=".06" stroke="currentColor" strokeWidth="1.5" />
    <path d="m50 12 36 13v38c0 18-20 34-36 43-16-9-36-25-36-43V25Z" stroke="currentColor" strokeOpacity=".4" />
    <path d="m20 72 60-36v14L20 86Z" fill="currentColor" fillOpacity=".12" />
    <text x="50" y="74" textAnchor="middle" fill="currentColor" fontFamily="Barlow Condensed, Arial Narrow, sans-serif" fontSize="44" fontWeight="800" fontStyle="italic">27</text>
    <path d="m50 20 2 5 5 .4-4 3 1.4 5-4.4-3-4.4 3 1.4-5-4-3 5-.4Z" fill="currentColor" />
  </svg>;
}

/**
 * Carte FUT d'un nom. `votes` est le score à afficher (celui de l'étape en cours, ou du premier
 * tour dans les archives) ; `category` remplace la mention « Identité du club ».
 */
export function NameCard({ proposal, votes = proposal.votes, number, winner = false, category }: {
  proposal: FC27Proposal; votes?: number; number: number; winner?: boolean; category?: string;
}) {
  return <div className={`name-card${winner ? ' name-card--winner' : ''}`}>
    <div className="name-card-surface">
      <div className="name-card-top"><span className="name-card-score"><strong>{votes}</strong><small>vote{votes > 1 ? 's' : ''}</small></span><span className="name-card-edition">FC<span>27</span></span></div>
      <ClubCrest className="name-card-crest" />
      <span className="name-card-category">{category ?? (winner ? '★ Le nom du collectif' : 'Identité du club')}</span>
      <h3>{proposal.club_name}</h3>
      <div className="name-card-author"><span>Proposé par</span><strong><bdi>{proposal.author_pseudo}</bdi></strong></div>
      <div className="name-card-bottom"><span>DOMMAGE · NOUVELLE ÈRE</span><span>{String(number).padStart(2, '0')}</span></div>
    </div>
  </div>;
}

/** Index d'entrée pour décaler les animations de cartes (`--i` dans fc27-naming.css). */
export const stagger = (index: number) => ({ '--i': index }) as CSSProperties;
