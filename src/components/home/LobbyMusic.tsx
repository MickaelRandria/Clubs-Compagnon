import { useEffect, useState } from 'react';
import { useLobbyMusic } from '../../api/bets';
import { initials } from '../../lib/player-photos';
import '../../styles/lobby.css';

const clock = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/**
 * « En ce moment dans le lobby » : le titre Spotify en cours chez l'hôte, et le bouton pour rejoindre
 * la Jam. N'apparaît que pendant qu'un titre joue. `compact` : la version de la salle d'attente FoodBet.
 */
export function LobbyMusic({ compact = false }: { compact?: boolean }) {
  const music = useLobbyMusic();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const playing = music.data?.playing;
  if (!playing) return null;
  const elapsed = Math.min(playing.durationMs, playing.progressMs + (now - new Date(playing.at).getTime()));
  const jam = music.data?.jamUrl;
  const cover = playing.cover ? <img className="lb-cover" src={playing.cover} alt="" /> : <span className="lb-cover lb-cover--empty" aria-hidden="true">♪</span>;
  const live = <span className="lb-live"><span className="lb-eq" aria-hidden="true"><i /><i /><i /></span>{compact ? 'Dans le lobby' : 'En ce moment dans le lobby'}</span>;
  if (compact) {
    return <section className="lb lb--compact" aria-label="Musique du lobby">
      {cover}
      <div className="lb-info">{live}<strong className="lb-title">{playing.title}</strong><span className="lb-artist">{playing.artist}</span></div>
      {jam && <a className="lb-jam" href={jam} target="_blank" rel="noreferrer">Jam</a>}
    </section>;
  }
  return <section className="lb" aria-label="Musique du lobby">
    {cover}
    <div className="lb-info">
      {live}
      <strong className="lb-title">{playing.title}</strong>
      <span className="lb-artist">{playing.artist}{playing.album ? ` · ${playing.album}` : ''}</span>
      <div className="lb-bar" role="progressbar" aria-valuemin={0} aria-valuemax={playing.durationMs} aria-valuenow={elapsed}>
        <i style={{ width: `${(elapsed / Math.max(1, playing.durationMs)) * 100}%` }} /></div>
      <div className="lb-times"><span>{clock(elapsed)}</span><span>{clock(playing.durationMs)}</span></div>
    </div>
    {music.data?.host && <p className="lb-host"><span className="lb-host-av" aria-hidden="true">{initials(music.data.host)}</span>Mis par {music.data.host}</p>}
    {jam && <a className="lb-jam lb-jam--wide" href={jam} target="_blank" rel="noreferrer">Rejoindre la Jam <small>· s’ouvre dans Spotify</small></a>}
    {music.data?.next && <p className="lb-next">Ensuite : <b>{music.data.next.title}</b> — {music.data.next.artist}</p>}
  </section>;
}
