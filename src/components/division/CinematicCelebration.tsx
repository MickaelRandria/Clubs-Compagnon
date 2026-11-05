import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { divisionLabel } from '../../../shared/division';
import type { Club, DivisionEvent } from '../../../shared/types';

// Séquence de montée en noir et or : voix off, silence, projecteur sur le blason, Promus.
// Image et son sont calés sur une seule piste mixée (public/sons/celebration/) : les temps
// ci-dessous et dans styles/cinematic.css suivent ce mix, à refaire ensemble.

const W = 390;
const H = 844;
/** Fin des animations : l'écran Promus reste affiché, la musique continue jusqu'à la fin de la piste. */
const END_S = 50.2;
/** Début de Promus dans la piste : « Passer » y saute pour garder la musique. */
const PROMUS_S = 41.5;

type Line = { text: string; start: number; end: number; big?: boolean };

export interface CinematicScript {
  audio: string;
  /** MP4 vertical de la séquence, à partager (rendu par scripts/render-celebration-video.ts). */
  video?: string;
  lines: Line[];
}

/** Séquences enregistrées. La voix off nomme la date et la division : une par montée. */
const SCRIPTS: { toDivision: number; date: string; script: CinematicScript }[] = [
  {
    toDivision: 2,
    date: '2026-11-04',
    script: {
      audio: '/sons/celebration/montee-d1.mp3',
      video: '/videos/montee-d1.mp4',
      lines: [
        { text: 'Il y a ceux qui rêvent de la Division 1.', start: 3.0, end: 7.4 },
        { text: 'Et il y a ceux… qui vont la chercher.', start: 8.5, end: 12.7 },
        { text: 'Le 4 novembre… le FoodBall Club l’a fait.', start: 14.0, end: 19.2 },
        { text: 'Le FoodBall Club… ne rêve plus.', start: 20.5, end: 25.4, big: true },
      ],
    },
  },
];

const parisDay = (iso: string) => new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(new Date(iso));

/** La séquence enregistrée pour cette montée, sinon null (la célébration courte prend le relais). */
export function cinematicFor(event: DivisionEvent): CinematicScript | null {
  if (event.kind !== 'promotion') return null;
  const day = parisDay(event.at);
  return SCRIPTS.find((s) => s.toDivision === event.toDivision && s.date === day)?.script ?? null;
}

// Décor : positions fixes, pour que la séquence soit la même à chaque lecture.
type Bokeh = [number, number, number, number, number, number];
const bokehStyle = (list: Bokeh[]) => list.map(([left, top, size, opacity, dx, dy], i) => ({
  left, top, width: size, height: size, opacity, '--dx': `${dx}px`, '--dy': `${dy}px`,
  animationDuration: `${12 + (i % 4) * 3}s`, animationDelay: `${-i * 2.1}s`,
}) as CSSProperties);
const BOKEH = bokehStyle([[-30, 60, 120, .2, 30, 20], [250, 30, 70, .32, -20, 30], [300, 260, 140, .12, -30, -20], [40, 300, 46, .4, 20, -30], [180, 420, 90, .16, 25, 15],
  [-20, 520, 80, .18, 30, -10], [290, 470, 38, .45, -15, -25], [120, 130, 30, .36, 15, 25], [220, 700, 110, .1, -25, -20]]);
const BOKEH2 = bokehStyle([[-40, 120, 110, .26, 20, 15], [300, 90, 80, .34, -20, 20], [20, 600, 70, .3, 25, -15], [290, 560, 120, .2, -20, -20], [160, 760, 60, .34, 10, -20],
  [330, 380, 40, .45, -10, 15], [-10, 380, 36, .4, 15, 10]]);
const DUST = Array.from({ length: 22 }, (_, j) => {
  const size = j % 4 === 0 ? 3 : 2;
  return { left: Math.round(195 + (((j * 53) % 41) - 20) * (2 + (j % 5) * 1.6)), width: size, height: size, opacity: 0.45 + (j % 3) * 0.25,
    animationDuration: `${(7 + (j % 5) * 1.6).toFixed(1)}s`, animationDelay: `${(-(j * 0.93) % 9).toFixed(2)}s` } as CSSProperties;
});
const GLITS = Array.from({ length: 14 }, (_, g) => ({ left: 60 + ((g * 71) % 270), top: 462 + ((g * 17) % 34), animationDelay: `${-(g * 0.37)}s` }) as CSSProperties);
const SPARKS = Array.from({ length: 18 }, (_, k) => {
  const a = (k / 18) * Math.PI * 2;
  const r = 90 + (k % 4) * 45;
  return { '--x': `${Math.round(Math.cos(a) * r)}px`, '--y': `${Math.round(Math.sin(a) * r * 0.8 + 40)}px`, animationDelay: `${(41.55 + (k % 3) * 0.08).toFixed(2)}s` } as CSSProperties;
});

function Glint() {
  return <span className="fcq-glint" />;
}

/** Échelle qui fait tenir la scène 390 × 844 dans l'écran. */
function useFit() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / W, window.innerHeight / H));
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  return scale;
}

interface Props {
  club: Club | undefined;
  event: DivisionEvent;
  script: CinematicScript;
  muted: boolean;
  /** true : lancée par un tap (rejouer), pas besoin de l'écran d'accroche. */
  autoplay: boolean;
  onToggleMute: () => void;
  onClose: () => void;
  onShare: () => void;
  shareLabel: string | null;
}

export function CinematicCelebration({ club, event, script, muted, autoplay, onToggleMute, onClose, onShare, shareLabel }: Props) {
  const scale = useFit();
  const [phase, setPhase] = useState<'gate' | 'loading' | 'play'>('gate');
  const [run, setRun] = useState(0);
  const [skipped, setSkipped] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const timers = useRef<number[]>([]);

  // Préchargée dès l'écran d'accroche : au tap, la piste démarre sans attendre le réseau.
  useEffect(() => {
    const a = new Audio(script.audio);
    a.preload = 'auto';
    audio.current = a;
    return () => { a.pause(); a.src = ''; };
  }, [script.audio]);

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => clearTimers, []);

  /** Instant (performance.now) où la séquence a démarré : sert à reprendre le son au bon endroit. */
  const startedAt = useRef(0);

  const begin = useCallback(() => {
    clearTimers();
    setSkipped(false);
    setRun((n) => n + 1);
    setPhase('play');
    startedAt.current = performance.now();
    timers.current.push(window.setTimeout(() => setSkipped(true), END_S * 1000));
  }, []);

  const start = useCallback(() => {
    const a = audio.current;
    if (!a || muted) { a?.pause(); begin(); return; }
    a.currentTime = 0;
    a.volume = 1;
    setPhase('loading');
    // L'image attend que le son parte vraiment, sinon elles se décalent sur un réseau lent.
    let started = false;
    const go = () => { if (started) return; started = true; a.removeEventListener('playing', go); begin(); };
    a.addEventListener('playing', go);
    timers.current.push(window.setTimeout(go, 2500));
    void a.play().catch(go);
  }, [begin, muted]);

  // Rejouer depuis Club › Progression : c'est déjà un tap, pas besoin de l'écran d'accroche.
  const autoplayed = useRef(false);
  useEffect(() => {
    if (!autoplay || autoplayed.current) return;
    autoplayed.current = true;
    start();
  }, [autoplay, start]);

  const skip = () => {
    clearTimers();
    setSkipped(true);
    startedAt.current = performance.now() - PROMUS_S * 1000;
    const a = audio.current;
    if (a && !muted && a.currentTime < PROMUS_S) a.currentTime = PROMUS_S;
  };

  // Le son s'éteint en douceur au lieu d'être coupé net.
  const close = () => {
    clearTimers();
    const a = audio.current;
    if (!a || a.paused) { onClose(); return; }
    const from = a.volume;
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 900);
      a.volume = from * (1 - k);
      if (k < 1) requestAnimationFrame(step); else { a.pause(); onClose(); }
    };
    requestAnimationFrame(step);
  };

  // Couper le son le met en pause ; le remettre reprend la piste là où en est l'image.
  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    if (muted) { a.pause(); return; }
    if (phase !== 'play') return;
    const at = (performance.now() - startedAt.current) / 1000;
    if (Number.isFinite(a.duration) && at >= a.duration) return;
    a.currentTime = at;
    a.volume = 1;
    void a.play().catch(() => {});
  }, [muted]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const from = event.fromDivision === null ? null : divisionLabel(event.fromDivision);
  const to = divisionLabel(event.toDivision);
  const elite = event.toDivision <= 1;
  const season = club?.season ?? null;
  const games = season ? season.wins + season.draws + season.losses : null;
  const ghost = [
    games ? { value: String(games), label: 'matchs cette saison' } : null,
    club ? { value: String(club.promotions), label: 'montées' } : null,
    season ? { value: String(season.wins), label: 'victoires' } : null,
  ].filter((x): x is { value: string; label: string } => x !== null);
  const ghostTiming = [[110, 5.2, 14.4, 88], [240, 4.4, 15.4, 88], [370, 3.6, 16.4, 88]];
  const stats = [
    club ? { value: String(club.promotions), label: 'montées au total' } : null,
    event.match ? { value: `${event.match.goalsFor}–${event.match.goalsAgainst}`, label: `vs ${event.match.opponent}` } : null,
    season ? { value: String(season.wins), label: 'victoires cette saison' } : null,
  ].filter((x): x is { value: string; label: string } => x !== null);

  return createPortal(
    <div className="fcq" role="dialog" aria-modal="true" aria-label={`Montée en ${to}`}>
      <div className="fcq-canvas" style={{ '--fcq-s': scale } as CSSProperties}>
        {phase !== 'play' ? (
          <button type="button" className={`fcq-gate${phase === 'loading' ? ' is-loading' : ''}`} onClick={start} autoFocus>
            <span className="fcq-gate-spot" aria-hidden="true" />
            <span className="fcq-gi fcq-q" aria-hidden="true"><span className="fcq-shield" /><b className="fcq-gold">?</b><Glint /></span>
            <span className="fcq-gi fcq-kick" style={{ animationDelay: '.3s' }}>Une nouvelle t'attend</span>
            <span className="fcq-gi fcq-gbtn" style={{ animationDelay: '.6s' }}>
              <span className="fcq-rip" aria-hidden="true" /><span className="fcq-rip r2" aria-hidden="true" />
              <span className="fcq-t fcq-gold">{phase === 'loading' ? 'Chargement…' : 'Touche pour découvrir'}</span>
            </span>
            {muted ? (
              <span className="fcq-gi fcq-kick" style={{ animationDelay: '.9s' }}>Son coupé · réactive-le en haut à droite</span>
            ) : (
              <span className="fcq-gi fcq-snd" style={{ animationDelay: '.9s' }}>
                <svg className="fcq-spk" viewBox="0 0 32 24" aria-hidden="true">
                  <path d="M2 8h6l8-6v20l-8-6H2z" fill="#F4ECD8" />
                  <path className="w" d="M20 8a5 5 0 0 1 0 8" />
                  <path className="w" style={{ animationDelay: '.15s' }} d="M23.5 4.5a10 10 0 0 1 0 15" />
                  <path className="w" style={{ animationDelay: '.3s' }} d="M27 1a15 15 0 0 1 0 22" />
                </svg>
                <span className="fcq-eq" aria-hidden="true">{[0, 1, 2, 3, 4].map((i) => <i key={i} />)}</span>
                <span className="fcq-snd-t"><b>Avec le son</b><small>Monte le volume</small></span>
              </span>
            )}
          </button>
        ) : (
          <div key={run} className={`fcq-stage fcq-ab${skipped ? ' is-skip' : ''}`}>
            <div className="fcq-mote" aria-hidden="true" />

            <div className="fcq-ab fcq-a1">
              <div className="fcq-ab fcq-bokeh-in" aria-hidden="true">{BOKEH.map((s, i) => <i key={i} className="fcq-bk" style={s} />)}</div>
              <div className="fcq-leak" aria-hidden="true" style={{ left: -260, top: -200, '--lx': '180px', '--ly': '120px', animationDelay: '2.2s' } as CSSProperties} />
              <div className="fcq-leak" aria-hidden="true" style={{ left: 150, top: 420, '--lx': '-140px', '--ly': '-90px', animationDelay: '13.6s' } as CSSProperties} />
              <div className="fcq-diag d1" aria-hidden="true" />
              <div className="fcq-diag d2" aria-hidden="true" />
              {ghost.map((g, i) => (
                <div key={g.label} className="fcq-stat" aria-hidden="true"
                  style={{ top: ghostTiming[i][0], animationDuration: `${ghostTiming[i][1]}s`, animationDelay: `${ghostTiming[i][2]}s` }}>
                  <b className="fcq-gold" style={i > 0 ? { fontSize: 72 } : undefined}>{g.value}</b><small>{g.label}</small>
                </div>
              ))}
              <div className="fcq-subs">
                {script.lines.map((l) => {
                  const words = l.text.split(' ');
                  const step = 2.2 / words.length;
                  return (
                    <p key={l.text} className={`fcq-line${l.big ? ' big' : ''}`} style={{ margin: 0, animationDelay: `${l.start}s`, animationDuration: `${l.end - l.start}s` }}>
                      {words.map((w, i) => <span key={i} style={{ animationDelay: `${(l.start + i * step).toFixed(2)}s` }}>{w}</span>)}
                    </p>
                  );
                })}
              </div>
            </div>

            <div className="fcq-preglint" aria-hidden="true"><Glint /></div>

            <div className="fcq-ab fcq-scene">
              <div className="fcq-ab fcq-cam">
                <div className="fcq-spot" aria-hidden="true" />
                <div className="fcq-src" aria-hidden="true" />
                <div className="fcq-puddle" aria-hidden="true" />
                <div className="fcq-ab fcq-glits" aria-hidden="true">{GLITS.map((s, i) => <i key={i} className="fcq-glit" style={s} />)}</div>
                <div className="fcq-ab fcq-dust-in" aria-hidden="true">{DUST.map((s, i) => <i key={i} className="fcq-dust" style={s} />)}</div>
                <div className="fcq-ped" aria-hidden="true">
                  <div className="fcq-slab" style={{ width: 150, height: 12 }} />
                  <div className="fcq-slab" style={{ width: 112, height: 58, boxShadow: 'none', background: 'linear-gradient(to right, #070605, #1f180d 50%, #070605)' }} />
                  <div className="fcq-slab" style={{ width: 186, height: 14 }} />
                  <div className="fcq-slab" style={{ width: 220, height: 8, opacity: 0.7 }} />
                </div>
                <div className="fcq-cmove">
                  <div className="fcq-cfloat">
                    <div className="fcq-ab fcq-csil" aria-hidden="true"><span className="fcq-shield" /></div>
                    <div className="fcq-cgold" role="img" aria-label={`Blason ${to}`}>
                      <span className="fcq-shield" /><span className="fcq-ring" />
                      <span className="fcq-cin">
                        {elite ? <b className="is-elite">ÉLITE</b> : <><small>DIVISION</small><b>{event.toDivision - 1}</b></>}
                      </span>
                      <span className="fcq-sheen" />
                    </div>
                    <div className="fcq-edge" aria-hidden="true" />
                    <div className="fcq-cglint" aria-hidden="true"><Glint /></div>
                  </div>
                </div>
                <div className="fcq-gout">
                  <div className="fcq-gkick"><i /><span>Le Saint Graal</span><i /></div>
                  <div className="fcq-gtitle fcq-gold">{to}</div>
                </div>
              </div>
            </div>

            <div className="fcq-bloom" aria-hidden="true" />
            <div className="fcq-streak" aria-hidden="true" />
            <div className="fcq-burst" aria-hidden="true">{SPARKS.map((s, i) => <i key={i} style={s} />)}</div>
            <div className="fcq-ab fcq-bk2-in" aria-hidden="true">{BOKEH2.map((s, i) => <i key={i} className="fcq-bk" style={s} />)}</div>

            <h2 className="fcq-ptitle" aria-label="Promus">
              {'PROMUS'.split('').map((c, i) => <span key={i} className="fcq-gold" aria-hidden="true" style={{ animationDelay: `${(42.2 + i * 0.14).toFixed(2)}s` }}>{c}</span>)}
            </h2>
            <div className="fcq-pclub"><i /><span>{club?.name ?? 'FoodBall Club'}</span><i /></div>
            <div className="fcq-lower"><small>Montée</small>{from && <s>{from}</s>}<b className="fcq-gold">→ {to}</b></div>
            {stats.length > 0 && (
              <div className="fcq-pstats">
                {stats.map((s, i) => (
                  <div key={s.label} style={{ animationDelay: `${45.3 + i * 0.3}s` }}><b className="fcq-gold">{s.value}</b><small>{s.label}</small></div>
                ))}
              </div>
            )}
            <div className="fcq-pact">
              <button type="button" className="fcq-cta" onClick={onShare}>{shareLabel ?? (script.video ? 'Partager la vidéo' : 'Partager la montée')}</button>
              <div>
                <button type="button" className="fcq-ghost" onClick={start}>Rejouer</button>
                <button type="button" className="fcq-ghost" onClick={close}>Continuer</button>
              </div>
            </div>

            <svg className="fcq-grain" width="450" height="904" aria-hidden="true">
              <filter id="fcq-gr"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves={2} stitchTiles="stitch" /></filter>
              <rect width="450" height="904" filter="url(#fcq-gr)" />
            </svg>
            <div className="fcq-vign" aria-hidden="true" />
          </div>
        )}
        <div className="fcq-tools">
          <button type="button" onClick={onToggleMute} aria-pressed={!muted}>{muted ? 'Son coupé' : 'Son'}</button>
          {phase === 'play' && !skipped
            ? <button type="button" onClick={skip}>Passer</button>
            : <button type="button" onClick={close}>Fermer</button>}
        </div>
      </div>
    </div>,
    document.body,
  );
}
