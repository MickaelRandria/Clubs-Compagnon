import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { divisionLabel } from '../../../shared/division';
import type { DivisionEvent } from '../../../shared/types';
import { useClub } from '../../api/queries';

// Célébration d'une montée : jouée une fois par appareil à l'ouverture de l'app, rejouable depuis
// Club › Progression. Un écran d'accroche demande un tap : les navigateurs ne laissent jouer le son
// qu'après un geste. Sons générés avec ElevenLabs (public/sons/), calés sur la timeline CSS.

const SEEN_KEY = 'foodball.celebration.seen';
const MUTE_KEY = 'foodball.celebration.muted';
/** Au-delà, une montée n'est plus une nouvelle : pas de célébration à l'ouverture. */
const FRESH_MS = 3 * 24 * 3_600_000;
const REPLAY_EVENT = 'foodball:celebrate';
const CUES = [
  { at: 0, src: '/sons/whoosh.mp3', volume: 0.7 },
  { at: 1150, src: '/sons/impact.mp3', volume: 1 },
  { at: 2050, src: '/sons/foule.mp3', volume: 0.75 },
];

const read = (key: string) => { try { return window.localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { window.localStorage.setItem(key, value); } catch { /* stockage refusé */ } };

/** Rejoue la célébration d'une montée (bouton de Club › Progression). */
export function replayCelebration(eventId: number) {
  window.dispatchEvent(new CustomEvent(REPLAY_EVENT, { detail: eventId }));
}

/** Blason : « Division » + numéro, ou « Élite ». */
function Crest({ division, className }: { division: number; className: string }) {
  return (
    <span className={`fc-celeb-slot ${className}`}>
      <span className="fc-celeb-shield" />
      <span className="fc-celeb-in">
        {division <= 1 ? <b className="is-elite">ÉLITE</b> : <><small>DIVISION</small><b>{division - 1}</b></>}
        {className.includes('is-new') && <span className="fc-celeb-sheen" />}
      </span>
    </span>
  );
}

export function PromotionCelebration() {
  const club = useClub();
  const events = club.data?.divisionEvents;
  const [event, setEvent] = useState<DivisionEvent | null>(null);
  const [phase, setPhase] = useState<'intro' | 'play'>('intro');
  const [run, setRun] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const [muted, setMuted] = useState(() => read(MUTE_KEY) === '1');
  const [shared, setShared] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement[]>([]);
  const timers = useRef<number[]>([]);

  // Ouverture automatique : la montée la plus récente, encore fraîche, pas encore vue sur cet appareil.
  useEffect(() => {
    const latest = events?.[0];
    if (!latest || latest.kind !== 'promotion' || Date.now() - Date.parse(latest.at) > FRESH_MS) return;
    if (read(SEEN_KEY) === String(latest.id)) return;
    setEvent(latest);
    setPhase('intro');
  }, [events]);

  const stopSounds = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    audio.current.forEach((a) => { a.pause(); a.currentTime = 0; });
  }, []);

  const start = useCallback((withSound: boolean) => {
    stopSounds();
    setSkipped(false);
    setPhase('play');
    setRun((n) => n + 1);
    if (!withSound) return;
    if (audio.current.length === 0) audio.current = CUES.map((c) => Object.assign(new Audio(c.src), { volume: c.volume, preload: 'auto' }));
    CUES.forEach((c, i) => {
      timers.current.push(window.setTimeout(() => { void audio.current[i].play().catch(() => {}); }, c.at));
    });
  }, [stopSounds]);

  // Rejouer depuis la page Club : c'est un tap, le son peut partir tout de suite.
  useEffect(() => {
    const onReplay = (e: Event) => {
      const found = events?.find((x) => x.id === (e as CustomEvent<number>).detail);
      if (!found) return;
      setEvent(found);
      start(!muted);
    };
    window.addEventListener(REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(REPLAY_EVENT, onReplay);
  }, [events, muted, start]);

  const close = useCallback(() => {
    if (event) write(SEEN_KEY, String(event.id));
    stopSounds();
    setEvent(null);
    setShared(null);
  }, [event, stopSounds]);

  useEffect(() => {
    if (!event) return;
    document.body.classList.add('fc-celeb-open');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.classList.remove('fc-celeb-open'); window.removeEventListener('keydown', onKey); };
  }, [event, close]);

  useEffect(() => stopSounds, [stopSounds]);

  if (!event || event.fromDivision === null) return null;
  const to = divisionLabel(event.toDivision);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    write(MUTE_KEY, next ? '1' : '0');
    if (next) stopSounds();
  };

  const share = async () => {
    const text = `${club.data?.name ?? 'Le club'} monte en ${to} !`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Promus !', text, url: window.location.origin });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${window.location.origin}`);
      setShared('Lien copié');
    } catch {
      // Partage annulé par l'utilisateur : rien à signaler.
    }
  };

  const points = event.points;
  const cells = points === null ? 0 : Math.max(1, Math.ceil(points / 3));

  return createPortal(
    <div className="fc-celeb" role="dialog" aria-modal="true" aria-label={`Montée en ${to}`}>
      {phase === 'intro' ? (
        <button type="button" className="fc-celeb-intro" onClick={() => start(!muted)} autoFocus>
          <span className="fc-celeb-intro-crest" aria-hidden="true"><span className="fc-celeb-shield" /><b>?</b></span>
          <span className="fc-celeb-intro-kicker">Une nouvelle t'attend</span>
          <span className="fc-celeb-intro-cta">Touche pour découvrir</span>
        </button>
      ) : (
        <div key={run} className={`fc-celeb-stage${skipped ? ' is-skip' : ''}`}>
          <div className="fc-celeb-cam">
            <div className="fc-celeb-bg" aria-hidden="true" />
            <div className="fc-celeb-beam" aria-hidden="true" />
            <div className="fc-celeb-parts is-back" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <i key={i} />)}</div>
            <div className="fc-celeb-col">
              <div className="fc-celeb-zone">
                <div className="fc-celeb-rays" aria-hidden="true" />
                <span aria-hidden="true"><Crest division={event.fromDivision} className="is-old" /></span>
                <span className="fc-celeb-slot" aria-hidden="true">
                  {[1, 2, 3, 4].map((n) => <span key={n} className={`fc-celeb-shard s${n}`} />)}
                </span>
                <span className="fc-celeb-sparks" aria-hidden="true">{Array.from({ length: 15 }, (_, i) => <i key={i} style={{ '--a': `${i * 24}deg` } as CSSProperties} />)}</span>
                <span className="fc-celeb-ring r3" aria-hidden="true" />
                <span className="fc-celeb-ring" aria-hidden="true" />
                <span className="fc-celeb-ring r2" aria-hidden="true" />
                <span role="img" aria-label={`Blason ${to}`}><Crest division={event.toDivision} className="is-new" /></span>
                <span className="fc-celeb-twinkles" aria-hidden="true">{Array.from({ length: 6 }, (_, i) => <i key={i} />)}</span>
              </div>
              <h2 className="fc-celeb-title" aria-label="Promus">{'PROMUS'.split('').map((l, i) => <span key={i} aria-hidden="true">{l}</span>)}</h2>
              <div className="fc-celeb-sub"><i>{divisionLabel(event.fromDivision)}</i><span aria-hidden="true">→</span><b>{to}</b></div>
              {points !== null && (
                <div className="fc-celeb-pts" role="img" aria-label={`${points} points`}>
                  <span className="fc-celeb-pts-head"><span>Objectif atteint</span>
                    <span className="fc-celeb-count" style={{ '--n': points } as CSSProperties}><small> PTS</small></span></span>
                  <span className="fc-celeb-gauge" style={{ gridTemplateColumns: `repeat(${cells}, minmax(0, 1fr))` }}>
                    {Array.from({ length: cells }, (_, i) => <span key={i}><i style={{ animationDelay: `${3.05 + i * 0.13}s` }} /></span>)}
                  </span>
                </div>
              )}
              <div className="fc-celeb-stats">
                {event.record && <span><b>{event.record.wins}V {event.record.draws}N {event.record.losses}D</b><small>dans la division</small></span>}
                <span><b>{club.data?.promotions ?? '—'}</b><small>montées au total</small></span>
                {event.match && <span><b>{event.match.goalsFor} – {event.match.goalsAgainst}</b><small>vs {event.match.opponent}</small></span>}
              </div>
              <div className="fc-celeb-actions">
                <button type="button" className="fc-celeb-cta" onClick={() => void share()}>{shared ?? 'Partager la montée'}</button>
                <div>
                  <button type="button" className="fc-celeb-ghost" onClick={() => start(!muted)}>Rejouer</button>
                  <button type="button" className="fc-celeb-ghost" onClick={close}>Continuer</button>
                </div>
              </div>
            </div>
            <div className="fc-celeb-parts" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <i key={i} />)}</div>
            <div className="fc-celeb-parts is-front" aria-hidden="true">{Array.from({ length: 4 }, (_, i) => <i key={i} />)}</div>
          </div>
          <div className="fc-celeb-flash" aria-hidden="true" />
          <div className="fc-celeb-flash f2" aria-hidden="true" />
          <div className="fc-celeb-wipe w1" aria-hidden="true" />
          <div className="fc-celeb-wipe w2" aria-hidden="true" />
          <div className="fc-celeb-wipe w3" aria-hidden="true" />
          <div className="fc-celeb-ticker" aria-hidden="true">PROMOTION · PROMOTION · PROMOTION</div>
        </div>
      )}
      <div className="fc-celeb-tools">
        <button type="button" onClick={toggleMute} aria-pressed={!muted}>{muted ? 'Son coupé' : 'Son'}</button>
        {phase === 'play' && !skipped
          ? <button type="button" onClick={() => { stopSounds(); setSkipped(true); }}>Passer</button>
          : <button type="button" onClick={close}>Fermer</button>}
      </div>
    </div>,
    document.body,
  );
}
