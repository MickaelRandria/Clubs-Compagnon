import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import {
  CURRENCY, DEFAULT_STAKE, MARKET_COPY, MARKET_ORDER, STAKES, optionLabel, payout,
  type BetMatch, type BetsAdminAction, type BetsState, type BetPick, type Market, type MarketId,
} from '../../shared/bets';
import { useMe } from '../api/auth';
import { useBetsAdmin, useBetsPlay, useBetsState, useBetsStatus } from '../api/bets';
import { useMatchDetail } from '../api/queries';
import { SignInButton } from '../components/fc27/SignIn';
import { frNum } from '../lib/format';
import { usePageTitle } from '../lib/hooks';
import '../styles/foodbet.css';

// FoodBet : le pari du club, en plein écran. Une soirée suit quatre phases, toujours visibles
// en haut de l'écran : 1 Paris, 2 Match, 3 Vote, 4 Résultats. Un joueur ne voit que deux sortes
// d'écrans : celui où il agit (parier, voter, découvrir les gagnants) et la salle d'attente,
// qui dit ce qui se passe maintenant, ce qui vient ensuite, et qui est là. L'admin fait avancer
// les phases depuis un panneau en bas de la salle. Règles : drizzle/0017 à 0024.

const CR = CURRENCY.short;
const STARTING_TEXT = `500 ${CURRENCY.name} offerts. Avant chaque match tu paries, après tu votes pour le joueur du match. Aucun argent réel.`;
const fmt = (n: number) => n.toLocaleString('fr-FR');

/** La question en gros, une par pari. */
const ASK: Record<MarketId, string> = {
  verdict: 'Qui gagne ?', goals: 'Combien de buts ?', against: 'Combien encaissés ?', crack: 'Qui va rouler ?', flop: 'La casserole ?',
  scorer: 'Qui va marquer ?', cleansheet: 'Zéro encaissé ?', red: 'Un rouge ?', ragequit: 'Ils lâchent ?',
};
/** Ce qu'on parie, en clair, sous la question. */
const EXPLAIN: Record<MarketId, ReactNode> = {
  verdict: <>Devine le résultat de <b>FoodBall</b> ce soir : victoire, nul ou défaite.</>,
  goals: <>Devine combien de buts <b>FoodBall</b> va marquer ce soir.</>,
  against: <>Devine combien de buts <b>FoodBall</b> va encaisser ce soir.</>,
  scorer: <>Choisis un joueur : tu gagnes s’il <b>marque au moins un but</b> ce soir. Pas sur toi-même. S’il ne joue pas, ta mise
    t’est rendue.</>,
  cleansheet: <>Devine si <b>FoodBall</b> va finir le match sans encaisser un seul but.</>,
  red: <>Devine si un joueur de <b>FoodBall</b> va prendre un carton rouge.</>,
  ragequit: <>Devine si l’adversaire va quitter le match avant la fin.</>,
  flop: <>Devine le joueur que le club désignera comme le moins bon du match.</>,
  crack: <>Parie sur le joueur qui sera élu <b>Crack du match</b>, le meilleur joueur de la soirée. C’est le club qui l’élit par un vote,
    juste après le match. Pas sur toi-même : si c’est toi l’élu, ta mise t’est rendue.</>,
};
const ODDS_HINT = 'La cote, c’est ce que rapporte chaque crédit misé : plus elle est haute, plus c’est risqué… et plus ça paie.';
const PHASES = ['Paris', 'Match', 'Vote', 'Résultats'] as const;

const seenKey = (fixtureId: number) => `bets.seen.${fixtureId}`;
const wasSeen = (fixtureId: number) => { try { return localStorage.getItem(seenKey(fixtureId)) === '1'; } catch { return true; } };
const markSeen = (fixtureId: number) => { try { localStorage.setItem(seenKey(fixtureId), '1'); } catch { /* navigation privée */ } };

const byOrder = (a: Market, b: Market) => MARKET_ORDER.indexOf(a.id) - MARKET_ORDER.indexOf(b.id);
const score = (m: BetMatch) => `FoodBall ${m.goalsFor}–${m.goalsAgainst} ${m.opponent}`;
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`;

/** La bonne réponse d'un pari réglé. */
function answer(market: Market, match: BetMatch | null, crack: string[] | null): string | null {
  if (market.id === 'crack') return crack?.join(' & ') ?? null;
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
    explain={<>Les paris ne sont pas encore ouverts. <b>L’admin les ouvre dans le lobby</b>, juste avant le coup d’envoi : reste ici, l’écran
      passe tout seul à la phase 1.</>}
    now="On attend que tout le monde arrive dans le lobby." next="Phase 1 : tu fais tes pronos (10 secondes)."
    who={here} whoTitle={`Dans la salle · ${here.length}`} doneLabel="là">
    {last?.match && <p className="fb-note">Dernier FoodBet : {score(last.match)}{last.mySlips.length > 0
      && <> · <b className="fb-gain">{net > 0 ? '+' : ''}{fmt(net)} {CR}</b></>}</p>}
    <Bailout />
    <button type="button" className="fb-link" onClick={onBoard}>Voir le classement</button>
  </Room>;
}

/** Phase 1, pronos faits : on attend les autres et le coup d'envoi. */
function RoomPlayed({ onEdit }: { onEdit: () => void }) {
  const { state } = useContext(FoodBetCtx);
  const fixture = state!.fixture!;
  const who = state!.room.filter((r) => r.here || r.played || r.me).map((r) => ({ name: r.name, me: r.me, done: r.played }));
  const mine = [...fixture.mySlips].sort((a, b) => MARKET_ORDER.indexOf(a.market) - MARKET_ORDER.indexOf(b.market))
    .map((s) => `${MARKET_COPY[s.market].title} : ${optionLabel(fixture.markets, s)} (${fmt(s.stake)} → ${fmt(payout(s.stake, s.odds))} ${CR})`);
  return <Room phase={1} status={mine.length > 0 ? 'Tu as joué' : 'Rien parié'}
    explain={mine.length > 0 ? <>Tes pronos sont validés : <b>{mine.join(' · ')}</b>. Tu peux encore les changer jusqu’au coup d’envoi.</>
      : <>Tu as passé tous les paris de ce soir. Tu peux encore jouer jusqu’au coup d’envoi.</>}
    now="Les autres font leurs pronos." next="Phase 2 : l’admin lance le match, les paris ferment."
    who={who} whoTitle={`Pronos · ${who.filter((w) => w.done).length} sur ${who.length}`} doneLabel="✓ a joué" todoLabel="pas encore">
    <p className="fb-note">Ce que chacun a joué reste secret jusqu’au vote.</p>
    <button type="button" className="fb-link" onClick={onEdit}>{mine.length > 0 ? 'Changer mes paris' : 'Parier quand même'}</button>
  </Room>;
}

/** Phase 2 : le match se joue, rien à faire. */
function RoomMatch() {
  const { state } = useContext(FoodBetCtx);
  const fixture = state!.fixture!;
  const mine = [...fixture.mySlips].sort((a, b) => MARKET_ORDER.indexOf(a.market) - MARKET_ORDER.indexOf(b.market))
    .map((s) => optionLabel(fixture.markets, s));
  const who = state!.room.filter((r) => r.played).map((r) => ({ name: r.name, me: r.me, done: true }));
  return <Room phase={2} status="● En direct" live
    explain={mine.length > 0 ? <>Les paris sont fermés. <b>Rien à faire pendant le match</b> : joue, on s’occupe du reste.</>
      : <>Les paris ont fermé au coup d’envoi : <b>tu n’as pas parié ce soir</b>. Tu pourras quand même voter pour le joueur du match.</>}
    now={mine.length > 0 ? `FoodBall joue. Tes pronos : ${mine.join(' · ')}.` : 'FoodBall joue.'}
    next="Phase 3 : après le coup de sifflet, l’admin ouvre le vote pour le joueur du match."
    who={who} whoTitle={`Ont joué ce soir · ${who.length}`} doneLabel="✓ a joué" />;
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
        const right = m.id === 'crack' ? null : answer(m, vote.match, null);
        return <div key={m.id}>
          <p className="fb-note" style={{ marginTop: 6 }}>{MARKET_COPY[m.id].title} · {right ? <>réglé, c’était <b>{right}</b></> : m.id === 'crack' ? 'en attente du vote' : 'en attente du score EA'}</p>
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

function Choose({ market, index, total, onPlaced, onSkip, skipLabel }: {
  market: Market; index: number; total: number; onPlaced: () => void; onSkip: () => void; skipLabel: string;
}) {
  const { state } = useContext(FoodBetCtx);
  const current = state!.fixture!.mySlips.find((s) => s.market === market.id)?.option ?? null;
  const [pick, setPick] = useState<string | null>(null);
  const option = market.options.find((o) => o.id === pick);
  const players = market.id === 'crack' || market.id === 'flop' || market.id === 'scorer';
  const self = String(state!.myMemberId);
  const kicker = total > 1 ? `Pari ${index + 1} sur ${total} · ${MARKET_COPY[market.id].title}` : `Le pari du soir · ${MARKET_COPY[market.id].title}`;

  if (option) {
    return <Screen tone="blue" phase={1} status="À toi de jouer" sheet={<StakeSheet market={market} option={option} onPlaced={() => { setPick(null); onPlaced(); }} />}>
      <p className="fb-kick">Ton choix · {MARKET_COPY[market.id].title}</p>
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
    <button type="button" className="fb-link" onClick={onSkip}>{skipLabel}</button>
  </Screen>;
}

function OpenFlow({ state }: { state: BetsState }) {
  const fixture = state.fixture!;
  const markets = [...fixture.markets].sort(byOrder);
  const [skipped, setSkipped] = useState<MarketId[]>([]);
  const has = (m: Market) => fixture.mySlips.some((s) => s.market === m.id);
  const done = (m: Market) => has(m) || skipped.includes(m.id);
  const [editing, setEditing] = useState(false);
  const [index, setIndex] = useState(() => Math.max(0, markets.findIndex((m) => !has(m))));

  const next = () => {
    const after = markets.findIndex((m, i) => i > index && (editing || !done(m)));
    if (after < 0) setEditing(false); else setIndex(after);
  };
  if (markets.every(done) && !editing) return <RoomPlayed onEdit={() => { setSkipped([]); setEditing(true); setIndex(0); }} />;
  const market = markets[index] ?? markets[0];
  const skip = () => { if (!has(market)) setSkipped((list) => [...list, market.id]); next(); };
  return <Choose key={market.id} market={market} index={markets.indexOf(market)} total={markets.length}
    onPlaced={next} onSkip={skip} skipLabel={has(market) ? 'Garder mon choix' : 'Passer ce pari'} />;
}

// ---------------------------------------------------------------- Phase 3 · Le vote

function VoteScreen({ vote, onVoted }: { vote: BetsState['votes'][number]; onVoted: () => void }) {
  const { state } = useContext(FoodBetCtx);
  const play = useBetsPlay();
  const sheet = useMatchDetail(vote.match?.id ?? 0);
  const stats = new Map((sheet.data?.players ?? []).map((p) => [p.gamertag, p]));
  const crackSlip = vote.mySlips.find((s) => s.market === 'crack');
  return <Screen tone="ice" phase={3} status="À toi de voter">
    <p className="fb-kick">{vote.match ? `${score(vote.match)} · fin du match` : 'Fin du match · score EA en attente'}</p>
    <h2 className="fb-big">Ton<br />crack ?</h2>
    <p className="fb-note">Élis le <b>joueur du match</b> : celui qui a le plus pesé ce soir. Un seul vote, <b>pas pour toi-même</b>. Le joueur qui
      récolte le plus de voix devient le Crack, et c’est lui qui règle les paris « Qui va rouler ? ».</p>
    <p className="fb-note" style={{ fontSize: 14 }}>En gros sur chaque tuile : sa note EA sur ce match.{crackSlip && <> Ton pari : <b>{optionLabel(vote.markets, crackSlip)}</b>.</>}</p>
    <div className="fb-grid fb-push" role="radiogroup" aria-label="Le crack du match">
      {vote.candidates.map((c) => {
        const p = stats.get(c.gamertag);
        const self = c.memberId === state!.myMemberId;
        const line = p ? [p.goals && plural(p.goals, 'but'), p.assists && `${plural(p.assists, 'passe')} D`].filter(Boolean).join(' · ') : '';
        return <button key={c.memberId} type="button" role="radio" aria-checked={vote.myVotes.crack === c.memberId}
          className={`fb-player${vote.myVotes.crack === c.memberId ? ' is-on' : ''}`} disabled={self || play.isPending}
          onClick={() => play.mutate({ action: 'vote', fixtureId: vote.id, category: 'crack', memberId: c.memberId }, { onSuccess: onVoted })}>
          {p && <b>{frNum(p.rating, 1)}</b>}<strong>{self ? 'Toi' : c.gamertag}</strong>{line && <small>{line}</small>}
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
  const answers = [...item.markets].sort(byOrder).map((m) => [MARKET_COPY[m.id].title, answer(m, item.match, item.crack)] as const).filter(([, a]) => a);
  // Les votes du Crack, regroupés par joueur élu, le plus de voix en haut.
  const votes = [...new Set((item.ballots ?? []).map((b) => b.gamertag))]
    .map((gamertag) => ({ gamertag, voters: (item.ballots ?? []).filter((b) => b.gamertag === gamertag).map((b) => (b.me ? 'toi' : b.voter)) }))
    .sort((a, b) => b.voters.length - a.voters.length);
  return <Screen tone="blue" phase={4} status="Soirée terminée">
    {item.match && <p className="fb-kick">{score(item.match)}</p>}
    <h2 className="fb-big">{winners.length > 0 ? <>Ils ont<br />vu juste</> : <>Personne<br />n’a vu juste</>}</h2>
    <p className="fb-note">{winners.length > 0 ? <>Tout est réglé. Voici ceux qui ont gagné et ce qu’ils ont empoché (<b>mise × cote</b>). Les crédits sont
      déjà sur leur solde.</> : 'Tout est réglé : aucun prono n’est tombé juste sur ce match. Les mises sont perdues.'}</p>
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
  if (fixture?.status === 'open') return { action: { action: 'lock' }, label: 'Coup d’envoi', hint: 'passe en phase 2, ferme les paris' };
  if (fixture) return { action: { action: 'start-vote' }, label: 'Ouvrir le vote', hint: fixture.match ? 'passe en phase 3, score EA reçu'
    : 'passe en phase 3 sans attendre EA : le score se reliera dès qu’il arrive' };
  if (vote) return { action: { action: 'close-vote', fixtureId: vote.id }, label: 'Clore le vote et payer', hint: `phase 4 : désigne le Crack, verse les gains · ${plural(vote.voters, 'vote')}`
    + (vote.match ? '' : ' · sans score EA, le pari d’équipe est remboursé') };
  return { action: { action: 'open' }, label: 'Ouvrir les paris', hint: 'passe en phase 1, tire les paris du match' };
}

/** Guetter la fin du match : l'admin lance une vérification EA toutes les 20 s, pendant 30 min au plus. */
const WATCH_EVERY = 20_000;
const WATCH_FOR = 30 * 60_000;

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
      Guetter la fin du match <small>vérifie chez EA toutes les 20 s</small></button>;
  }
  return <p className="fb-adm-watch" role="status">
    <span>Vérification EA toutes les 20 s{last ? ` · dernière à ${last.toLocaleTimeString('fr-FR')}` : '…'}</span>
    <button type="button" className="fb-link" onClick={() => setSince(null)}>Arrêter</button>
  </p>;
}

/** Phase 2 côté admin : le score EA est-il arrivé ? Le téléphone vibre quand il tombe. */
function ScoreNotice({ match }: { match: BetMatch | null }) {
  const had = useRef(match !== null);
  useEffect(() => {
    if (match && !had.current) navigator.vibrate?.([120, 60, 120]);
    had.current = match !== null;
  }, [match]);
  return match ? <p className="fb-adm-score is-in" role="status"><b>✓ Score EA reçu</b><span>{score(match)} · tu peux ouvrir le vote</span></p>
    : <><p className="fb-adm-score" role="status"><b>Score EA en attente</b><span>Vérifié toutes les 5 min, et dès que tu ouvres le vote. Tu n’es pas obligé d’attendre.</span></p>
      <WatchScore /></>;
}

function AdminNext({ state }: { state: BetsState }) {
  const admin = useBetsAdmin();
  const step = nextStep(state);
  const target = state.fixture ?? state.votes[0];
  const cancel = () => target && window.confirm('Annuler cette soirée ? Toutes les mises seront remboursées.')
    && admin.mutate({ action: 'cancel', fixtureId: target.id });
  return <div className="fb-adm">
    <span className="fb-adm-tag">Admin · phase suivante</span>
    {state.fixture?.status === 'locked' && <ScoreNotice match={state.fixture.match} />}
    <button type="button" className="fb-btn fb-btn--sm fb-admin-go" style={{ background: 'var(--fc-abysse)', color: 'var(--fc-craie)' }}
      disabled={admin.isPending} onClick={() => admin.mutate(step.action)}>{admin.isPending ? 'Un instant…' : <>{step.label} <small>{step.hint}</small></>}</button>
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
      disabled={admin.isPending} onClick={() => run({ action: 'lock' })}>Coup d’envoi <small>passe en phase 2, ferme les paris</small></button>}
    {fixture?.status === 'locked' && <button type="button" className="fb-btn fb-btn--sm fb-admin-go" style={{ background: 'var(--fc-abysse)', color: 'var(--fc-craie)' }}
      disabled={admin.isPending} onClick={() => run({ action: 'start-vote' })}>Ouvrir le vote <small>{fixture.match ? `passe en phase 3 · ${score(fixture.match)}` : 'passe en phase 3 · score EA pas encore reçu'}</small></button>}
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
  if (fixture?.status === 'locked') return <RoomMatch />;
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
