import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import {
  CURRENCY, DEFAULT_STAKE, MARKET_COPY, MARKET_ORDER, STAKES, optionLabel, payout,
  type BetMatch, type BetsState, type BetPick, type Market, type MarketId,
} from '../../shared/bets';
import { useMe } from '../api/auth';
import { useBetsAdmin, useBetsPlay, useBetsState, useBetsStatus } from '../api/bets';
import { useMatchDetail } from '../api/queries';
import { SignInButton } from '../components/fc27/SignIn';
import { frNum } from '../lib/format';
import { usePageTitle } from '../lib/hooks';
import '../styles/foodbet.css';

// FoodBet : le pari du club, en plein écran façon stories. Une rencontre = le Crack du match
// (tranché par le vote), parfois un pari d'équipe en plus. Quatre étapes, un écran chacune :
// parier, attendre le match, voter, découvrir les gagnants. Les pronos des autres se
// dévoilent à chacun une fois son vote donné (drizzle/0021_foodbet.sql).

const CR = CURRENCY.short;
const STARTING_TEXT = `500 ${CURRENCY.name} offerts. Avant chaque match tu paries, après tu votes pour le joueur du match. Aucun argent réel.`;
const fmt = (n: number) => n.toLocaleString('fr-FR');

/** La question en gros, une par pari. */
const ASK: Record<MarketId, string> = {
  verdict: 'Qui gagne ?', goals: 'Combien de buts ?', crack: 'Qui va rouler ?', flop: 'La casserole ?',
  cleansheet: 'Zéro encaissé ?', red: 'Un rouge ?', ragequit: 'Ils lâchent ?',
};
/** Ce qu'on parie, en clair, sous la question. */
const EXPLAIN: Record<MarketId, ReactNode> = {
  verdict: <>Devine le résultat de <b>FoodBall</b> ce soir : victoire, nul ou défaite.</>,
  goals: <>Devine combien de buts <b>FoodBall</b> va marquer ce soir.</>,
  cleansheet: <>Devine si <b>FoodBall</b> va finir le match sans encaisser un seul but.</>,
  red: <>Devine si un joueur de <b>FoodBall</b> va prendre un carton rouge.</>,
  ragequit: <>Devine si l’adversaire va quitter le match avant la fin.</>,
  flop: <>Devine le joueur que le club désignera comme le moins bon du match.</>,
  crack: <>Parie sur le joueur qui sera élu <b>Crack du match</b>, le meilleur joueur de la soirée. C’est le club qui l’élit par un vote,
    juste après le match. Le favori rapporte peu, l’outsider rapporte gros.</>,
};
const ODDS_HINT = 'La cote, c’est ce que rapporte chaque crédit misé : plus elle est haute, plus c’est risqué… et plus ça paie.';

const seenKey = (fixtureId: number) => `bets.seen.${fixtureId}`;
const wasSeen = (fixtureId: number) => { try { return localStorage.getItem(seenKey(fixtureId)) === '1'; } catch { return true; } };
const markSeen = (fixtureId: number) => { try { localStorage.setItem(seenKey(fixtureId), '1'); } catch { /* navigation privée */ } };

const byOrder = (a: Market, b: Market) => MARKET_ORDER.indexOf(a.id) - MARKET_ORDER.indexOf(b.id);
const score = (m: BetMatch) => `FoodBall ${m.goalsFor}–${m.goalsAgainst} ${m.opponent}`;

/** La bonne réponse d'un pari réglé. */
function answer(market: Market, match: BetMatch | null, crack: string[] | null): string | null {
  if (market.id === 'crack') return crack?.join(' & ') ?? null;
  if (!match) return null;
  const id = market.id === 'verdict' ? match.result
    : market.id === 'goals' ? (match.goalsFor <= 1 ? '0-1' : match.goalsFor <= 3 ? '2-3' : '4+')
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

/** Un écran : barres d'étapes, marque, solde, croix ; le panneau admin remplace le panneau du bas. */
function Screen({ tone, step = 0, sheet, children }: { tone: 'blue' | 'night' | 'ice'; step?: number; sheet?: ReactNode; children: ReactNode }) {
  const { state, preview, adminOpen, setAdminOpen } = useContext(FoodBetCtx);
  return <section className={`fb-screen fb-screen--${tone}`}>
    <div className="fb-bars" aria-label={step ? `Étape ${step} sur 4` : undefined} aria-hidden={step ? undefined : true}>
      {[1, 2, 3, 4].map((i) => <i key={i} className={i <= step ? 'is-done' : undefined} />)}
    </div>
    <div className="fb-top">
      <span className="fb-mark">Food<span>Bet</span></span>
      {state?.isAdmin && <button type="button" className="fb-admin" aria-expanded={adminOpen} onClick={() => setAdminOpen(!adminOpen)}>Admin</button>}
      {state && <span className="fb-wallet" aria-label={`Solde : ${state.wallet.balance} ${CURRENCY.name}`}>
        {fmt(state.wallet.balance)} <small>{CR}</small>{state.wallet.bankrupt && <small> · prêt</small>}</span>}
      <Close />
    </div>
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

// ---------------------------------------------------------------- 1 · Parier

function Entry({ markets, reason, onStart }: { markets: Market[]; reason: string | null; onStart: () => void }) {
  return <Screen tone="night">
    <span className="fb-big" style={{ marginTop: 32, fontSize: 'clamp(76px, 24vw, 96px)' }}>Food<br /><em style={{ color: '#FFB547' }}>Bet</em></span>
    <p className="fb-kick" style={{ color: 'var(--fc-glacier)' }}>Ce soir : {markets.map((m) => MARKET_COPY[m.id].title).join(' + ')}</p>
    <p className="fb-note fb-note--lg">Le jeu de pronos du club, avec des <b>crédits virtuels</b> (aucun argent réel). <b>Avant le match</b>, tu paries.
      <b> Après</b>, tu votes pour le joueur du match. Puis on découvre qui avait vu juste.</p>
    {reason && <p className="fb-note">Les cotes tiennent compte de notre forme : {reason.charAt(0).toLowerCase() + reason.slice(1)}.</p>}
    <div className="fb-push" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <button type="button" className="fb-btn fb-btn--amber" onClick={onStart}>Je joue <b>10 s</b></button>
      <p className="fb-tap">Les paris ferment au coup d’envoi</p>
    </div>
  </Screen>;
}

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

function Choose({ market, index, total, onPlaced, onSkip }: {
  market: Market; index: number; total: number; onPlaced: () => void; onSkip: (() => void) | null;
}) {
  const { state } = useContext(FoodBetCtx);
  const current = state!.fixture!.mySlips.find((s) => s.market === market.id)?.option ?? null;
  const [pick, setPick] = useState<string | null>(null);
  const option = market.options.find((o) => o.id === pick);
  const players = market.id === 'crack' || market.id === 'flop';
  const kicker = total > 1 ? `Pari ${index + 1} sur ${total} · ${MARKET_COPY[market.id].title}` : `Le pari du soir · ${MARKET_COPY[market.id].title}`;

  if (option) {
    return <Screen tone="blue" step={1} sheet={<StakeSheet market={market} option={option} onPlaced={() => { setPick(null); onPlaced(); }} />}>
      <p className="fb-kick">Ton choix · {MARKET_COPY[market.id].title}</p>
      <h2 className="fb-big fb-big--md">{option.label}<br /><em>×{frNum(option.odds, 2)}</em></h2>
      <button type="button" className="fb-link fb-link--start" onClick={() => setPick(null)}>Changer de réponse</button>
    </Screen>;
  }
  return <Screen tone="blue" step={1}>
    <p className="fb-kick">{kicker}</p>
    <h2 className="fb-big">{ASK[market.id]}</h2>
    <p className="fb-note">{EXPLAIN[market.id]}{players ? '' : ` ${ODDS_HINT}`}</p>
    {market.options.some((o) => o.trend && Math.abs(o.trend) >= 0.05) && <p className="fb-note" style={{ fontSize: 14 }}>▲ cote en hausse depuis le dernier match · ▼ en baisse</p>}
    {players ? (
      <div className="fb-grid fb-push" role="radiogroup" aria-label={ASK[market.id]}>
        {market.options.map((o) => <button key={o.id} type="button" role="radio" aria-checked={current === o.id}
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
    {onSkip ? <button type="button" className="fb-link" onClick={onSkip}>Garder mon choix</button>
      : <p className="fb-tap">{players ? 'Touche un joueur · puis ta mise' : 'Touche ta réponse'}</p>}
  </Screen>;
}

function Placed({ onEdit }: { onEdit: () => void }) {
  const { state } = useContext(FoodBetCtx);
  const fixture = state!.fixture!;
  return <Screen tone="blue" step={1}>
    <svg className="fb-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5" /></svg>
    <h2 className="fb-big">C’est<br />joué</h2>
    <p className="fb-note">Tes pronos sont enregistrés. Tu peux les <b>changer jusqu’au coup d’envoi</b>. Ceux des autres restent secrets
      jusqu’à ce que tu votes, après le match.</p>
    <div className="fb-rows">
      {[...fixture.mySlips].sort((a, b) => MARKET_ORDER.indexOf(a.market) - MARKET_ORDER.indexOf(b.market)).map((s) =>
        <div key={s.id} className="fb-slip"><span>{optionLabel(fixture.markets, s)} ×{frNum(s.odds, 2)} · {fmt(s.stake)} {CR}</span>
          <b className="fb-gain">{fmt(payout(s.stake, s.odds))} {CR}</b></div>)}
    </div>
    <div className="fb-push" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p className="fb-note">{fixture.bettors} joueur{fixture.bettors > 1 ? 's ont' : ' a'} joué ce soir.</p>
      <button type="button" className="fb-link" onClick={onEdit}>Changer mon pari</button>
    </div>
  </Screen>;
}

function OpenFlow({ state }: { state: BetsState }) {
  const fixture = state.fixture!;
  const markets = [...fixture.markets].sort(byOrder);
  const has = (m: Market) => fixture.mySlips.some((s) => s.market === m.id);
  const [started, setStarted] = useState(fixture.mySlips.length > 0);
  const [editing, setEditing] = useState(false);
  const [index, setIndex] = useState(() => Math.max(0, markets.findIndex((m) => !has(m))));
  const reason = fixture.context?.reason ?? null;

  if (!started) return <Entry markets={markets} reason={reason} onStart={() => setStarted(true)} />;
  const next = () => {
    const after = markets.findIndex((m, i) => i > index && (editing || !has(m)));
    if (after < 0) setEditing(false); else setIndex(after);
  };
  if (markets.every(has) && !editing) return <Placed onEdit={() => { setEditing(true); setIndex(0); }} />;
  const market = markets[index] ?? markets[0];
  return <Choose key={market.id} market={market} index={markets.indexOf(market)} total={markets.length}
    onPlaced={next} onSkip={editing && has(market) ? next : null} />;
}

// ---------------------------------------------------------------- 2 · Le match

function Live() {
  const { state } = useContext(FoodBetCtx);
  const fixture = state!.fixture!;
  const slips = [...fixture.mySlips].sort((a, b) => MARKET_ORDER.indexOf(a.market) - MARKET_ORDER.indexOf(b.market));
  return <Screen tone="night" step={2}>
    <p className="fb-kick fb-kick--live">● Match en cours · paris fermés</p>
    <h2 className="fb-big">Tu as dit<br /><em>{optionLabel(fixture.markets, slips[0])}</em></h2>
    <p className="fb-note">Les paris sont fermés le temps du match. <b>Rien à faire</b> : le score arrive tout seul depuis EA quelques minutes
      après le coup de sifflet, et les paris d’équipe se règlent automatiquement.</p>
    <div className="fb-rows">
      {slips.map((s) => <div key={s.id} className="fb-slip"><span>{MARKET_COPY[s.market].title} · {fmt(s.stake)} {CR}</span>
        <b className="fb-gain">{fmt(payout(s.stake, s.odds))} {CR}</b></div>)}
    </div>
    <p className="fb-note fb-push">Le Crack, lui, attend le vote du club après le match.</p>
    <p className="fb-tap">On te rappelle pour le vote</p>
  </Screen>;
}

function TooLate() {
  const { state } = useContext(FoodBetCtx);
  return <Screen tone="night" step={2}>
    <p className="fb-kick fb-kick--live">● Match en cours · paris fermés</p>
    <h2 className="fb-big">Trop<br />tard</h2>
    <p className="fb-note fb-note--lg">Les paris ferment au <b>coup d’envoi</b> : tu ne peux plus parier sur ce match. Mais tu pourras quand même
      <b> voter pour le joueur du match</b> dès la fin de la rencontre.</p>
    <p className="fb-note fb-push">{state!.fixture!.bettors} joueur{state!.fixture!.bettors > 1 ? 's ont' : ' a'} joué ce soir. Leurs pronos se dévoilent après ton vote.</p>
    <p className="fb-tap">On te rappelle pour le vote</p>
  </Screen>;
}

// ---------------------------------------------------------------- 3 · Le vote

function VoteScreen({ vote, onVoted }: { vote: BetsState['votes'][number]; onVoted: () => void }) {
  const { state } = useContext(FoodBetCtx);
  const play = useBetsPlay();
  const sheet = useMatchDetail(vote.match.id);
  const stats = new Map((sheet.data?.players ?? []).map((p) => [p.gamertag, p]));
  const crackSlip = vote.mySlips.find((s) => s.market === 'crack');
  return <Screen tone="ice" step={3}>
    <p className="fb-kick">{score(vote.match)} · fin du match</p>
    <h2 className="fb-big">Ton<br />crack ?</h2>
    <p className="fb-note">Élis le <b>joueur du match</b> : celui qui a le plus pesé ce soir. Un seul vote, <b>pas pour toi-même</b>. Le joueur qui
      récolte le plus de voix devient le Crack, et c’est lui qui règle les paris « Qui va rouler ? ».</p>
    <p className="fb-note" style={{ fontSize: 14 }}>En gros sur chaque tuile : sa note EA sur ce match.{crackSlip && <> Ton pari : <b>{optionLabel(vote.markets, crackSlip)}</b>.</>}</p>
    <div className="fb-grid fb-push" role="radiogroup" aria-label="Le crack du match">
      {vote.candidates.map((c) => {
        const p = stats.get(c.gamertag);
        const self = c.memberId === state!.myMemberId;
        const line = p ? [p.goals && `${p.goals} but${p.goals > 1 ? 's' : ''}`, p.assists && `${p.assists} passe${p.assists > 1 ? 's' : ''} D`].filter(Boolean).join(' · ') : '';
        return <button key={c.memberId} type="button" role="radio" aria-checked={vote.myVotes.crack === c.memberId}
          className={`fb-player${vote.myVotes.crack === c.memberId ? ' is-on' : ''}`} disabled={self || play.isPending}
          onClick={() => play.mutate({ action: 'vote', fixtureId: vote.id, category: 'crack', memberId: c.memberId }, { onSuccess: onVoted })}>
          {p && <b>{frNum(p.rating, 1)}</b>}<strong>{self ? 'Toi' : c.gamertag}</strong>{line && <small>{line}</small>}
        </button>;
      })}
    </div>
    {play.isError && <p className="fb-error" role="alert">{play.error.message}</p>}
    <p className="fb-tap">{vote.voters} vote{vote.voters > 1 ? 's' : ''} · touche un joueur</p>
  </Screen>;
}

/** Après son vote : les pronos du club se dévoilent, en attendant la clôture. */
function Revealed({ vote, onChange }: { vote: BetsState['votes'][number]; onChange: () => void }) {
  const picks = vote.picks ?? [];
  const leader = Object.entries(vote.tally.crack).sort((a, b) => b[1] - a[1])[0];
  const leaderName = leader && vote.candidates.find((c) => String(c.memberId) === leader[0])?.gamertag;
  return <Screen tone="night" step={3}>
    <p className="fb-kick">{score(vote.match)}</p>
    <h2 className="fb-big fb-big--md">Le club<br />a joué</h2>
    <p className="fb-note">Ton vote est pris en compte. Tu vois maintenant <b>ce que chacun avait parié</b>. Le Crack devient officiel quand
      l’admin clôt le vote : les gains tombent à ce moment-là.</p>
    {picks.length === 0 && <p className="fb-note">Personne n’a parié sur ce match.</p>}
    {[...vote.markets].sort(byOrder).map((m) => {
      const groups = m.options.map((o) => ({ o, names: picks.filter((p) => p.market === m.id && p.option === o.id).map((p) => (p.me ? 'Toi' : p.name)) }))
        .filter((g) => g.names.length > 0);
      if (groups.length === 0) return null;
      const right = m.id === 'crack' ? null : answer(m, vote.match, null);
      return <div key={m.id}>
        <p className="fb-kick">{MARKET_COPY[m.id].title} · {right ? `réglé, c’était ${right}` : 'en attente du vote'}</p>
        <div className="fb-rows">{groups.map((g) => <div key={g.o.id} className="fb-pick"><b>{g.o.label} · {g.names.length}</b><span>{g.names.join(', ')}</span></div>)}</div>
      </div>;
    })}
    <div className="fb-push" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {leaderName && <p className="fb-note">Crack en tête du vote : <b>{leaderName}</b> ({leader[1]} vote{leader[1] > 1 ? 's' : ''} sur {vote.voters})</p>}
      <button type="button" className="fb-link" onClick={onChange}>Changer mon vote</button>
    </div>
  </Screen>;
}

function VoteFlow({ vote }: { vote: BetsState['votes'][number] }) {
  const [changing, setChanging] = useState(false);
  if (vote.myVotes.crack === null || changing) return <VoteScreen vote={vote} onVoted={() => setChanging(false)} />;
  return <Revealed vote={vote} onChange={() => setChanging(true)} />;
}

// ---------------------------------------------------------------- 4 · Les gagnants

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
  return <Screen tone="blue" step={4}>
    {item.match && <p className="fb-kick">{score(item.match)}</p>}
    <h2 className="fb-big">{winners.length > 0 ? <>Ils ont<br />vu juste</> : <>Personne<br />n’a vu juste</>}</h2>
    <p className="fb-note">{winners.length > 0 ? <>Tout est réglé. Voici ceux qui ont gagné et ce qu’ils ont empoché (<b>mise × cote</b>). Les crédits sont
      déjà sur leur solde.</> : 'Tout est réglé : aucun prono n’est tombé juste sur ce match. Les mises sont perdues.'}</p>
    <div className="fb-rows">
      {winners.map((w) => <div key={w.name} className={`fb-row${w.me ? ' is-me' : ''}`}><strong>{w.me ? 'Toi' : w.name}</strong><b>+{fmt(w.won)}</b></div>)}
    </div>
    <div className="fb-push" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {answers.map(([title, a]) => <p key={title} className="fb-note">{title} : <b>{a}</b></p>)}
      {losers.length > 0 && <p className="fb-note">Raté : {losers.map((l) => `${l.me ? 'toi' : l.name} (${fmt(l.net)})`).join(', ')}</p>}
      {item.mySlips.length > 0 && <p className="fb-note fb-note--lg">Ton bilan : <b className="fb-gain">{mine > 0 ? '+' : ''}{fmt(mine)} {CR}</b></p>}
      <button type="button" className="fb-btn fb-btn--solid fb-btn--center" onClick={onDone}>Continuer</button>
      <button type="button" className="fb-link" onClick={() => { onDone(); onBoard(); }}>Voir le classement</button>
    </div>
  </Screen>;
}

// ---------------------------------------------------------------- Classement, attente, admin

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

function Idle({ onBoard }: { onBoard: () => void }) {
  const { state } = useContext(FoodBetCtx);
  const last = state!.history.find((h) => h.status === 'settled');
  const net = last ? last.mySlips.reduce((sum, s) => sum + (s.payout ?? 0) - s.stake, 0) : 0;
  return <Screen tone="night">
    <h2 className="fb-big" style={{ marginTop: 24 }}>Pas de<br />match<br /><em>en vue</em></h2>
    <p className="fb-note fb-note--lg">Aucun pari en cours. Le prochain FoodBet s’ouvre <b>dans le lobby, juste avant le coup d’envoi</b> :
      un bandeau te prévient sur l’accueil de l’app.</p>
    <div className="fb-push" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {last?.match && <>
        <p className="fb-kick">Dernier FoodBet</p>
        <p className="fb-note fb-note--lg">{score(last.match)}{last.mySlips.length > 0 && <> · <b className="fb-gain">{net > 0 ? '+' : ''}{fmt(net)} {CR}</b></>}</p>
      </>}
      <Bailout />
      <button type="button" className="fb-btn fb-btn--solid fb-btn--center" onClick={onBoard}>Voir le classement</button>
    </div>
  </Screen>;
}

function AdminSheet({ state }: { state: BetsState }) {
  const admin = useBetsAdmin();
  const { setAdminOpen } = useContext(FoodBetCtx);
  const fixture = state.fixture;
  const vote = state.votes[0];
  const target = fixture ?? vote;
  const run = (action: Parameters<typeof admin.mutate>[0]) => admin.mutate(action, { onSuccess: () => setAdminOpen(false) });
  const cancel = () => target && window.confirm('Annuler cette rencontre ? Toutes les mises seront remboursées.') && run({ action: 'cancel', fixtureId: target.id });
  return <div className="fb-sheet">
    <span className="fb-sheet-title">Commandes admin</span>
    <p className="fb-note" style={{ color: 'var(--fc-ardoise)', opacity: 1, fontSize: 14 }}>Visible des admins seulement. Les autres joueurs ne voient jamais ce panneau.</p>
    {!fixture && <button type="button" className="fb-btn fb-btn--sm fb-admin-go" style={{ background: 'var(--fc-abysse)', color: 'var(--fc-craie)' }}
      disabled={admin.isPending} onClick={() => run({ action: 'open' })}>Ouvrir le prochain <small>{vote ? 'clôt le vote en cours et tire les paris' : 'tire les paris du match suivant'}</small></button>}
    {fixture?.status === 'open' && <button type="button" className="fb-btn fb-btn--sm fb-admin-go" style={{ background: 'var(--fc-abysse)', color: 'var(--fc-craie)' }}
      disabled={admin.isPending} onClick={() => run({ action: 'lock' })}>Coup d’envoi <small>ferme les paris au lancement</small></button>}
    {fixture?.status === 'locked' && <p className="fb-tap">Paris fermés. Le match se relie tout seul dès qu’EA le publie.</p>}
    {vote && !fixture && <button type="button" className="fb-btn fb-btn--sm fb-btn--light fb-admin-go" disabled={admin.isPending}
      onClick={() => run({ action: 'close-vote', fixtureId: vote.id })}>Clore le vote et payer <small>désigne le Crack, verse les gains · {vote.voters} vote{vote.voters > 1 ? 's' : ''}</small></button>}
    {target && <button type="button" className="fb-btn fb-btn--sm fb-btn--danger fb-admin-go" disabled={admin.isPending} onClick={cancel}>
      Annuler la rencontre <small>rembourse toutes les mises</small></button>}
    {admin.isError && <p className="fb-error" role="alert">{admin.error.message}</p>}
    <button type="button" className="fb-link" onClick={() => setAdminOpen(false)}>Fermer</button>
  </div>;
}

function Evening({ state }: { state: BetsState }) {
  const [board, setBoard] = useState(false);
  // Ne sert qu'à redessiner après « Continuer » : le « déjà vu » vit dans localStorage.
  const [, setSeen] = useState(0);
  const reveal = state.history.find((h) => h.status === 'settled' && Date.now() - new Date(h.settledAt).getTime() < 48 * 3_600_000
    && !wasSeen(h.id) && (h.mySlips.length > 0 || h.myVote !== null));
  const fixture = state.fixture;
  const vote = state.votes[0];

  if (board) return <Board onBack={() => setBoard(false)} />;
  if (reveal) return <Winners key={`w${reveal.id}`} item={reveal} onBoard={() => setBoard(true)} onDone={() => { markSeen(reveal.id); setSeen((n) => n + 1); }} />;
  if (fixture?.status === 'open') return <OpenFlow key={`o${fixture.id}`} state={state} />;
  if (fixture?.status === 'locked') return fixture.mySlips.length > 0 ? <Live /> : <TooLate />;
  if (vote) return <VoteFlow key={`v${vote.id}`} vote={vote} />;
  return <Idle onBoard={() => setBoard(true)} />;
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
