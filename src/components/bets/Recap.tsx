import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { MARKET_COPY, type BetPick, type BetSession, type BetsState, type Market, type MarketId } from '../../../shared/bets';
import { byOrder, fmt, isPlayerMarket, plural, record, sessionLead, titleOf, topPlayers } from '../../lib/foodbet';
import { colorOf, initials, photoOf } from '../../lib/player-photos';
import '../../styles/recap.css';

// Le récap de fin de soirée FoodBet, en stories plein écran : la soirée en chiffres, un pari par
// story (les pronos d'abord, le roulement, puis la réponse), le coup et la boulette, le podium, ton
// bilan et le classement. Tap à droite ou à gauche, appui long pour pause, glisser vers le bas pour fermer.

type Item = BetsState['history'][number];
type Tone = 'blue' | 'night' | 'ice' | 'amber' | 'red';
interface Story { key: string; tone: Tone; ms: number; face?: string; body: (active: boolean) => ReactNode }

const reduce = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const sign = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(Math.round(n)));
const odds = (o: number) => '×' + o.toFixed(2).replace('.', ',');
const buzz = (pattern: number | number[]) => { try { navigator.vibrate?.(pattern); } catch { /* pas de vibreur */ } };
/** Ce qu'affiche un prono une fois réglé : le gain encaissé, la mise perdue, ou « rendu ». */
const shown = (p: BetPick) => (p.status === 'won' ? p.payout ?? 0 : p.status === 'lost' ? -p.stake : 0);
const net = (p: BetPick) => (p.payout ?? 0) - p.stake;
const delay = (s: number): CSSProperties => ({ ['--d' as string]: `${s.toFixed(2)}s` });

/** Le titre choc de chaque pari. */
const HEADS: Partial<Record<MarketId, ReactNode>> = {
  bilan: <>La nuit<br />des <em>V</em> ?</>, attack: <>Ça plante<br /><em>combien</em> ?</>, scorer: <>Le roi<br />du <em>but</em></>,
  clumsy: <>Le pied<br /><em>carré</em></>, crack: <>Le crack<br />du <em>soir</em> ?</>, sr: <>Le SR<br /><em>décolle</em> ?</>,
  cleansheet: <>Le mur<br /><em>tient</em> ?</>, red: <>Carton<br /><em>rouge</em> ?</>, ragequit: <>Ils<br /><em>lâchent</em> ?</>,
  streak: <>La<br /><em>série</em> ?</>,
};
const TONES: Tone[] = ['blue', 'night', 'ice', 'amber'];

/** La ligne de résultat sous les réponses. */
function verdict(id: MarketId, s: BetSession, crack: string[] | null): string {
  switch (id) {
    case 'bilan': return `${s.wins} V · ${s.draws} N · ${s.losses} D`;
    case 'attack': return `${plural(s.goalsFor, 'but')} · ${(s.goalsFor / Math.max(1, s.matches)).toFixed(1).replace('.', ',')} / match`;
    case 'scorer': { const t = topPlayers(s, 'goals'); return t.best ? `${plural(t.best, 'but')} pour ${t.names.join(' & ')}` : 'Personne n’a marqué'; }
    case 'clumsy': { const t = topPlayers(s, 'missed'); return t.best ? `${t.best} tirs ratés pour ${t.names.join(' & ')}` : 'Aucun tir raté'; }
    case 'sr': return s.srStart !== null && s.srNow !== null ? `${fmt(s.srStart)} → ${fmt(s.srNow)}` : 'Skill rating inconnu';
    case 'cleansheet': return plural(s.cleanSheets, 'clean sheet');
    case 'red': return s.reds ? plural(s.reds, 'match') + ' avec un rouge' : 'Aucun rouge';
    case 'ragequit': return s.ragequits ? plural(s.ragequits, 'abandon') : 'Aucun abandon';
    case 'streak': return `Meilleure série : ${s.bestStreak} V`;
    case 'crack': return crack?.length ? `Élu par le club : ${crack.join(' & ')}` : 'Pas de Crack élu';
    default: return '';
  }
}

/** Les bonnes réponses d'un pari : celles des gagnants, sinon celles de la soirée. */
function rightOptions(m: Market, item: Item): string[] {
  if (m.id === 'crack') return m.options.filter((o) => item.crack?.includes(o.label)).map((o) => o.id);
  const won = item.results.filter((p) => p.market === m.id && p.status === 'won').map((p) => p.option);
  if (won.length) return [...new Set(won)];
  return item.session ? sessionLead(m.id, item.session) ?? [] : [];
}

function Face({ name, size = 34 }: { name: string; size?: number }) {
  const photo = photoOf(name);
  return <span className={`rc-av${photo ? ' has' : ''}`} style={{ width: size, height: size, fontSize: size * 0.4, backgroundColor: colorOf(name),
    ...(photo ? { backgroundImage: `url(${photo})` } : {}) }} aria-hidden="true">{photo ? '' : initials(name)}</span>;
}

function Portrait({ name }: { name: string }) {
  const photo = photoOf(name);
  return <div className={`rc-portrait${photo ? ' has' : ''}`} style={{ ['--c' as string]: colorOf(name), ...(photo ? { backgroundImage: `url(${photo})` } : {}) }}
    aria-hidden="true">{!photo && <span>{name}</span>}</div>;
}

function CountUp({ value, active, wait = 0, signed = true }: { value: number; active: boolean; wait?: number; signed?: boolean }) {
  const [shownValue, setShown] = useState(value);
  useEffect(() => {
    if (!active || reduce() || value === 0) { setShown(value); return; }
    let raf = 0;
    const t0 = performance.now() + wait;
    const tick = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - t0) / 900));
      setShown(Math.round(value * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    setShown(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, value, wait]);
  return <>{signed ? sign(shownValue) : fmt(shownValue)}</>;
}

function Row({ p, markets, revealed, d }: { p: BetPick; markets: Market[]; revealed: boolean; d: number }) {
  const label = markets.find((m) => m.id === p.market)?.options.find((o) => o.id === p.option)?.label ?? p.option;
  const kind = p.status === 'won' ? 'win' : p.status === 'lost' ? 'lose' : 'back';
  return <div className={`rc-row ${kind}${p.me ? ' me' : ''} in`} style={delay(d)}>
    <Face name={p.name} /><strong>{p.name}</strong><span>{label} · {fmt(p.stake)} à {odds(p.odds)}</span>
    <b>{p.status === 'refunded' ? 'rendu' : <CountUp value={shown(p)} active={revealed} />}</b>
  </div>;
}

/** Un pari : les pronos d'abord, la lumière passe d'une réponse à l'autre, puis se fige sur la bonne. */
function BetStory({ m, item, index, total, active }: { m: Market; item: Item; index: number; total: number; active: boolean }) {
  const picks = item.results.filter((p) => p.market === m.id);
  const right = rightOptions(m, item);
  const options = isPlayerMarket(m.id) ? m.options.filter((o) => right.includes(o.id) || picks.some((p) => p.option === o.id)) : m.options;
  const [lit, setLit] = useState(-1);
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    setLit(-1); setRevealed(false);
    if (!active) return;
    const target = Math.max(0, options.findIndex((o) => right.includes(o.id)));
    if (reduce()) { setRevealed(true); return; }
    const timers: number[] = [];
    let at = 1300;
    for (let k = 0; k <= options.length * 3 + target; k++) {
      at += 70 + k * 9;
      timers.push(window.setTimeout(() => setLit(k % options.length), at));
    }
    timers.push(window.setTimeout(() => { setLit(-1); setRevealed(true); buzz(40); }, at + 250));
    return () => timers.forEach(clearTimeout);
    // `options` et `right` découlent de `m` et `item`, stables pendant la story.
  }, [active, m.id, item.id]);
  const count = (id: string) => picks.filter((p) => p.option === id).length;
  return <>
    <p className="rc-kick in">Pari {index} sur {total} · {titleOf(m.id)}</p>
    <h2 className="rc-big rc-big--bet in" style={delay(0.05)}>{HEADS[m.id] ?? MARKET_COPY[m.id].title}</h2>
    <p className="rc-q in" style={delay(0.1)}>{MARKET_COPY[m.id].question}</p>
    <div className={`rc-opts in${revealed ? ' revealed' : ''}`} style={delay(0.25)}>
      {options.map((o, i) => <span key={o.id} className={`rc-opt${lit === i ? ' lit' : ''}${revealed ? (right.includes(o.id) ? ' right' : ' wrong') : ''}`}>
        {o.label}{count(o.id) > 0 && <small>{count(o.id)}</small>}</span>)}
    </div>
    <p className={`rc-verdict${revealed ? ' on' : ''}`}>{item.session ? verdict(m.id, item.session, item.crack) : ''}</p>
    <div className={`rc-rows${revealed ? ' revealed' : ''}`}>
      {picks.map((p, k) => <Row key={`${p.name}${p.option}`} p={p} markets={item.markets} revealed={revealed} d={0.45 + k * 0.15} />)}
    </div>
  </>;
}

function CrackVotes({ item, active }: { item: Item; active: boolean }) {
  const groups = [...new Set(item.ballots.map((b) => b.gamertag))]
    .map((gamertag) => ({ gamertag, voters: item.ballots.filter((b) => b.gamertag === gamertag).map((b) => (b.me ? 'toi' : b.voter)) }))
    .sort((a, b) => b.voters.length - a.voters.length);
  const total = Math.max(1, item.ballots.length);
  const [grow, setGrow] = useState(false);
  useEffect(() => { setGrow(false); if (!active) return; const t = window.setTimeout(() => setGrow(true), reduce() ? 0 : 900); return () => clearTimeout(t); }, [active]);
  if (groups.length === 0) return null;
  return <div className="rc-votes">
    {groups.map((g, i) => <div key={g.gamertag} className={`rc-vote${i === 0 ? ' lead' : ''} in`} style={delay(0.5 + i * 0.15)}>
      <header><Face name={g.gamertag} size={26} /><span>{g.gamertag}</span><em>{g.voters.length} voix</em></header>
      <div className="rc-bar"><i style={{ width: grow ? `${(g.voters.length / total) * 100}%` : 0 }} /></div>
      <small>Voté par {g.voters.join(', ')}</small>
    </div>)}
  </div>;
}

function Confetti({ active }: { active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!active || !c || reduce()) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const r = c.getBoundingClientRect();
    c.width = r.width * devicePixelRatio; c.height = r.height * devicePixelRatio;
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    const colors = ['#FFB547', '#6FC8FF', '#F2F4F8', '#3DDC97', '#1846F5'];
    const parts = Array.from({ length: 150 }, () => ({ x: r.width / 2 + (Math.random() - 0.5) * 90, y: r.height * 0.64, vx: (Math.random() - 0.5) * 9,
      vy: -6 - Math.random() * 9, s: 5 + Math.random() * 6, a: Math.random() * 6, va: (Math.random() - 0.5) * 0.4, c: colors[Math.floor(Math.random() * 5)] }));
    let raf = 0;
    const t0 = performance.now() + 900;
    const step = (now: number) => {
      ctx.clearRect(0, 0, r.width, r.height);
      if (now >= t0) for (const p of parts) {
        p.x += p.vx; p.y += p.vy; p.vy += 0.28; p.vx *= 0.99; p.a += p.va;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore();
      }
      if (now - t0 < 2800) raf = requestAnimationFrame(step); else ctx.clearRect(0, 0, r.width, r.height);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  return <canvas ref={ref} className="rc-confetti" aria-hidden="true" />;
}

/** L'image à partager (1080 × 1920) : le podium ou ton bilan. */
async function shareImage(kind: 'podium' | 'bilan', item: Item, podium: [string, number][], mine: BetPick[], myNet: number) {
  const c = document.createElement('canvas'); c.width = 1080; c.height = 1920;
  const x = c.getContext('2d');
  if (!x) return;
  const g = x.createLinearGradient(0, 0, 0, 1920); g.addColorStop(0, '#142454'); g.addColorStop(0.6, '#060C1F');
  x.fillStyle = g; x.fillRect(0, 0, 1080, 1920);
  const font = (w: number, s: number, it = '') => `${it} ${w} ${s}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  x.fillStyle = '#F2F4F8'; x.font = font(800, 72, 'italic'); x.fillText('FOOD', 90, 160);
  x.fillStyle = '#FFB547'; x.fillText('BET', 90 + x.measureText('FOOD').width, 160);
  x.fillStyle = 'rgba(242,244,248,.7)'; x.font = font(700, 40);
  if (item.session) x.fillText(record(item.session).toUpperCase(), 90, 230);
  const load = (src: string) => new Promise<HTMLImageElement | null>((done) => { const img = new Image(); img.onload = () => done(img); img.onerror = () => done(null); img.src = src; });
  x.fillStyle = '#F2F4F8'; x.font = font(800, 170, 'italic');
  if (kind === 'podium') {
    x.fillText('LE PODIUM', 90, 470); x.fillStyle = '#FFB547'; x.fillText('DU SOIR', 90, 630);
    const cols: [number, number, number][] = [[1, 240, 330], [0, 540, 470], [2, 840, 250]];
    for (const [k, cx, h] of cols) {
      const entry = podium[k];
      if (!entry) continue;
      const [who, gain] = entry;
      x.fillStyle = k === 0 ? '#FFB547' : k === 1 ? '#F2F4F8' : '#C9D3E8'; x.fillRect(cx - 140, 1700 - h, 280, h);
      x.fillStyle = '#060C1F'; x.font = font(800, 110, 'italic'); x.textAlign = 'center'; x.fillText(String(k + 1), cx, 1700 - h + 110);
      const photo = photoOf(who);
      const img = photo ? await load(photo) : null;
      if (img) x.drawImage(img, cx - 120, 1700 - h - 420, 240, 240);
      else { x.fillStyle = colorOf(who); x.fillRect(cx - 60, 1700 - h - 330, 120, 120); x.fillStyle = '#060C1F'; x.font = font(800, 56); x.fillText(initials(who), cx, 1700 - h - 250); }
      x.fillStyle = '#F2F4F8'; x.font = font(800, 50); x.fillText(who.toUpperCase().slice(0, 12), cx, 1700 - h - 160);
      x.fillStyle = '#3DDC97'; x.font = font(800, 64); x.fillText(sign(gain), cx, 1700 - h - 80);
      x.textAlign = 'left';
    }
  } else {
    x.fillText('MON BILAN', 90, 470); x.fillStyle = '#FFB547'; x.font = font(800, 300); x.fillText(sign(myNet), 90, 800);
    x.font = font(700, 54);
    let y = 960;
    for (const p of mine) {
      x.fillStyle = p.status === 'won' ? '#3DDC97' : p.status === 'lost' ? '#FF6B7A' : '#6FC8FF';
      x.fillText(`${p.status === 'won' ? '✓' : p.status === 'lost' ? '✗' : '↺'}  ${MARKET_COPY[p.market].title.toUpperCase()}`, 90, y);
      x.textAlign = 'right'; x.fillText(p.status === 'refunded' ? 'RENDU' : sign(shown(p)), 990, y); x.textAlign = 'left';
      y += 100;
    }
  }
  x.fillStyle = 'rgba(242,244,248,.55)'; x.font = font(700, 38); x.fillText('CLUBS-COMPAGNON.VERCEL.APP', 90, 1850);
  const blob = await new Promise<Blob | null>((done) => c.toBlob(done, 'image/png'));
  if (!blob) return;
  const file = new File([blob], `foodbet-${kind}.png`, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: 'FoodBet' }).catch(() => { /* partage annulé */ });
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/** Récap déjà vu (même clé que l'écran FoodBet) : son rond passe en gris. */
const recapSeen = (id: number) => { try { return localStorage.getItem(`bets.seen.${id}`) === '1'; } catch { return true; } };

/** Les soirées passées en ronds de stories : la tête du Crack, la date, le bilan. Touche pour revoir le récap. */
export function RecapRings({ history, onOpen, title }: { history: BetsState['history']; onOpen: (fixtureId: number) => void; title?: string }) {
  const nights = history.filter((h) => h.status === 'settled' && h.session);
  if (nights.length === 0) return null;
  return <section className="rc-rings" aria-label={title ?? 'Les soirées FoodBet'}>
    {title && <p className="rc-rings-title">{title}</p>}
    <div className="rc-rings-list">{nights.map((h) => {
      const s = h.session!;
      const star = h.crack?.[0] ?? [...h.results].sort((a, b) => net(b) - net(a))[0]?.name ?? 'FoodBet';
      const day = new Date(s.startedAt ?? h.settledAt).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
      return <button key={h.id} type="button" className={`rc-ring${recapSeen(h.id) ? ' seen' : ''}`} onClick={() => onOpen(h.id)}
        aria-label={`Récap du ${day} : ${s.wins} victoires, ${s.draws} nuls, ${s.losses} défaites`}>
        <span className="rc-ring-pic"><Face name={star} size={56} /></span>
        <b>{day}</b><small>{s.wins}V {s.draws}N {s.losses}D</small>
      </button>;
    })}</div>
  </section>;
}

export function Recap({ item, state, onClose, onBoard }: { item: Item; state: BetsState; onClose: () => void; onBoard: () => void }) {
  const session = item.session!;
  // Les rappels changent à chaque rendu du parent : les stories passent par ces références.
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const boardRef = useRef(onBoard); boardRef.current = onBoard;
  const stories = useMemo<Story[]>(() => {
    const onClose = () => closeRef.current();
    const onBoard = () => boardRef.current();
    const list: Story[] = [];
    const markets = [...item.markets].sort(byOrder).filter((m) => m.id !== 'crack' && item.results.some((p) => p.market === m.id));
    const crackMarket = item.markets.find((m) => m.id === 'crack');
    const played = [...markets, ...(crackMarket ? [crackMarket] : [])];
    const bettors = new Set(item.results.map((p) => p.name)).size;
    list.push({ key: 'intro', tone: 'night', ms: 5500, body: (active) => <>
      <p className="rc-kick in">Fin de soirée · {plural(session.matches, 'match')}</p>
      <h2 className="rc-big in" style={delay(0.1)}>La nuit<br /><em>en story</em></h2>
      <div className="rc-score in" style={delay(0.35)}>
        <div className="w"><b><CountUp value={session.wins} active={active} signed={false} /></b><span>Victoires</span></div>
        <div><b><CountUp value={session.draws} active={active} signed={false} /></b><span>Nuls</span></div>
        <div className="l"><b><CountUp value={session.losses} active={active} signed={false} /></b><span>Défaites</span></div>
      </div>
      <div className="rc-score in" style={delay(0.55)}>
        <div><b><CountUp value={session.goalsFor} active={active} signed={false} /></b><span>Buts marqués</span></div>
        {session.srStart !== null && session.srNow !== null && <div><b>{session.srStart}→{session.srNow}</b><span>Skill rating</span></div>}
      </div>
      <p className="rc-q in" style={{ ...delay(0.8), marginTop: 'auto' }}>{plural(bettors, 'parieur')}, {plural(played.length, 'pari')} joués. Voyons qui a vu juste.</p>
      <p className="rc-hint in" style={delay(1)}>Touche pour avancer · appui long pour pause</p>
    </> });
    markets.forEach((m, i) => {
      const right = rightOptions(m, item);
      const best = item.results.filter((p) => p.market === m.id && p.status === 'won').sort((a, b) => shown(b) - shown(a))[0];
      const face = isPlayerMarket(m.id) ? m.options.find((o) => right.includes(o.id))?.label ?? best?.name : best?.name;
      list.push({ key: m.id, tone: TONES[i % TONES.length], ms: 6000 + item.results.filter((p) => p.market === m.id).length * 500, face,
        body: (active) => <BetStory m={m} item={item} index={i + 1} total={played.length} active={active} /> });
    });
    if (crackMarket) {
      list.push({ key: 'crack', tone: 'ice', ms: 8000, face: item.crack?.[0], body: (active) => <>
        <BetStory m={crackMarket} item={item} index={played.length} total={played.length} active={active} />
        <CrackVotes item={item} active={active} />
      </> });
    }
    const won = item.results.filter((p) => p.status === 'won').sort((a, b) => b.odds - a.odds || shown(b) - shown(a));
    const coup = won[0];
    if (coup) list.push({ key: 'coup', tone: 'night', ms: 6000, face: coup.name, body: (active) => <>
      <p className="rc-kick in">Le coup de la soirée</p>
      <p className="rc-mega in" style={delay(0.15)}>{odds(coup.odds)}</p>
      <p className="rc-q in" style={delay(0.35)}>La plus grosse cote qui est tombée.</p>
      <div className="rc-hero in" style={delay(0.6)}><Face name={coup.name} size={64} /><div><strong>{coup.me ? 'Toi' : coup.name}</strong>
        <span>{MARKET_COPY[coup.market].title} · {fmt(coup.stake)} misés → <b className="rc-win"><CountUp value={shown(coup)} active={active} wait={600} /></b></span></div></div>
    </> });
    const lost = item.results.filter((p) => p.status === 'lost').sort((a, b) => b.stake - a.stake);
    const boulette = lost[0];
    if (boulette) list.push({ key: 'boulette', tone: 'red', ms: 6000, face: boulette.name, body: (active) => <>
      <p className="rc-kick in">La boulette</p>
      <p className="rc-mega in" style={delay(0.15)}><CountUp value={-boulette.stake} active={active} wait={150} /></p>
      <p className="rc-q in" style={delay(0.35)}>La plus grosse mise envolée ce soir.</p>
      <div className="rc-hero in" style={delay(0.6)}><Face name={boulette.name} size={64} /><div><strong>{boulette.me ? 'Toi' : boulette.name}</strong>
        <span>{MARKET_COPY[boulette.market].title}, à {fmt(boulette.stake)} crédits.</span></div></div>
    </> });
    const totals = new Map<string, number>();
    for (const p of item.results) totals.set(p.name, (totals.get(p.name) ?? 0) + net(p));
    const podium = [...totals].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const mine = item.results.filter((p) => p.me);
    const myNet = mine.reduce((sum, p) => sum + net(p), 0);
    if (podium.length > 0) list.push({ key: 'podium', tone: 'night', ms: 7000, body: (active) => <>
      <p className="rc-kick in">Le podium de la soirée</p>
      <h2 className="rc-big in" style={delay(0.1)}>Ils ont<br /><em>tout raflé</em></h2>
      <p className="rc-q in" style={delay(0.3)}>Gains nets de la soirée, tous paris confondus.</p>
      <div className={`rc-podium${active ? ' up' : ''}`}>{[1, 0, 2].map((k) => {
        const entry = podium[k];
        if (!entry) return <div key={k} />;
        const [who, gain] = entry;
        return <div key={k} className={`rc-step p${k + 1}`}>
          <span className="in" style={delay(1.1 - k * 0.25)}><Face name={who} size={52} /></span>
          <strong className="in" style={delay(1.1 - k * 0.25)}>{who}</strong>
          <b className="in" style={delay(1.1 - k * 0.25)}><CountUp value={gain} active={active} wait={1100 - k * 250} /></b>
          <div className="rc-block" style={{ transitionDelay: `${0.5 - k * 0.15}s` }}>{k + 1}</div>
        </div>;
      })}</div>
      <button type="button" className="rc-btn in" style={delay(1.6)} data-action
        onClick={() => void shareImage('podium', item, podium, mine, myNet)}>Partager le podium</button>
      <Confetti active={active} />
    </> });
    if (mine.length > 0) {
      const myName = mine[0].name;
      list.push({ key: 'mine', tone: 'blue', ms: 7000, face: myName, body: (active) => <>
        <p className="rc-kick in">Ton bilan</p>
        <p className="rc-huge in" style={delay(0.15)}><CountUp value={myNet} active={active} wait={150} /></p>
        <p className="rc-q in" style={delay(0.35)}>crédits sur la soirée · {mine.filter((p) => p.status === 'won').length} paris gagnés sur {mine.length}.</p>
        <div className="rc-checks">{mine.map((p, i) => <div key={p.market} className={`rc-check ${p.status} in`} style={delay(0.6 + i * 0.1)}>
          <i>{p.status === 'won' ? '✓' : p.status === 'lost' ? '✗' : '↺'}</i><span>{titleOf(p.market)}</span>
          <b>{p.status === 'refunded' ? 'rendu' : sign(shown(p))}</b></div>)}</div>
        <button type="button" className="rc-btn in" style={{ ...delay(1.4), marginTop: 'auto' }} data-action
          onClick={() => void shareImage('bilan', item, podium, mine, myNet)}>Partager mon bilan</button>
      </> });
    }
    list.push({ key: 'board', tone: 'night', ms: 9000, face: state.leaderboard[0]?.name, body: () => <>
      <p className="rc-kick in">Le classement général</p>
      <h2 className="rc-big in" style={delay(0.1)}>Après<br />ce soir</h2>
      <div className="rc-ranks">{state.leaderboard.slice(0, 8).map((r, i) => <div key={r.accountId} className={`rc-rank${r.me ? ' me' : ''} in`} style={delay(0.4 + i * 0.12)}>
        <i>{i + 1}</i><Face name={r.name} size={30} /><strong>{r.me ? 'Toi' : r.name}</strong><b>{fmt(r.balance)}</b></div>)}</div>
      <div className="rc-actions in" style={delay(1.4)}>
        <button type="button" className="rc-btn" data-action onClick={() => { onClose(); onBoard(); }}>Voir le classement</button>
        <button type="button" className="rc-btn ghost" data-action onClick={onClose}>Fermer</button>
      </div>
    </> });
    const me = state.leaderboard.find((r) => r.me)?.name ?? mine[0]?.name;
    if (me && !photoOf(me)) list.push({ key: 'photo', tone: 'amber', ms: 12000, body: () => <>
      <p className="rc-kick in">Dernière chose</p>
      <h2 className="rc-big in" style={delay(0.1)}>Mets<br /><em>ta tête</em></h2>
      <p className="rc-q in" style={delay(0.25)}>Ta photo remplace tes initiales partout : stories, podium, classement. Meilleur buteur ou Crack de la
        soirée ? C’est ta tête en grand.</p>
      <p className="rc-q in" style={delay(0.4)}>Envoie une photo de toi, face caméra, à l’admin du club : il l’ajoute pour la prochaine soirée.</p>
      <div className="rc-actions in" style={{ ...delay(0.6), marginTop: 'auto' }}>
        <button type="button" className="rc-btn" data-action onClick={onClose}>C’est noté</button>
      </div>
    </> });
    return list;
  }, [item, state.leaderboard, session]);

  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const clock = useRef({ start: performance.now(), elapsed: 0 });
  const go = (next: number) => {
    if (next >= stories.length) { onClose(); return; }
    setDir(next >= index ? 1 : -1);
    setIndex(Math.max(0, next));
    clock.current = { start: performance.now(), elapsed: 0 };
    setProgress(0);
  };
  useEffect(() => {
    let raf = 0;
    const tick = (now: number) => {
      if (!paused) {
        const k = (clock.current.elapsed + now - clock.current.start) / stories[index].ms;
        setProgress(Math.min(1, k));
        if (k >= 1 && index < stories.length - 1) { go(index + 1); return; }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });
  const pause = (p: boolean) => {
    if (p === paused) return;
    if (p) clock.current.elapsed += performance.now() - clock.current.start; else clock.current.start = performance.now();
    setPaused(p);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(index + 1);
      if (e.key === 'ArrowLeft') go(index - 1);
      // Échap ferme le récap seulement, pas tout FoodBet : écouté en premier (capture), puis arrêté.
      if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  // Gestes : tap gauche/droite, appui long = pause, glisser vers le bas = fermer.
  const down = useRef<{ x: number; y: number; held: boolean; timer: number } | null>(null);
  const [drag, setDrag] = useState(0);
  const story = stories[index];
  return <section className={`rc t-${story.tone}${paused ? ' paused' : ''}`} aria-roledescription="stories" aria-label="Récap de la soirée"
    style={{ transform: drag ? `translateY(${drag * 0.6}px) scale(${1 - Math.min(drag, 300) / 3000})` : undefined }}
    onPointerDown={(e) => {
      if ((e.target as HTMLElement).closest('[data-action], button')) return;
      const timer = window.setTimeout(() => { if (down.current) down.current.held = true; pause(true); }, 260);
      down.current = { x: e.clientX, y: e.clientY, held: false, timer };
    }}
    onPointerMove={(e) => { if (down.current) setDrag(Math.max(0, e.clientY - down.current.y)); }}
    onPointerUp={(e) => {
      const d = down.current;
      if (!d) return;
      clearTimeout(d.timer);
      down.current = null; setDrag(0);
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (dy > 90) { onClose(); return; }
      if (d.held) { pause(false); return; }
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
        const r = e.currentTarget.getBoundingClientRect();
        go(e.clientX - r.left < r.width * 0.33 ? index - 1 : index + 1);
      }
    }}
    onPointerCancel={() => { if (down.current) clearTimeout(down.current.timer); if (down.current?.held) pause(false); down.current = null; setDrag(0); }}>
    <div className="rc-bars">{stories.map((s, i) => <i key={s.key}><b style={{ width: `${i < index ? 100 : i === index ? progress * 100 : 0}%` }} /></i>)}</div>
    <div className="rc-top"><span className="rc-mark">Food<span>Bet</span></span><small>Récap de la soirée</small>{paused && <em>En pause</em>}</div>
    <button type="button" className="rc-close" data-action onClick={onClose} aria-label="Fermer le récap">✕</button>
    <div key={story.key} className={`rc-story play ${dir > 0 ? 'from-right' : 'from-left'}`}>
      {story.face && <Portrait name={story.face} />}
      {story.body(true)}
    </div>
  </section>;
}
