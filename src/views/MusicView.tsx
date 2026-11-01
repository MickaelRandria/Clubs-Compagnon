import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { LobbyConsole, LobbyPlayback, LobbyTrack, SpotifyCommand } from '../../shared/lobby';
import { useMe } from '../api/auth';
import { useLobbyConsole, useLobbySearch, useLobbyVisibility, useSpotifyControl, useSpotifyQueue } from '../api/bets';
import { SignInButton } from '../components/fc27/SignIn';
import { usePageTitle } from '../lib/hooks';
import '../styles/music.css';

const clock = (ms: number) => { const seconds = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`; };
const spotifyUrl = (track: LobbyTrack) => track.url ?? `https://open.spotify.com/search/${encodeURIComponent(`${track.title} ${track.artist}`)}`;

function SpotifyMark() {
  return <a className="lm-spotify" href="https://open.spotify.com" target="_blank" rel="noreferrer" aria-label="Ouvrir Spotify"><img src="/images/ui/spotify-logo.svg" alt="Spotify" /></a>;
}

function Artwork({ track, small = false }: { track: LobbyTrack; small?: boolean }) {
  return <a className={`lm-artwork${small ? ' lm-artwork--small' : ''}`} href={spotifyUrl(track)} target="_blank" rel="noreferrer" aria-label={`Ouvrir ${track.title} dans Spotify`}>
    {track.cover ? <img src={track.cover} alt="" loading="lazy" /> : <span aria-hidden="true">♪</span>}
  </a>;
}

function Playback({ playback }: { playback: LobbyPlayback }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!playback.isPlaying) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [playback.isPlaying, playback.at]);
  const track = playback.track;
  if (!track) return <p className="lm-copy">Aucun morceau dans le lecteur. Ouvre Spotify et lance un titre sur un appareil.</p>;
  const elapsed = Math.min(track.durationMs, Math.max(0, playback.progressMs
    + (playback.isPlaying ? Math.max(0, now - Date.parse(playback.at)) : 0)));
  return <>
    <div className="lm-song"><Artwork track={track} /><a className="lm-song-info" href={spotifyUrl(track)} target="_blank" rel="noreferrer"><strong>{track.title}</strong><span>{track.artist}</span>{track.album && <small>{track.album}</small>}</a></div>
    <div className="lm-progress" role="progressbar" aria-label="Progression du morceau" aria-valuemin={0} aria-valuemax={track.durationMs} aria-valuenow={elapsed} aria-valuetext={`${clock(elapsed)} sur ${clock(track.durationMs)}`}><i style={{ width: `${elapsed / Math.max(1, track.durationMs) * 100}%` }} /></div>
    <div className="lm-times"><span>{clock(elapsed)}</span><span>{clock(track.durationMs)}</span></div>
  </>;
}

function CommandIcon({ action }: { action: SpotifyCommand }) {
  const paths: Record<SpotifyCommand, string> = {
    previous: 'M5 4h3v16H5zM19 4v16L9 12z', next: 'M16 4h3v16h-3zM5 4l10 8L5 20z',
    pause: 'M6 4h4v16H6zM14 4h4v16h-4z', play: 'M6 3l15 9L6 21z',
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={paths[action]} /></svg>;
}

const COMMAND_STATUS: Record<SpotifyCommand, string> = {
  play: 'Reprise demandée à Spotify.', pause: 'Pause demandée à Spotify.',
  next: 'Morceau suivant demandé à Spotify.', previous: 'Morceau précédent demandé à Spotify.',
};

function SearchPanel({ accountId, state }: { accountId: number; state: LobbyConsole }) {
  const [input, setInput] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [validation, setValidation] = useState('');
  const [added, setAdded] = useState<Set<string>>(() => new Set());
  const [confirmation, setConfirmation] = useState('');
  const search = useLobbySearch(accountId, submitted, state.canSearch);
  const queue = useSpotifyQueue(accountId);
  function submit(event: FormEvent) {
    event.preventDefault();
    const value = input.trim();
    if (value.length < 2 || value.length > 100) { setValidation('Saisis un titre ou un artiste avec 2 à 100 caractères.'); return; }
    setValidation(''); setConfirmation(''); queue.reset();
    if (value === submitted) void search.refetch();
    else { setAdded(new Set()); setSubmitted(value); }
  }
  return <section className="lm-panel" aria-labelledby="music-search-title">
    <p className="lm-eyebrow">Le prochain son</p><h2 id="music-search-title">Prépare la file</h2>
    <p className="lm-copy">Trouve un morceau et ajoute-le à la file de l’hôte. Tous les membres connectés peuvent participer.</p>
    {!state.connected && <p className="lm-notice">L’hôte doit d’abord relier son Spotify depuis son profil admin.</p>}
    {state.connected && !state.canQueue && <p className="lm-notice">L’hôte doit autoriser les commandes Spotify avant les ajouts à la file.</p>}
    <form onSubmit={submit} className="lm-search-form">
      <label htmlFor="music-search">Rechercher un titre ou un artiste</label>
      <div className="lm-search-box"><input id="music-search" type="search" value={input} maxLength={100} autoComplete="off" disabled={!state.canSearch} onChange={(event) => { setInput(event.target.value); setValidation(''); }} placeholder="Un titre, un artiste…" /><button className="lm-button" disabled={!state.canSearch || search.isFetching}>{search.isFetching ? 'Recherche…' : 'Rechercher'}</button></div>
    </form>
    {validation && <p className="lm-error" role="alert">{validation}</p>}
    {search.isFetching && <p className="lm-copy" role="status">Recherche dans Spotify…</p>}
    {search.isError && <p className="lm-error" role="alert">{search.error.message}</p>}
    {submitted && search.isSuccess && !search.isFetching && <>
      <div className="lm-results-label"><span>{search.data.tracks.length ? `${search.data.tracks.length} résultat${search.data.tracks.length > 1 ? 's' : ''}` : 'Aucun morceau trouvé'}</span><SpotifyMark /></div>
      <ul className="lm-results">{search.data.tracks.slice(0, 10).map((track) => <li key={track.uri} className="lm-result">
        <Artwork track={track} small /><a className="lm-result-info" href={spotifyUrl(track)} target="_blank" rel="noreferrer"><strong>{track.title}</strong><span>{track.artist}</span><small>{clock(track.durationMs)}</small></a>
        <button type="button" className={`lm-add${added.has(track.uri) ? ' lm-add--done' : ''}`} disabled={!state.canQueue || queue.isPending || added.has(track.uri)} aria-label={added.has(track.uri) ? `${track.title} ajouté à la file` : `Ajouter ${track.title} à la file`} onClick={() => {
          setConfirmation(''); queue.mutate(track.uri, { onSuccess: () => {
            setAdded((previous) => new Set([...previous, track.uri]));
            setConfirmation(`${track.title} ajouté à la file de l’hôte.`);
          } });
        }}>{queue.isPending && queue.variables === track.uri ? '…' : added.has(track.uri) ? '✓' : '+'}</button>
      </li>)}</ul>
    </>}
    {queue.isError && <p className="lm-error" role="alert">{queue.error.message}</p>}
    {confirmation && <p className="lm-success" role="status">{confirmation}</p>}
  </section>;
}

function MusicConsole({ accountId }: { accountId: number }) {
  const query = useLobbyConsole(accountId);
  const control = useSpotifyControl(accountId);
  const visibility = useLobbyVisibility(accountId);
  const busy = control.isPending || visibility.isPending;
  // Une erreur retire aussi les anciennes données du lecteur privé.
  const state = query.isError ? undefined : query.data;
  if (!state) return <section className="lm-panel">{query.isError ? <><p className="lm-error" role="alert">{query.error.message}</p><button className="lm-button" onClick={() => void query.refetch()}>Réessayer</button></> : <p role="status">Chargement de la musique du lobby…</p>}</section>;
  const toggleAction = state.playback?.isPlaying ? 'pause' : 'play';
  return <>
    {(state.isHost || state.playback) && <section className="lm-panel" aria-label="Lecteur de l’hôte">
      {state.isHost && <>
        <p className="lm-identity"><strong>{state.host || 'Ton compte'} · hôte</strong><span>● Spotify relié</span></p>
        <div className="lm-share"><div><strong>Afficher la musique aux autres</strong><p>Sur l’accueil et dans FoodBet.</p></div><button type="button" className={`lm-toggle${state.visible ? ' lm-toggle--on' : ''}`} role="switch" aria-checked={state.visible} aria-label="Afficher la musique aux autres" disabled={busy} onClick={() => { control.reset(); visibility.mutate({ visible: !state.visible }); }}><i /></button></div>
        <p className={`lm-notice${state.visible ? '' : ' lm-notice--private'}`}>{state.visible ? 'Visible par le club pendant qu’un morceau joue.' : 'Musique masquée pour les autres. Tu gardes les commandes ici.'}</p>
        {visibility.isError && <p className="lm-error" role="alert">{visibility.error.message}</p>}
        {visibility.isSuccess && <p className="lm-success" role="status">{visibility.data.visible ? 'Musique visible pour le club.' : 'Musique masquée pour les autres.'}</p>}
      </>}
      {state.needsReconnect && <div className="lm-reconnect"><strong>Active les commandes Spotify</strong><p>Relie à nouveau ton compte pour autoriser pause, suivant et ajout à la file.</p><a className="lm-button" href="/api/auth/spotify">Autoriser les commandes Spotify</a></div>}
      <div className="lm-player">
        <div className="lm-player-top"><span className="lm-playing">{state.playback?.isPlaying ? (state.isHost ? 'En cours chez toi' : 'En ce moment dans le lobby') : state.playback?.track ? 'Lecteur en pause' : 'Lecteur Spotify'}</span><SpotifyMark /></div>
        {state.playback ? <Playback playback={state.playback} /> : <p className="lm-copy">Aucun morceau dans le lecteur.</p>}
        {state.isHost && <>
          <p className="lm-control-title">Commandes sur ton Spotify</p>
          <div className="lm-controls">
            <button type="button" className="lm-control" aria-label="Morceau précédent" disabled={!state.canControl || busy} onClick={() => { visibility.reset(); control.mutate({ action: 'previous' }); }}><CommandIcon action="previous" /></button>
            <button type="button" className="lm-control lm-control--main" aria-label={toggleAction === 'pause' ? 'Mettre en pause' : 'Reprendre la lecture'} disabled={!state.canControl || busy} onClick={() => { visibility.reset(); control.mutate({ action: toggleAction }); }}><CommandIcon action={toggleAction} /></button>
            <button type="button" className="lm-control" aria-label="Morceau suivant" disabled={!state.canControl || busy} onClick={() => { visibility.reset(); control.mutate({ action: 'next' }); }}><CommandIcon action="next" /></button>
          </div>
          <p className="lm-hint">Un compte Premium et un lecteur Spotify actif sont nécessaires.</p>
          {control.isPending && <p className="lm-copy" role="status">Commande envoyée à Spotify…</p>}
          {control.isError && <p className="lm-error" role="alert">{control.error.message}</p>}
          {control.isSuccess && <p className="lm-success" role="status">{COMMAND_STATUS[control.variables.action]}</p>}
        </>}
        {state.jamUrl && <a className="lm-jam" href={state.jamUrl} target="_blank" rel="noreferrer">Rejoindre la Jam ↗</a>}
      </div>
    </section>}
    <SearchPanel accountId={accountId} state={state} />
    {state.isHost && <p className="lm-footer"><Link to="/profil">Gérer la connexion Spotify et le lien de la Jam dans mon profil ↗</Link></p>}
  </>;
}

export function MusicView() {
  usePageTitle('Musique du lobby');
  const me = useMe();
  const accountId = me.data?.signedIn ? me.data.account.id : null;
  return <div className="fc-view lm-view">
    <Link className="lm-back" to="/">← Retour au club</Link>
    <header className="lm-heading"><p className="lm-eyebrow">Le son du club</p><h1 className="fc-title">Musique du lobby</h1><p>Le prochain morceau de la soirée se prépare ici.</p></header>
    {me.isPending ? <p role="status">Vérification de ton compte…</p> : me.isError ? <section className="lm-panel"><p role="alert">{me.error.message}</p><button className="lm-button" onClick={() => void me.refetch()}>Réessayer</button></section> : accountId === null ? <section className="lm-panel"><h2>Choisis le prochain son</h2><p className="lm-copy">Connecte-toi avec Discord pour rechercher des morceaux et les ajouter à la file de l’hôte.</p><SignInButton className="lm-button" /></section> : <MusicConsole key={accountId} accountId={accountId} />}
  </div>;
}
