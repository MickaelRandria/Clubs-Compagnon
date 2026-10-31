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
  const playing = music.isError ? null : music.data?.playing;
  const measuredAt = playing?.at;
  useEffect(() => {
    if (!measuredAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [measuredAt]);
  // Une connexion perdue ne doit pas laisser un ancien morceau annoncé « en ce moment ».
  if (!playing || now - music.dataUpdatedAt > 45_000) return null;
  const elapsed = Math.max(0, Math.min(playing.durationMs, playing.progressMs + Math.max(0, now - new Date(playing.at).getTime())));
  const jam = music.data?.jamUrl;
  const trackUrl = playing.url ?? `https://open.spotify.com/search/${encodeURIComponent(`${playing.title} ${playing.artist}`)}`;
  const trackLabel = `${playing.title} — ${playing.artist}${playing.album ? ` · ${playing.album}` : ''}`;
  const cover = <a className="lb-artwork" href={trackUrl} target="_blank" rel="noreferrer" aria-label={`Ouvrir ${playing.title} dans Spotify`}>
    {playing.cover ? <img className="lb-cover" src={playing.cover} alt="" /> : <span className="lb-cover lb-cover--empty" aria-hidden="true">♪</span>}
  </a>;
  const live = <span className="lb-live"><span className="lb-eq" aria-hidden="true"><i /><i /><i /></span>{compact ? 'Dans le lobby' : 'En ce moment dans le lobby'}</span>;
  const spotify = <a className="lb-spotify" href={trackUrl} target="_blank" rel="noreferrer" aria-label="Ouvrir dans Spotify"><img src="/images/ui/spotify-logo.svg" alt="Spotify" /></a>;
  if (compact) {
    return <section className="lb lb--compact" aria-label="Musique du lobby">
      {cover}
      <div className="lb-info">{live}<a className="lb-track" href={trackUrl} title={trackLabel} target="_blank" rel="noreferrer"><strong className="lb-title">{playing.title}</strong><span className="lb-artist">{playing.artist}</span></a>{spotify}</div>
      {jam && <a className="lb-jam" href={jam} target="_blank" rel="noreferrer" aria-label="Rejoindre la Jam">Jam</a>}
    </section>;
  }
  return <section className="lb" aria-label="Musique du lobby">
    <div className="lb-heading">{live}{spotify}</div>
    {cover}
    <div className="lb-info">
      <a className="lb-track" href={trackUrl} title={trackLabel} target="_blank" rel="noreferrer"><strong className="lb-title">{playing.title}</strong><span className="lb-artist">{playing.artist}{playing.album ? ` · ${playing.album}` : ''}</span></a>
      <div className="lb-bar" role="progressbar" aria-label="Progression du morceau" aria-valuemin={0} aria-valuemax={playing.durationMs} aria-valuenow={elapsed} aria-valuetext={`${clock(elapsed)} sur ${clock(playing.durationMs)}`}>
        <i style={{ width: `${(elapsed / Math.max(1, playing.durationMs)) * 100}%` }} /></div>
      <div className="lb-times"><span>{clock(elapsed)}</span><span>{clock(playing.durationMs)}</span></div>
    </div>
    {music.data?.host && <p className="lb-host"><span className="lb-host-av" aria-hidden="true">{initials(music.data.host)}</span>Mis par {music.data.host}</p>}
    {jam && <a className="lb-jam lb-jam--wide" href={jam} target="_blank" rel="noreferrer">Rejoindre la Jam <small>· s’ouvre dans Spotify</small></a>}
    {music.data?.next && <p className="lb-next">Ensuite : <a href={music.data.next.url ?? `https://open.spotify.com/search/${encodeURIComponent(`${music.data.next.title} ${music.data.next.artist}`)}`} target="_blank" rel="noreferrer"><b>{music.data.next.title}</b> — {music.data.next.artist}</a></p>}
  </section>;
}
