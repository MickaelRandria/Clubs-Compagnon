import { Link } from 'react-router';
import type { ClubProfile } from '../../../shared/profile';
import type { Account } from '../../../server/auth-http';
import { POS_LABEL, POS_SHORT } from '../../lib/labels';
import { frNum } from '../../lib/format';

export function MyPlayerCard({ player, account, clubName }: { player: NonNullable<ClubProfile['player']>; account: Account; clubName: string }) {
  const stats = [
    ['Matchs', frNum(player.matchesPlayed, 0)], ['Buts', frNum(player.goals, 0)], ['Passes D.', frNum(player.assists, 0)],
    ['Note moyenne', player.avgRating === null ? '—' : frNum(player.avgRating, 1)],
    ['Passes réussies', player.passPct === null ? '—' : `${player.passPct} %`],
    ['Buts / match', player.matchesPlayed ? frNum(player.goals / player.matchesPlayed, 2) : '—'],
  ];
  return <section className="my-player-card" aria-labelledby="my-player-name">
    <div className="my-player-card-top"><span>CLUB PRO · {clubName}</span><span className="profile-badge">Compte validé ✓</span></div>
    <div className="my-player-identity">
      <div className="my-player-rating"><strong>{player.ovr}</strong><span>OVR · {POS_SHORT[player.position]}</span></div>
      <div className="my-player-avatar" aria-hidden="true">{account.avatarUrl
        ? <img src={account.avatarUrl} alt="" width={96} height={96} />
        : <span>{player.gamertag.slice(0, 2).toUpperCase()}</span>}</div>
      <div><p className="profile-eyebrow">Ta carte joueur</p><h2 id="my-player-name"><bdi>{player.gamertag}</bdi></h2><p>{POS_LABEL[player.position]} · {player.isActive ? 'Effectif actif' : 'Ancien membre du club'}</p></div>
    </div>
    <dl className="my-player-stats">{stats.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <div className="my-player-card-bottom"><p>Statistiques enregistrées dans le club · mises à jour le {new Date(player.updatedAt).toLocaleDateString('fr-FR')}</p><Link to="/joueurs">Voir le classement du club ↗</Link></div>
  </section>;
}
