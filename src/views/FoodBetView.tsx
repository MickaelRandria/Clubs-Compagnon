import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import {
  BONUS_MARKETS, CURRENCY, DEFAULT_STAKE, MARKET_COPY, MARKET_ORDER, STAKES, optionLabel, payout,
  type BetMatch, type BetSession, type BetsAdminAction, type BetsState, type BetPick, type Market, type MarketId, type Slip,
} from '../../shared/bets';
import { sessionAnswer } from '../../shared/bets-odds';
import { useMe } from '../api/auth';
import { useBetsAdmin, useBetsPlay, useBetsState, useBetsStatus } from '../api/bets';
import { SignInButton } from '../components/fc27/SignIn';
import { frNum } from '../lib/format';
import { usePageTitle } from '../lib/hooks';
import '../styles/foodbet.css';

// FoodBet : le pari du club, en plein écran. On parie sur toute la session de la soirée, quel que
// soit le nombre de matchs. Quatre phases, toujours visibles en haut : 1 Paris (le ticket),
// 2 Session (suivi en direct), 3 Vote (le Crack de la soirée), 4 Résultats. L'admin fait avancer
// les phases depuis un panneau en bas de l'écran. Règles : drizzle/0017 à 0025.

const CR = CURRENCY.short;
const STARTING_TEXT = `500 ${CURRENCY.name} offerts. Avant chaque session tu remplis ton ticket, à la fin tu votes pour le joueur de la soirée. Aucun argent réel.`;
const fmt = (n: number) => n.toLocaleString('fr-FR');

/** La question en gros, une par pari. */
const ASK: Record<MarketId, string> = {
  bilan: 'Le bilan ?', attack: 'Combien par match ?', scorer: 'Qui plante le plus ?', clumsy: 'Qui rate le plus ?',
  crack: 'Le crack du soir ?', sr: 'Le SR monte ?', cleansheet: 'Un clean sheet ?', red: 'Un rouge ?', ragequit: 'Ils lâchent ?',
  streak: '3 V d’affilée ?', verdict: 'Qui gagne ?', goals: 'Combien de buts ?', against: 'Combien encaissés ?', flop: 'La casserole ?',
};
/** Ce qu'on parie, en clair, sous la question. */
const EXPLAIN: Record<MarketId, ReactNode> = {
  bilan: <>Sur toute la soirée, <b>FoodBall</b> finit avec plus de victoires que de défaites, autant, ou plus de défaites ?</>,
  attack: <>Les buts marqués par <b>FoodBall</b> divisés par le nombre de matchs de la soirée.</>,
  clumsy: <>Le joueur qui aura <b>le plus de tirs ratés</b> sur la soirée (tirs moins buts, d’après EA). Ex æquo : tous gagnent.
    Pas sur toi-même ; s’il ne joue aucun match, ta mise t’est rendue.</>,
  sr: <>Le skill rating du club à la fin de la session, comparé à celui du coup d’envoi. Inchangé : remboursé.</>,
  streak: <>Au moins <b>3 victoires d’affilée</b> pendant la soirée ?</>,
  verdict: <>Devine le résultat de <b>FoodBall</b> ce soir : victoire, nul ou défaite.</>,
  goals: <>Devine combien de buts <b>FoodBall</b> va marquer ce soir.</>,
  against: <>Devine combien de buts <b>FoodBall</b> va encaisser ce soir.</>,
  scorer: <>Le joueur qui marquera <b>le plus de buts</b> sur la soirée. Ex æquo : tous gagnent. Pas sur toi-même ; s’il ne joue
    aucun match, ta mise t’est rendue.</>,
  cleansheet: <>Au moins un match de la soirée <b>sans encaisser de but</b> ?</>,
  red: <>Un joueur de <b>FoodBall</b> prend-il au moins un carton rouge dans la soirée ?</>,
  ragequit: <>Au moins un adversaire quitte-t-il le match avant la fin dans la soirée ?</>,
  flop: <>Devine le joueur que le club désignera comme le moins bon du match.</>,
  crack: <>Parie sur le joueur qui sera élu <b>Crack de la soirée</b>. C’est le club qui l’élit par un vote, à la fin de la
    session. Pas sur toi-même : si c’est toi l’élu, ta mise t’est rendue.</>,
};
const ODDS_HINT = 'La cote, c’est ce que rapporte chaque crédit misé : plus elle est haute, plus c’est risqué… et plus ça paie.';
const PHASES = ['Paris', 'Session', 'Vote', 'Résultats'] as const;

const seenKey = (fixtureId: number) => `bets.seen.${fixtureId}`;
const wasSeen = (fixtureId: number) => { try { return localStorage.getItem(seenKey(fixtureId)) === '1'; } catch { return true; } };
const markSeen = (fixtureId: number) => { try { localStorage.setItem(seenKey(fixtureId), '1'); } catch { /* navigation privée */ } };

const byOrder = (a: Market, b: Market) => MARKET_ORDER.indexOf(a.id) - MARKET_ORDER.indexOf(b.id);
const score = (m: BetMatch) => `FoodBall ${m.goalsFor}–${m.goalsAgainst} ${m.opponent}`;
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;
const record = (s: BetSession) => `${plural(s.matches, 'match')} · ${s.wins}V ${s.draws}N ${s.losses}D`;
const isPlayerMarket = (id: MarketId) => id === 'crack' || id === 'flop' || id === 'scorer' || id === 'clumsy';
const titleOf = (id: MarketId) => `${BONUS_MARKETS.includes(id) ? 'Bonus · ' : ''}${MARKET_COPY[id].title}`;

/** En tête de la soirée sur les buts ou les tirs ratés (ex æquo compris). */
function topPlayers(s: BetSession, key: 'goals' | 'missed') {
  const best = Math.max(0, ...s.players.map((p) => p[key]));
  return { best, ids: best === 0 ? [] : s.players.filter((p) => p[key] === best).map((p) => String(p.memberId)),
    names: best === 0 ? [] : s.players.filter((p) => p[key] === best).map((p) => p.gamertag) };
}

/** L'issue en tête d'un pari de session (null : pas encore connue, ou réglée au vote). */
function sessionLead(id: MarketId, s: BetSession): string[] | null {
  if (s.matches === 0 || id === 'crack' || id === 'flop') return null;
  if (id === 'scorer' || id === 'clumsy') return topPlayers(s, id === 'scorer' ? 'goals' : 'missed').ids;
  if (id === 'sr') return s.srStart === null || s.srNow === null || s.srStart === s.srNow ? null : [s.srNow > s.srStart ? 'up' : 'down'];
  const a = sessionAnswer(id, s);
  return a === null ? null : [a];
}

/** Où en est chaque pari de la session, en une ligne. */
function sessionNow(id: MarketId, s: BetSession): string {
  if (id === 'crack') return 'Élu au vote, en fin de soirée';
  if (s.matches === 0) return 'Pas encore de match';
  switch (id) {
    case 'bilan': return `${s.wins} V · ${s.draws} N · ${s.losses} D`;
    case 'attack': return `${plural(s.goalsFor, 'but')} · ${frNum(s.goalsFor / s.matches, 1)} / match`;
    case 'scorer': { const t = topPlayers(s, 'goals'); return t.best ? `En tête : ${t.names.join(', ')} (${t.best})` : 'Personne n’a marqué'; }
    case 'clumsy': { const t = topPlayers(s, 'missed'); return t.best ? `En tête : ${t.names.join(', ')} (${t.best} ratés)` : 'Aucun tir raté'; }
    case 'sr': return s.srStart !== null && s.srNow !== null ? `${fmt(s.srStart)} → ${fmt(s.srNow)}` : 'Skill rating inconnu';
    case 'cleansheet': return `${plural(s.cleanSheets, 'match')} sans encaisser`;
    case 'red': return s.reds ? plural(s.reds, 'match') + ' avec un rouge' : 'Aucun rouge';
    case 'ragequit': return s.ragequits ? plural(s.ragequits, 'abandon') : 'Aucun abandon';
    case 'streak': return `Meilleure série : ${s.bestStreak} V`;
    default: return '';
  }
}

/** La bonne réponse d'un pari réglé. */
function answer(market: Market, match: BetMatch | null, crack: string[] | null, session?: BetSession | null): string | null {
  if (market.id === 'crack') return crack?.join(' & ') ?? null;
  if (session) {
    if (market.id === 'scorer' || market.id === 'clumsy') {
      const t = topPlayers(session, market.id === 'scorer' ? 'goals' : 'missed');
      return t.best ? `${t.names.join(' & ')} (${t.best})` : 'personne';
    }
    const lead = sessionLead(market.id, session);
    const label = lead ? market.options.find((o) => o.id === lead[0])?.label ?? null : null;
    return market.id === 'sr' && label && session.srStart !== null && session.srNow !== null
      ? `${label} (${session.srNow > session.srStart ? '+' : ''}${session.srNow - session.srStart})` : label;
  }
  if (!match) return null;
  const id = market.id === 'verdict' ? match.result
    : market.id === 'goals' ? (match.goalsFor <= 1 ? '0-1' : match.goalsFor <= 3 ? '2-3' : '4+')
    : market.id === 'against' ? (match.goalsAgainst === 0 ? '0' : match.goalsAgainst <= 2 ? '1-2' : '3+')
    : market.id === 'cleansheet' ? (match.goalsAgainst === 0 ? 'oui' : 'non') : null;
  return market.options.find((o) => o.id === id)?.label ?? null;
}

// ---------------------------------------------------------------- Cadre commun

interface Ctx { state: BetsState | null; close: () => void; preview: boolean; adminOpen: boolean; setAdminOpen: (open: boolean) => void }
const FoodBetCtx = createContext<Ctx>({ state: null, close: () => {}, preview: false, adminOpen: false, setAdminOpen: () => {} });

function Close() {
  const { close } = useContext(FoodBetCtx);
  return <button type="button" className="fb-icon" onClick={close} aria-label="Revenir au club">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path d="M5 5l14 14M19 5L5 19" /></svg>
  </button>;
}

/** Les quatre phases de la soirée, et où on en est. `phase` 0 : avant la soirée. */
function Phases({ phase, status, live = false }: { phase: number; status: ReactNode; live?: boolean }) {
  return <>
    <ol className="fb-phases" aria-label={phase ? `Phase ${phase} sur 4 : ${PHASES[phase - 1]}` : 'Avant la soirée'}>
      {PHASES.map((label, i) => <li key={label} className={i + 1 < phase ? 'is-done' : i + 1 === phase ? 'is-on' : undefined}
        aria-current={i + 1 === phase ? 'step' : undefined}><i />{i + 1 < phase ? '✓' : i + 1} {label}</li>)}
    </ol>
    <p className="fb-now"><span>{phase ? `Phase ${phase} sur 4` : 'Avant la soirée'}</span><b className={live ? 'is-live' : undefined}>{status}</b></p>
  </>;
}

/** Un écran : marque, solde, croix, les phases ; en bas, le panneau du moment (mise, admin). */
function Screen({ tone, phase, status, live, sheet, children }: {
  tone: 'blue' | 'night' | 'ice'; phase?: number; status?: ReactNode; live?: boolean; sheet?: ReactNode; children: ReactNode;
}) {
  const { state, preview, adminOpen, setAdminOpen } = useContext(FoodBetCtx);
  return <section className={`fb-screen fb-screen--${tone}`}>
    <div className="fb-top">
      <span className="fb-mark">Food<span>Bet</span></span>
      {state?.isAdmin && <button type="button" className="fb-admin" aria-expanded={adminOpen} onClick={() => setAdminOpen(!adminOpen)}>Admin</button>}
      {state && <span className="fb-wallet" aria-label={`Solde : ${state.wallet.balance} ${CURRENCY.name}`}>
        {fmt(state.wallet.balance)} <small>{CR}</small>{state.wallet.bankrupt && <small> · prêt</small>}</span>}
      <Close />
    </div>
    {phase !== undefined && <Phases phase={phase} status={status} live={live} />}
    {preview && <p className="fb-demo" role="note">Aperçu admin : seuls les admins voient FoodBet pour l’instant.</p>}
    <div className="fb-main">{children}</div>
    {adminOpen && state ? <AdminSheet state={state} /> : sheet}
  </section>;
}

function Bailout() {
  const { state } = useContext(FoodBetCtx);
  const play = useBetsPlay();
  if (!state?.wallet.canBailout) return null;
  return <button type="button" className="fb-btn fb-btn--ghost fb-btn--sm" disabled={play.isPending} onClick={() => play.mutate({ action: 'bailout' })}>
    À sec ? Prêt <b>+100 {CR}</b></button>;
}

// ---------------------------------------------------------------- La salle d'attente

interface Who { name: string; me: boolean; done: boolean }

/**
 * Salle d'attente : rien à faire pour le joueur. Elle dit ce qui se passe maintenant, ce qui
 * vient ensuite (et ce qui le déclenche), et qui est là. L'admin y trouve la phase suivante.
 */
function Room({ phase, status, live, explain, now, next, who, whoTitle, doneLabel, todoLabel, children }: {
  phase: number; status: ReactNode; live?: boolean; explain: ReactNode; now: ReactNode; next: ReactNode;
  who: Who[]; whoTitle: string; doneLabel: string; todoLabel?: string; children?: ReactNode;
}) {
  const { state } = useContext(FoodBetCtx);
  return <Screen tone="night" phase={phase} status={status} live={live} sheet={state?.isAdmin ? <AdminNext state={state} /> : undefined}>
    <h2 className="fb-big fb-big--md">Salle<br />d’attente</h2>
    <p className="fb-note">{explain}</p>
    <div className="fb-room">
      <p><b>Maintenant</b><span>{now}</span></p>
      <p><b>Ensuite</b><span>{next}</span></p>
    </div>
    {who.length > 0 && <div>
      <p className="fb-kick">{whoTitle}</p>
      <div className="fb-rows">
        {who.map((w) => <p key={w.name} className="fb-who"><span>{w.me ? 'Toi' : w.name}</span>
          <em className={w.done ? 'is-done' : undefined}>{w.done ? doneLabel : todoLabel}</em></p>)}
      </div>
    </div>}
    {children}
    {!state?.isAdmin && <p className="fb-tap fb-push">L’écran passe tout seul à la phase suivante</p>}
  </Screen>;
}

/** Phase 0 : la soirée n'a pas commencé. */
function RoomBefore({ onBoard }: { onBoard: () => void }) {
  const { state } = useContext(FoodBetCtx);
  const last = state!.history.find((h) => h.status === 'settled');
  const net = last ? last.mySlips.reduce((sum, s) => sum + (s.payout ?? 0) - s.stake, 0) : 0;
  const here = state!.room.filter((r) => r.here || r.me).map((r) => ({ name: r.name, me: r.me, done: true }));
  return <Room phase={0} status="Salle d’attente"
    explain={<>Les paris ne sont pas encore ouverts. <b>L’admin les ouvre avant le premier match</b> de la soirée : reste ici, l’écran
      passe tout seul à la phase 1.</>}
    now="On attend que tout le monde arrive dans le lobby." next="Phase 1 : tu remplis ton ticket de la soirée (30 secondes)."
    who={here} whoTitle={`Dans la salle · ${here.length}`} doneLabel="là">
    {(last?.session || last?.match) && <p className="fb-note">Dernier FoodBet : {last.session ? record(last.session) : score(last.match!)}
      {last.mySlips.length > 0 && <> · <b className="fb-gain">{net > 0 ? '+' : ''}{fmt(net)} {CR}</b></>}</p>}
    <Bailout />
    <button type="button" className="fb-link" onClick={onBoard}>Voir le classement</button>
  </Room>;
}

/** Phase 1 : le ticket de la soirée. Chaque pari se joue, se change ou se passe ; fermé au coup d'envoi. */
function Ticket({ markets, skipped, onOpen, onFill }: {
  markets: Market[]; skipped: MarketId[]; onOpen: (id: MarketId) => void; onFill: () => void;
}) {
  const { state } = useContext(FoodBetCtx);
  const fixture = state!.fixture!;
  const slipOf = (id: MarketId) => fixture.mySlips.find((sl) => sl.market === id);
  const played = markets.filter((m) => slipOf(m.id)).length;
  const passed = markets.filter((m) => !slipOf(m.id) && skipped.includes(m.id)).length;
  const left = markets.length - played - passed;
  const others = state!.room.filter((r) => r.played && !r.me).length;
  return <Screen tone="blue" phase={1} status={left === 0 ? 'Ticket rempli' : 'À toi de jouer'}
    sheet={state!.isAdmin ? <AdminNext state={state!} /> : undefined}>
    <h2 className="fb-big fb-big--md">Ton<br />ticket</h2>
    <p className="fb-note">{markets.length} paris sur <b>toute la soirée</b>, quel que soit le nombre de matchs. Touche un pari pour le jouer
      ou le changer. Fermé au coup d’envoi du premier match.</p>
    <div className="fb-ticket">
      {markets.map((m) => {
        const slip = slipOf(m.id);
        const label = slip ? `${optionLabel(markets, slip)} · ${fmt(slip.stake)}` : skipped.includes(m.id) ? 'passé' : 'à jouer';
        return <button key={m.id} type="button" className={`fb-tk${slip ? ' is-done' : skipped.includes(m.id) ? ' is-skip' : ''}`} onClick={() => onOpen(m.id)}>
          <span aria-hidden="true">{MARKET_COPY[m.id].emoji}</span>
          <span><b>{titleOf(m.id)}</b><small>{MARKET_COPY[m.id].question}</small></span>
          <em>{label}</em>
        </button>;
      })}
    </div>
    {left > 0 && <button type="button" className="fb-btn fb-btn--solid fb-btn--center" onClick={onFill}>
      {left === markets.length ? 'Remplir mon ticket' : `Jouer les ${left} paris restants`}</button>}
    <p className="fb-tap fb-push">{played} joué{played > 1 ? 's' : ''} · {passed} passé{passed > 1 ? 's' : ''} · {others} autre{others > 1 ? 's' : ''} ont joué · secret jusqu’au vote</p>
  </Screen>;
}

/** Phase 2 : la session se joue. Chaque pari suivi en direct, mis à jour après chaque match. */
function RoomSession() {
  const { state } = useContext(FoodBetCtx);
  const fixture = state!.fixture!;
  const s = fixture.session;
  const markets = [...fixture.markets].sort(byOrder);
  const verdict = (id: MarketId, slip: Slip | undefined) => {
    if (!slip) return { text: 'pas joué', tone: '' };
    const lead = s ? sessionLead(id, s) : null;
    if (lead === null) return { text: 'à venir', tone: '' };
    return lead.includes(slip.option) ? { text: '✓ en bonne voie', tone: 'is-up' } : { text: '✗ mal parti', tone: 'is-down' };
  };
  return <Screen tone="night" phase={2} status="● En direct" live sheet={state!.isAdmin ? <AdminNext state={state!} /> : undefined}>
    <h2 className="fb-big fb-big--md">{s && s.matches > 0 ? <>Ce soir<br /><em>{s.wins}V · {s.draws}N · {s.losses}D</em></> : <>Session<br />lancée</>}</h2>
    <p className="fb-note">{fixture.mySlips.length > 0 ? <>Les paris sont fermés. Tes pronos <b>en temps réel</b>, mis à jour après chaque match. Rien à
      faire : joue.</> : <>Les paris ont fermé au coup d’envoi : <b>tu n’as rien joué ce soir</b>. Tu pourras quand même voter pour le Crack.</>}</p>
    <div className="fb-live">
      {markets.map((m) => {
        const slip = fixture.mySlips.find((sl) => sl.market === m.id);
        const v = verdict(m.id, slip);
        return <p key={m.id}><b>{titleOf(m.id)}</b><span>{s ? sessionNow(m.id, s) : '…'}{slip && <small>Ton prono : {optionLabel(markets, slip)}</small>}</span>
          <em className={v.tone || undefined}>{v.text}</em></p>;
      })}
    </div>
    {s?.last && <p className="fb-note">Dernier match : <b>{s.last.goalsFor}–{s.last.goalsAgainst} vs {s.last.opponent}</b></p>}
    {!state!.isAdmin && <p className="fb-tap fb-push">Phase 3 : quand vous arrêtez de jouer, l’admin clôt la session et ouvre le vote</p>}
  </Screen>;
}

/** Phase 3, vote donné : on attend les autres votes ; les pronos du club se dévoilent. */
function RoomVoted({ vote, onChange }: { vote: BetsState['votes'][number]; onChange: () => void }) {
  const { state } = useContext(FoodBetCtx);
  const picks = vote.picks ?? [];
  const leader = Object.entries(vote.tally.crack).sort((a, b) => b[1] - a[1])[0];
  const leaderName = leader && vote.candidates.find((c) => String(c.memberId) === leader[0])?.gamertag;
  const who = state!.room.filter((r) => r.here || r.voted || r.played || r.me).map((r) => ({ name: r.name, me: r.me, done: r.voted }));
  const voted = `${plural(who.filter((w) => w.done).length, 'vote')} sur ${who.length}`;
  return <Room phase={3} status="Tu as voté"
    explain={<>Ton vote est pris en compte. Tu vois maintenant <b>ce que chacun avait parié</b>.</>}
    now={`Les autres votent : ${voted}.${leaderName ? ` En tête : ${leaderName}.` : ''}`}
    next="Phase 4 : l’admin clôt le vote, le Crack est désigné et les gains tombent."
    who={who} whoTitle={`Votes · ${voted}`} doneLabel="✓ a voté" todoLabel="pas encore">
    <div>
      <p className="fb-kick">Ce que le club a joué</p>
      {picks.length === 0 && <p className="fb-note">Personne n’a parié sur ce match.</p>}
      {[...vote.markets].sort(byOrder).map((m) => {
        const groups = m.options.map((o) => ({ o, names: picks.filter((p) => p.market === m.id && p.option === o.id).map((p) => (p.me ? 'Toi' : p.name)) }))
          .filter((g) => g.names.length > 0);
        if (groups.length === 0) return null;
        const right = m.id === 'crack' ? null : answer(m, null, null, vote.session);
        return <div key={m.id}>
          <p className="fb-note" style={{ marginTop: 6 }}>{MARKET_COPY[m.id].title} · {right ? <>réglé, c’était <b>{right}</b></> : m.id === 'crack' ? 'en attente du vote' : 'remboursé'}</p>
          <div className="fb-rows">{groups.map((g) => <div key={g.o.id} className="fb-pick"><b>{g.o.label} · {g.names.length}</b><span>{g.names.join(', ')}</span></div>)}</div>
        </div>;
      })}
    </div>
    <button type="button" className="fb-link" onClick={onChange}>Changer mon vote</button>
  </Room>;
}

// ---------------------------------------------------------------- Phase 1 · Parier

function Trend({ value }: { value?: number }) {
  if (!value || Math.abs(value) < 0.05) return null;
  return <span className="fb-trend" title="Effet du dernier match">{value > 0 ? '▲' : '▼'}</span>;
}

function StakeSheet({ market, option, onPlaced }: { market: Market; option: Market['options'][number]; onPlaced: () => void }) {
  const { state } = useContext(FoodBetCtx);
  const fixture = state!.fixture!;
  const slip = fixture.mySlips.find((s) => s.market === market.id);
  const play = useBetsPlay();
  const available = state!.wallet.balance + (slip?.stake ?? 0);
  const [choice, setChoice] = useState<number | 'max'>(slip?.stake ?? Math.min(DEFAULT_STAKE, available));
  const stake = choice === 'max' ? available : choice;
  const ok = stake > 0 && stake <= available;
  return <div className="fb-sheet">
    <span className="fb-sheet-title">Combien tu mets ?</span>
    <p className="fb-note" style={{ color: 'var(--fc-ardoise)', opacity: 1 }}>Si tu as vu juste, tu récupères <b style={{ color: 'var(--fc-abysse)' }}>ta mise × la cote</b>.
      Sinon, tu perds ta mise. « Tapis » = tout ton solde.</p>
    {available <= 0 ? <><p className="fb-note">Tu es à sec pour ce match.</p><Bailout /></> : <>
      <div className="fb-chips" role="group" aria-label="Ta mise">
        {[...STAKES, 'max' as const].map((s) => <button key={s} type="button" className="fb-chip" aria-pressed={choice === s}
          disabled={s !== 'max' && s > available} onClick={() => setChoice(s)}>{s === 'max' ? 'Tapis' : s}</button>)}
      </div>
      <div className="fb-sheet-gain"><span>{fmt(stake)} × {frNum(option.odds, 2)} =</span><b>{fmt(payout(stake, option.odds))} {CR}</b></div>
      <button type="button" className="fb-btn fb-btn--blue" disabled={!ok || play.isPending}
        onClick={() => play.mutate({ action: 'place', fixtureId: fixture.id, bets: [{ market: market.id, option: option.id, stake }] }, { onSuccess: onPlaced })}>
        {play.isPending ? 'On valide…' : <>Valider <b>{fmt(stake)} {CR}</b></>}
      </button>
      {play.isError && <p className="fb-error" role="alert">{play.error.message}</p>}
      <p className="fb-tap">Modifiable jusqu’au coup d’envoi</p>
    </>}
  </div>;
}

function Choose({ market, index, total, onPlaced, onSkip, skipLabel, onTicket }: {
  market: Market; index: number; total: number; onPlaced: () => void; onSkip: () => void; skipLabel: string; onTicket: () => void;
}) {
  const { state } = useContext(FoodBetCtx);
  const current = state!.fixture!.mySlips.find((s) => s.market === market.id)?.option ?? null;
  const [pick, setPick] = useState<string | null>(null);
  const option = market.options.find((o) => o.id === pick);
  const players = isPlayerMarket(market.id);
  const self = String(state!.myMemberId);
  const kicker = `Pari ${index + 1} sur ${total} · ${titleOf(market.id)}`;

  if (option) {
    return <Screen tone="blue" phase={1} status="À toi de jouer" sheet={<StakeSheet market={market} option={option} onPlaced={() => { setPick(null); onPlaced(); }} />}>
      <p className="fb-kick">Ton choix · {titleOf(market.id)}</p>
      <h2 className="fb-big fb-big--md">{option.label}<br /><em>×{frNum(option.odds, 2)}</em></h2>
      <button type="button" className="fb-link fb-link--start" onClick={() => setPick(null)}>Changer de réponse</button>
    </Screen>;
  }
  return <Screen tone="blue" phase={1} status="À toi de jouer">
    <p className="fb-kick">{kicker}</p>
    <h2 className="fb-big">{ASK[market.id]}</h2>
    <p className="fb-note">{EXPLAIN[market.id]}{players ? '' : ` ${ODDS_HINT}`}</p>
    {market.options.some((o) => o.trend && Math.abs(o.trend) >= 0.05) && <p className="fb-note" style={{ fontSize: 14 }}>▲ cote en hausse depuis le dernier match · ▼ en baisse</p>}
    {players ? (
      <div className="fb-grid fb-push" role="radiogroup" aria-label={ASK[market.id]}>
        {market.options.map((o) => o.id === self
          ? <button key={o.id} type="button" className="fb-player" disabled title="Pas de pari sur toi-même"><strong>Toi</strong><small>pas sur toi</small></button>
          : <button key={o.id} type="button" role="radio" aria-checked={current === o.id}
            className={`fb-player${current === o.id ? ' is-on' : ''}`} onClick={() => setPick(o.id)}>
            <strong>{o.label}</strong><b>×{frNum(o.odds, 2)}<Trend value={o.trend} /></b>
          </button>)}
      </div>
    ) : (
      <div className="fb-choices fb-push" role="radiogroup" aria-label={ASK[market.id]}>
        {market.options.map((o) => <button key={o.id} type="button" role="radio" aria-checked={current === o.id}
          className={`fb-btn ${current === o.id ? 'fb-btn--solid' : 'fb-btn--ghost'}`}
          onClick={() => setPick(o.id)}>
          {o.label} <b>×{frNum(o.odds, 2)}<Trend value={o.trend} /></b>
        </button>)}
      </div>
    )}
    <p className="fb-tap">{players ? 'Touche un joueur · puis ta mise' : 'Touche ta réponse · les paris ferment au coup d’envoi'}</p>
    <div className="fb-links"><button type="button" className="fb-link" onClick={onTicket}>Voir mon ticket</button>
      <button type="button" className="fb-link" onClick={onSkip}>{skipLabel}</button></div>
  </Screen>;
}

function OpenFlow({ state }: { state: BetsState }) {
  const fixture = state.fixture!;
  const markets = [...fixture.markets].sort(byOrder);
  const [skipped, setSkipped] = useState<MarketId[]>([]);
  const has = (m: Market) => fixture.mySlips.some((sl) => sl.market === m.id);
  const done = (m: Market) => has(m) || skipped.includes(m.id);
  // Première visite : on enchaîne les paris ; ensuite, le ticket.
  const [filling, setFilling] = useState(fixture.mySlips.length === 0);
  const [active, setActive] = useState<MarketId | null>(fixture.mySlips.length === 0 ? markets[0]?.id ?? null : null);

  const advance = (from: MarketId, skippedNow = false) => {
    if (!filling) { setActive(null); return; }
    const i = markets.findIndex((m) => m.id === from);
    const next = markets.find((m, j) => j > i && !done(m) && !(skippedNow && m.id === from));
    if (next) setActive(next.id); else { setActive(null); setFilling(false); }
  };
  const market = markets.find((m) => m.id === active);
  if (!market) {
    return <Ticket markets={markets} skipped={skipped} onOpen={(id) => { setFilling(false); setActive(id); }}
      onFill={() => { setFilling(true); setActive(markets.find((m) => !done(m))?.id ?? null); }} />;
  }
  const skip = () => { if (!has(market)) setSkipped((list) => [...list, market.id]); advance(market.id, true); };
  return <Choose key={market.id} market={market} index={markets.indexOf(market)} total={markets.length}
    onPlaced={() => advance(market.id)} onSkip={skip} skipLabel={has(market) ? 'Garder mon choix' : 'Passer ce pari'}
    onTicket={() => { setFilling(false); setActive(null); }} />;
}

// ---------------------------------------------------------------- Phase 3 · Le vote

function VoteScreen({ vote, onVoted }: { vote: BetsState['votes'][number]; onVoted: () => void }) {
  const { state } = useContext(FoodBetCtx);
  const play = useBetsPlay();
  const stats = new Map(vote.session.players.map((p) => [p.memberId, p]));
  const crackSlip = vote.mySlips.find((s) => s.market === 'crack');
  return <Screen tone="ice" phase={3} status="À toi de voter">
    <p className="fb-kick">{record(vote.session)} · fin de session</p>
    <h2 className="fb-big">Ton crack<br />du soir ?</h2>
    <p className="fb-note">Élis le <b>joueur de la soirée</b> : celui qui a le plus pesé sur {plural(vote.session.matches, 'match')}. Un seul vote,
      <b> pas pour toi-même</b>. Le plus de voix devient le Crack et règle le pari « Le Crack ».</p>
    <p className="fb-note" style={{ fontSize: 14 }}>En gros sur chaque tuile : sa note EA moyenne de la soirée.{crackSlip && <> Ton pari : <b>{optionLabel(vote.markets, crackSlip)}</b>.</>}</p>
    <div className="fb-grid fb-push" role="radiogroup" aria-label="Le crack du match">
      {vote.candidates.map((c) => {
        const p = stats.get(c.memberId);
        const self = c.memberId === state!.myMemberId;
        const line = p ? [p.goals && plural(p.goals, 'but'), p.assists && `${plural(p.assists, 'passe')} D`].filter(Boolean).join(' · ') : '';
        return <button key={c.memberId} type="button" role="radio" aria-checked={vote.myVotes.crack === c.memberId}
          className={`fb-player${vote.myVotes.crack === c.memberId ? ' is-on' : ''}`} disabled={self || play.isPending}
          onClick={() => play.mutate({ action: 'vote', fixtureId: vote.id, category: 'crack', memberId: c.memberId }, { onSuccess: onVoted })}>
          {p?.rating != null && <b>{frNum(p.rating, 1)}</b>}<strong>{self ? 'Toi' : c.gamertag}</strong>{line && <small>{line}</small>}
        </button>;
      })}
    </div>
    {play.isError && <p className="fb-error" role="alert">{play.error.message}</p>}
    <p className="fb-tap">{plural(vote.voters, 'vote')} · touche un joueur</p>
  </Screen>;
}

function VoteFlow({ vote }: { vote: BetsState['votes'][number] }) {
  const [changing, setChanging] = useState(false);
  if (vote.myVotes.crack === null || changing) return <VoteScreen vote={vote} onVoted={() => setChanging(false)} />;
  return <RoomVoted vote={vote} onChange={() => setChanging(true)} />;
}

// ---------------------------------------------------------------- Phase 4 · Les résultats

/** Gains et pertes par joueur sur une rencontre : chacun une ligne, le meilleur en haut. */
function standings(results: BetPick[]) {
  const rows = new Map<string, { name: string; me: boolean; won: number; net: number }>();
  for (const p of results) {
    const row = rows.get(p.name) ?? { name: p.name, me: p.me, won: 0, net: 0 };
    if (p.status === 'won') row.won += p.payout ?? 0;
    row.net += (p.payout ?? 0) - p.stake;
    rows.set(p.name, row);
  }
  const all = [...rows.values()];
  return { winners: all.filter((r) => r.won > 0).sort((a, b) => b.won - a.won), losers: all.filter((r) => r.won === 0 && r.net < 0) };
}

function Winners({ item, onDone, onBoard }: { item: BetsState['history'][number]; onDone: () => void; onBoard: () => void }) {
  const { winners, losers } = standings(item.results);
  const mine = item.mySlips.reduce((sum, s) => sum + (s.payout ?? 0) - s.stake, 0);
  const answers = [...item.markets].sort(byOrder).map((m) => [titleOf(m.id), answer(m, item.match, item.crack, item.session)] as const).filter(([, a]) => a);
  // Les votes du Crack, regroupés par joueur élu, le plus de voix en haut.
  const votes = [...new Set((item.ballots ?? []).map((b) => b.gamertag))]
    .map((gamertag) => ({ gamertag, voters: (item.ballots ?? []).filter((b) => b.gamertag === gamertag).map((b) => (b.me ? 'toi' : b.voter)) }))
    .sort((a, b) => b.voters.length - a.voters.length);
  return <Screen tone="blue" phase={4} status="Soirée terminée">
    {(item.session || item.match) && <p className="fb-kick">{item.session ? `${record(item.session)} · ${plural(item.session.goalsFor, 'but')}` : score(item.match!)}</p>}
    <h2 className="fb-big">{winners.length > 0 ? <>Ils ont<br />vu juste</> : <>Personne<br />n’a vu juste</>}</h2>
    <p className="fb-note">{winners.length > 0 ? <>Tout est réglé. Voici ceux qui ont gagné et ce qu’ils ont empoché (<b>mise × cote</b>). Les crédits sont
      déjà sur leur solde.</> : 'Tout est réglé : aucun prono n’est tombé juste ce soir. Les mises sont perdues.'}</p>
    <div className="fb-rows">
      {winners.map((w) => <div key={w.name} className={`fb-row${w.me ? ' is-me' : ''}`}><strong>{w.me ? 'Toi' : w.name}</strong><b>+{fmt(w.won)}</b></div>)}
    </div>
    {votes.length > 0 && <div>
      <p className="fb-kick">Qui a voté pour qui</p>
      <div className="fb-rows">{votes.map((v) => <div key={v.gamertag} className="fb-pick">
        <b>{v.gamertag} · {v.voters.length} voix</b><span>{v.voters.join(', ')}</span></div>)}</div>
    </div>}
    <div className="fb-push" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {answers.map(([title, a]) => <p key={title} className="fb-note">{title} : <b>{a}</b></p>)}
      {losers.length > 0 && <p className="fb-note">Raté : {losers.map((l) => `${l.me ? 'toi' : l.name} (${fmt(l.net)})`).join(', ')}</p>}
      {item.mySlips.length > 0 && <p className="fb-note fb-note--lg">Ton bilan : <b className="fb-gain">{mine > 0 ? '+' : ''}{fmt(mine)} {CR}</b></p>}
      <button type="button" className="fb-btn fb-btn--solid fb-btn--center" onClick={() => { onDone(); onBoard(); }}>Voir le classement</button>
      <button type="button" className="fb-link" onClick={onDone}>Retour à la salle d’attente</button>
    </div>
  </Screen>;
}

function Board({ onBack }: { onBack: () => void }) {
  const { state } = useContext(FoodBetCtx);
  const mine = state!.history.filter((h) => h.mySlips.length > 0);
  const won = mine.filter((h) => h.mySlips.some((s) => s.status === 'won')).length;
  return <Screen tone="night">
    <h2 className="fb-big fb-big--md">Le<br />classement</h2>
    <p className="fb-note">Le solde de crédits de chaque joueur. Tout le monde démarre à <b>500</b> : celui qui en a le plus est le meilleur
      pronostiqueur du club.</p>
    <div className="fb-rows">
      {state!.leaderboard.map((r, i) => <div key={r.accountId} className={`fb-rank${r.me ? ' is-me' : ''}`}>
        <i>{i + 1}</i><strong>{r.me ? 'Toi' : r.name}</strong><b>{fmt(r.balance)}</b></div>)}
    </div>
    {mine.length > 0 && <p className="fb-note fb-push">Tes derniers FoodBets : {mine.length} joué{mine.length > 1 ? 's' : ''} · {won} gagné{won > 1 ? 's' : ''}</p>}
    <button type="button" className={`fb-btn fb-btn--solid fb-btn--center${mine.length > 0 ? '' : ' fb-push'}`} onClick={onBack}>Retour</button>
  </Screen>;
}

// ---------------------------------------------------------------- Admin

/** Ce que l'admin fait ensuite : une seule commande, celle qui fait passer à la phase suivante. Il mène chaque phase. */
function nextStep(state: BetsState): { action: BetsAdminAction; label: string; hint: string } {
  const fixture = state.fixture;
  const vote = state.votes[0];
  if (fixture?.status === 'open') return { action: { action: 'lock' }, label: 'Coup d’envoi', hint: 'ferme les paris, la session commence (phase 2)' };
  if (fixture) return { action: { action: 'end-session' }, label: 'Fin de session',
    hint: `${plural(fixture.session?.matches ?? 0, 'match')} · récupère les derniers chez EA, règle les paris, ouvre le vote` };
  if (vote) return { action: { action: 'close-vote', fixtureId: vote.id }, label: 'Clore le vote et payer', hint: `phase 4 : désigne le Crack, verse les gains · ${plural(vote.voters, 'vote')}` };
  return { action: { action: 'open' }, label: 'Ouvrir les paris', hint: 'passe en phase 1, tire le ticket de la soirée' };
}

/** Suivre la session : l'admin lance une vérification EA toutes les 20 s, pendant 3 h au plus. */
const WATCH_EVERY = 20_000;
const WATCH_FOR = 3 * 3_600_000;

function WatchScore() {
  const check = useBetsAdmin();
  const [since, setSince] = useState<number | null>(null);
  const [last, setLast] = useState<Date | null>(null);
  useEffect(() => {
    if (since === null) return;
    const run = () => {
      if (Date.now() - since > WATCH_FOR) { setSince(null); return; }
      check.mutate({ action: 'check' }, { onSettled: () => setLast(new Date()) });
    };
    run();
    const timer = window.setInterval(run, WATCH_EVERY);
    return () => window.clearInterval(timer);
    // `check` change à chaque rendu : seul le lancement compte.
  }, [since]);
  if (since === null) {
    return <button type="button" className="fb-btn fb-btn--sm fb-btn--light fb-admin-go" onClick={() => setSince(Date.now())}>
      Suivre la session <small>vérifie chez EA toutes les 20&nbsp;s</small></button>;
  }
  return <p className="fb-adm-watch" role="status">
    <span>Vérification EA toutes les 20&nbsp;s{last ? ` · dernière à ${last.toLocaleTimeString('fr-FR')}` : '…'}</span>
    <button type="button" className="fb-link" onClick={() => setSince(null)}>Arrêter</button>
  </p>;
}

/** Phase 2 côté admin : les matchs comptés. Le téléphone vibre à chaque nouveau match. */
function SessionNotice({ session }: { session: BetSession | null }) {
  const count = session?.matches ?? 0;
  const seen = useRef(count);
  useEffect(() => {
    if (count > seen.current) navigator.vibrate?.([120, 60, 120]);
    seen.current = count;
  }, [count]);
  return <>
    {count > 0 && session?.last ? <p className="fb-adm-score is-in" role="status"><b>✓ {plural(count, 'match')} compté{count > 1 ? 's' : ''}</b>
      <span>Dernier : {session.last.goalsFor}–{session.last.goalsAgainst} vs {session.last.opponent}</span></p>
      : <p className="fb-adm-score" role="status"><b>Aucun match compté</b><span>Les matchs joués depuis le coup d’envoi s’ajoutent tout seuls.</span></p>}
    <WatchScore />
  </>;
}

/** Fin de session : irréversible, on confirme avec le nombre de matchs comptés. */
function confirmed(action: BetsAdminAction, state: BetsState) {
  if (action.action !== 'end-session') return true;
  const n = state.fixture?.session?.matches ?? 0;
  return window.confirm(n > 0 ? `Terminer la session ? Les paris sont réglés sur ${plural(n, 'match')}.`
    : 'Terminer la session ? Aucun match compté : toutes les mises seront remboursées.');
}

function AdminNext({ state }: { state: BetsState }) {
  const admin = useBetsAdmin();
  const step = nextStep(state);
  const target = state.fixture ?? state.votes[0];
  const cancel = () => target && window.confirm('Annuler cette soirée ? Toutes les mises seront remboursées.')
    && admin.mutate({ action: 'cancel', fixtureId: target.id });
  return <div className="fb-adm">
    <span className="fb-adm-tag">Admin · phase suivante</span>
    {state.fixture?.status === 'locked' && <SessionNotice session={state.fixture.session} />}
    <button type="button" className="fb-btn fb-btn--sm fb-admin-go" style={{ background: 'var(--fc-abysse)', color: 'var(--fc-craie)' }}
      disabled={admin.isPending} onClick={() => confirmed(step.action, state) && admin.mutate(step.action)}>{admin.isPending ? 'Un instant…' : <>{step.label} <small>{step.hint}</small></>}</button>
    {admin.isError && <p className="fb-error" role="alert">{admin.error.message}</p>}
    {target && <button type="button" className="fb-link" onClick={cancel} disabled={admin.isPending}>Annuler la soirée · rembourse tout</button>}
  </div>;
}

/** Toutes les commandes, depuis n'importe quel écran (bouton « Admin » en haut). */
function AdminSheet({ state }: { state: BetsState }) {
  const admin = useBetsAdmin();
  const { setAdminOpen } = useContext(FoodBetCtx);
  const fixture = state.fixture;
  const vote = state.votes[0];
  const target = fixture ?? vote;
  const run = (action: BetsAdminAction) => admin.mutate(action, { onSuccess: () => setAdminOpen(false) });
  const cancel = () => target && window.confirm('Annuler cette soirée ? Toutes les mises seront remboursées.') && run({ action: 'cancel', fixtureId: target.id });
  return <div className="fb-sheet">
    <span className="fb-sheet-title">Commandes admin</span>
    <p className="fb-note" style={{ color: 'var(--fc-ardoise)', opacity: 1, fontSize: 14 }}>Visible des admins seulement. Les autres joueurs ne voient jamais ce panneau.</p>
    {!fixture && <button type="button" className="fb-btn fb-btn--sm fb-admin-go" style={{ background: 'var(--fc-abysse)', color: 'var(--fc-craie)' }}
      disabled={admin.isPending} onClick={() => run({ action: 'open' })}>Ouvrir les paris <small>{vote ? 'clôt le vote en cours, passe en phase 1' : 'passe en phase 1'}</small></button>}
    {fixture?.status === 'open' && <button type="button" className="fb-btn fb-btn--sm fb-admin-go" style={{ background: 'var(--fc-abysse)', color: 'var(--fc-craie)' }}
      disabled={admin.isPending} onClick={() => run({ action: 'lock' })}>Coup d’envoi <small>ferme les paris, la session commence</small></button>}
    {fixture?.status === 'locked' && <button type="button" className="fb-btn fb-btn--sm fb-admin-go" style={{ background: 'var(--fc-abysse)', color: 'var(--fc-craie)' }}
      disabled={admin.isPending} onClick={() => confirmed({ action: 'end-session' }, state) && run({ action: 'end-session' })}>Fin de session
      <small>{plural(fixture.session?.matches ?? 0, 'match')} · règle les paris, ouvre le vote</small></button>}
    {vote && !fixture && <button type="button" className="fb-btn fb-btn--sm fb-btn--light fb-admin-go" disabled={admin.isPending}
      onClick={() => run({ action: 'close-vote', fixtureId: vote.id })}>Clore le vote et payer <small>passe en phase 4 · {plural(vote.voters, 'vote')}</small></button>}
    {target && <button type="button" className="fb-btn fb-btn--sm fb-btn--danger fb-admin-go" disabled={admin.isPending} onClick={cancel}>
      Annuler la soirée <small>rembourse toutes les mises</small></button>}
    {admin.isError && <p className="fb-error" role="alert">{admin.error.message}</p>}
    <button type="button" className="fb-link" onClick={() => setAdminOpen(false)}>Fermer</button>
  </div>;
}

// ---------------------------------------------------------------- La soirée

function Evening({ state }: { state: BetsState }) {
  const [board, setBoard] = useState(false);
  // Ne sert qu'à redessiner après les résultats : le « déjà vu » vit dans localStorage.
  const [, setSeen] = useState(0);
  const reveal = state.history.find((h) => h.status === 'settled' && Date.now() - new Date(h.settledAt).getTime() < 48 * 3_600_000
    && !wasSeen(h.id) && (h.mySlips.length > 0 || h.myVote !== null));
  const fixture = state.fixture;
  const vote = state.votes[0];

  if (board) return <Board onBack={() => setBoard(false)} />;
  if (reveal) return <Winners key={`w${reveal.id}`} item={reveal} onBoard={() => setBoard(true)} onDone={() => { markSeen(reveal.id); setSeen((n) => n + 1); }} />;
  if (fixture?.status === 'open') return <OpenFlow key={`o${fixture.id}`} state={state} />;
  if (fixture?.status === 'locked') return <RoomSession />;
  if (vote) return <VoteFlow key={`v${vote.id}`} vote={vote} />;
  return <RoomBefore onBoard={() => setBoard(true)} />;
}

function Message({ title, text, children }: { title: ReactNode; text: string; children?: ReactNode }) {
  return <Screen tone="night">
    <h2 className="fb-big" style={{ marginTop: 24 }}>{title}</h2>
    <p className="fb-note fb-note--lg">{text}</p>
    {children && <div className="fb-push" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>}
  </Screen>;
}

export function FoodBetView() {
  usePageTitle('FoodBet');
  const navigate = useNavigate();
  const me = useMe();
  const { status, ready } = useBetsStatus();
  const signedIn = me.data?.signedIn === true;
  const query = useBetsState(ready && status.access !== 'locked' && signedIn);
  const [adminOpen, setAdminOpen] = useState(false);
  const close = () => ((window.history.state as { idx?: number } | null)?.idx ? navigate(-1) : navigate('/'));

  useEffect(() => {
    document.body.classList.add('fb-open');
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.classList.remove('fb-open'); window.removeEventListener('keydown', onKey); };
  });

  const state = query.data ?? null;
  const content = !ready || me.isPending || (signedIn && status.access !== 'locked' && query.isPending)
    ? <Message title={<>Food<em>Bet</em></>} text="Chargement de la soirée…" />
    : status.access === 'locked' ? <Message title={<>Bientôt<br /><em>FoodBet</em></>} text="Les paris du club ouvrent bientôt. Reviens avant la prochaine session." />
    : !signedIn ? <Message title={<>Food<em>Bet</em></>} text={`Connecte-toi avec Discord : ${STARTING_TEXT}`}>
      <SignInButton className="fb-btn fb-btn--amber fb-btn--center" /></Message>
    : query.isError || !state ? <Message title="Oups" text="Impossible de charger FoodBet pour le moment.">
      <button type="button" className="fb-btn fb-btn--solid fb-btn--center" onClick={() => void query.refetch()}>Réessayer</button></Message>
    : <Evening state={state} />;

  return createPortal(
    <FoodBetCtx.Provider value={{ state, close, preview: status.access === 'preview', adminOpen, setAdminOpen }}>
      <div className="fb" role="dialog" aria-modal="true" aria-label="FoodBet">{content}</div>
    </FoodBetCtx.Provider>,
    document.body,
  );
}
