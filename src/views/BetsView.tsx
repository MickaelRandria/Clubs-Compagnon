import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  CURRENCY, DEFAULT_STAKE, MARKET_COPY, STAKES, optionLabel, payout,
  type BetMatch, type BetsState, type Market, type MarketOption, type Slip,
} from '../../shared/bets';
import { useMe } from '../api/auth';
import { useBetsAdmin, useBetsPlay, useBetsState, useBetsStatus } from '../api/bets';
import { SignInButton } from '../components/fc27/SignIn';
import { DataGate } from '../components/ui/DataGate';
import { Skeleton } from '../components/ui/Skeleton';
import { usePageTitle } from '../lib/hooks';
import '../styles/bets.css';

// Vestiaire Bets : un seul pari par match, le même pour tout le monde, tiré au sort à
// l'ouverture. L'écran ne montre qu'une chose à la fois — la « scène » : parier, attendre
// le match, voter (Crack / Casserole seulement), découvrir le résultat. Historique et
// classement restent dans un volet replié. Règles et argent : drizzle/0017 + 0018.

const CR = CURRENCY.short;

function Coin() { return <i className="bets-coin" aria-hidden="true" />; }

const seenKey = (fixtureId: number) => `bets.seen.${fixtureId}`;
const wasSeen = (fixtureId: number) => { try { return localStorage.getItem(seenKey(fixtureId)) === '1'; } catch { return true; } };
const markSeen = (fixtureId: number) => { try { localStorage.setItem(seenKey(fixtureId), '1'); } catch { /* navigation privée */ } };

function Locked() {
  return <div className="bets bets--locked">
    <p className="fc27-tag">Bientôt</p>
    <h1 className="bets-title">Vestiaire <span>Bets</span></h1>
    <p className="bets-lead">Les paris d’avant-match ouvriront bientôt. Reviens avant la prochaine session.</p>
    <Link className="bets-back" to="/">← Retour au dashboard</Link>
  </div>;
}

function SignInCard() {
  return <div className="bets bets--locked">
    <p className="fc27-tag">Vestiaire Bets</p>
    <h1 className="bets-title">Un match, <span>un pari</span></h1>
    <p className="bets-lead">Connecte-toi avec Discord : tu reçois <b>500 {CURRENCY.name}</b> et, avant chaque match, un pari tiré au sort pour tout le vestiaire. Aucun argent réel.</p>
    <SignInButton className="bets-signin" />
  </div>;
}

/** ▲ la cote monte (moins probable depuis le dernier match), ▼ elle baisse. */
function Trend({ value }: { value?: number }) {
  if (!value || Math.abs(value) < 0.05) return <span className="bets-trend bets-trend--flat" aria-hidden="true">=</span>;
  return <span className={`bets-trend ${value > 0 ? 'bets-trend--up' : 'bets-trend--down'}`} title="Effet du dernier match">
    {value > 0 ? '▲' : '▼'} {Math.abs(value).toFixed(2)}
  </span>;
}

/** La bonne réponse d'un pari réglé, quand le score suffit à la retrouver. */
function answer(market: Market, match: BetMatch | null, crack: string[] | null, flop: string[] | null): string | null {
  if (market.id === 'crack') return crack?.join(' & ') ?? null;
  if (market.id === 'flop') return flop?.join(' & ') ?? null;
  if (!match) return null;
  const id = market.id === 'verdict' ? match.result
    : market.id === 'goals' ? (match.goalsFor <= 1 ? '0-1' : match.goalsFor <= 3 ? '2-3' : '4+')
    : market.id === 'cleansheet' ? (match.goalsAgainst === 0 ? 'oui' : 'non') : null;
  return market.options.find((o) => o.id === id)?.label ?? null;
}

// ---------------------------------------------------------------- Scènes

function OpenStage({ state, onPlaced }: { state: BetsState; onPlaced: () => void }) {
  const fixture = state.fixture!;
  const market = fixture.markets[0];
  const copy = MARKET_COPY[market.id];
  const slip = fixture.mySlips.find((s) => s.market === market.id);
  const play = useBetsPlay();
  const [pick, setPick] = useState<string | null>(slip?.option ?? null);
  const [stakeChoice, setStakeChoice] = useState<number | 'max'>(slip?.stake ?? DEFAULT_STAKE);
  const available = state.wallet.balance + (slip?.stake ?? 0);
  const stake = stakeChoice === 'max' ? available : stakeChoice;
  const option = market.options.find((o) => o.id === pick);
  const ok = option !== undefined && stake > 0 && stake <= available;
  const players = market.options.length > 3;

  const place = () => option && play.mutate(
    { action: 'place', fixtureId: fixture.id, bets: [{ market: market.id, option: option.id, stake }] },
    { onSuccess: onPlaced },
  );

  return <section className={`bets-stage bets-stage--open${market.id === 'flop' ? ' bets-stage--flop' : ''}`} aria-labelledby="bets-question">
    <p className="bets-stage-kicker">Le pari du match · le même pour tout le vestiaire</p>
    <span className="bets-stage-emoji" aria-hidden="true">{copy.emoji}</span>
    <h2 className="bets-stage-title">{copy.title}</h2>
    <p id="bets-question" className="bets-stage-question">{copy.question}</p>
    {fixture.context?.reason && <p className="bets-context">📈 {fixture.context.reason} : les cotes bougent.</p>}

    <div className={`bets-choices${players ? ' bets-choices--players' : ''}`} role="radiogroup" aria-label={copy.question}>
      {market.options.map((o: MarketOption, i) => <button key={o.id} type="button" role="radio" aria-checked={pick === o.id}
        className="bets-choice" style={{ animationDelay: `${120 + i * 50}ms` }} onClick={() => setPick(o.id)}>
        <span className="bets-choice-label">{o.label}</span>
        <span className="bets-choice-odds"><b>×{o.odds.toFixed(2)}</b><Trend value={o.trend} /></span>
      </button>)}
    </div>

    <div className="bets-stake" role="group" aria-label="Ta mise">
      {[...STAKES, 'max' as const].map((s) => <button key={s} type="button" aria-pressed={stakeChoice === s}
        disabled={s !== 'max' && s > available} onClick={() => setStakeChoice(s)}>{s === 'max' ? `Tapis ${available}` : s}</button>)}
    </div>
    <button type="button" className={`bets-go${ok ? ' is-ready' : ''}`} disabled={!ok || play.isPending} onClick={place}>
      {play.isPending ? 'On mise…' : !option ? 'Choisis ta réponse'
        : stake > available ? 'Solde insuffisant'
        : <>Parier {stake} {CR} <span>→ {payout(stake, option.odds)} {CR}</span></>}
    </button>
    {play.isError && <p className="bets-error" role="alert">{play.error.message}</p>}
    <p className="bets-stage-foot">{fixture.bettors} parieur{fixture.bettors > 1 ? 's' : ''} dans le vestiaire · modifiable jusqu’au coup d’envoi</p>
  </section>;
}

function PlacedStage({ state, onEdit, fresh }: { state: BetsState; onEdit: () => void; fresh: boolean }) {
  const fixture = state.fixture!;
  const market = fixture.markets[0];
  const slip = fixture.mySlips.find((s) => s.market === market.id)!;
  return <section className="bets-stage bets-stage--placed" aria-live="polite">
    {fresh && <div className="bets-burst" aria-hidden="true">{Array.from({ length: 8 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</div>}
    <span className="bets-stage-check" aria-hidden="true">✓</span>
    <h2 className="bets-stage-title">C’est joué !</h2>
    <p className="bets-stage-question">{MARKET_COPY[market.id].title} : <b>{optionLabel(fixture.markets, slip)}</b></p>
    <p className="bets-gain"><span>{slip.stake} {CR}</span> → <b>{payout(slip.stake, slip.odds)} {CR}</b> si tu as vu juste</p>
    <button type="button" className="bets-link" onClick={onEdit}>Changer mon pari</button>
    <p className="bets-stage-foot">Les paris ferment au coup d’envoi. {fixture.bettors} parieur{fixture.bettors > 1 ? 's' : ''} pour l’instant.</p>
  </section>;
}

function LiveStage({ state }: { state: BetsState }) {
  const fixture = state.fixture!;
  const slip = fixture.mySlips[0];
  return <section className="bets-stage bets-stage--live">
    <span className="bets-live-dot" aria-hidden="true" />
    <h2 className="bets-stage-title">Match en cours</h2>
    <p className="bets-stage-question">{slip
      ? <>Ton pari : <b>{optionLabel(fixture.markets, slip)}</b> · {slip.stake} → {payout(slip.stake, slip.odds)} {CR}</>
      : 'Tu n’as pas parié sur ce match. Rendez-vous au prochain !'}</p>
    <p className="bets-stage-foot">Le résultat tombe tout seul quelques minutes après le coup de sifflet, quand EA publie le match.</p>
  </section>;
}

function VoteStage({ vote, state }: { vote: BetsState['votes'][number]; state: BetsState }) {
  const play = useBetsPlay();
  const admin = useBetsAdmin();
  const category = vote.markets.some((m) => m.id === 'flop') && !vote.markets.some((m) => m.id === 'crack') ? 'flop' : 'crack';
  const counts = vote.tally[category];
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const slip = vote.mySlips[0];
  return <section className={`bets-stage bets-stage--vote${category === 'flop' ? ' bets-stage--flop' : ''}`}>
    <p className="bets-stage-kicker">FoodBall {vote.match.goalsFor} – {vote.match.goalsAgainst} {vote.match.opponent}</p>
    <span className="bets-stage-emoji" aria-hidden="true">{MARKET_COPY[category].emoji}</span>
    <h2 className="bets-stage-title">{category === 'crack' ? 'Qui est le Crack ?' : 'Qui mérite la Casserole ?'}</h2>
    <p className="bets-stage-question">Le vote du vestiaire tranche le pari{slip ? <> · ton pari : <b>{optionLabel(vote.markets, slip)}</b></> : ''}.</p>
    <ul className="bets-vote-list">
      {vote.candidates.map((c) => {
        const share = total ? Math.round(((counts[c.memberId] ?? 0) / total) * 100) : 0;
        const self = c.memberId === state.myMemberId;
        return <li key={c.memberId}>
          <button type="button" aria-pressed={vote.myVotes[category] === c.memberId} disabled={self || play.isPending}
            title={self ? 'Interdit de voter pour soi' : undefined}
            onClick={() => play.mutate({ action: 'vote', fixtureId: vote.id, category, memberId: c.memberId })}>
            <span className="bets-vote-name">{c.gamertag}{self && <em> · toi</em>}</span>
            <span className="bets-vote-bar"><i style={{ width: `${share}%` }} /></span>
            <b>{share}%</b>
          </button>
        </li>;
      })}
    </ul>
    {play.isError && <p className="bets-error" role="alert">{play.error.message}</p>}
    {state.isAdmin && <button type="button" className="bets-admin-close" disabled={admin.isPending}
      onClick={() => admin.mutate({ action: 'close-vote', fixtureId: vote.id })}>Clore le vote et payer <small>(admin)</small></button>}
  </section>;
}

function RevealStage({ item, onDone }: { item: BetsState['history'][number]; onDone: () => void }) {
  const slip = item.mySlips[0];
  const market = item.markets.find((m) => m.id === slip.market) ?? item.markets[0];
  const right = answer(market, item.match, item.crack, item.flop);
  const won = slip.status === 'won';
  return <section className={`bets-stage bets-stage--reveal is-${slip.status}`} aria-live="polite">
    {won && <div className="bets-burst" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}</div>}
    {item.match && <p className="bets-stage-kicker">FoodBall {item.match.goalsFor} – {item.match.goalsAgainst} {item.match.opponent}</p>}
    <h2 className="bets-stage-title">{won ? 'Gagné !' : slip.status === 'lost' ? 'Raté…' : 'Remboursé'}</h2>
    <p className="bets-reveal-amount">{won ? `+${slip.payout} ${CR}` : slip.status === 'lost' ? `−${slip.stake} ${CR}` : `${slip.stake} ${CR} rendus`}</p>
    <p className="bets-stage-question">{MARKET_COPY[market.id].title} · tu avais dit <b>{optionLabel(item.markets, slip)}</b>
      {right && !won && <>, c’était <b>{right}</b></>}.</p>
    <button type="button" className="bets-go is-ready" onClick={onDone}>Continuer</button>
  </section>;
}

function IdleStage({ state }: { state: BetsState }) {
  const last = state.history[0];
  return <section className="bets-stage bets-stage--idle">
    <span className="bets-stage-emoji" aria-hidden="true">⏳</span>
    <h2 className="bets-stage-title">Prochain pari au prochain match</h2>
    <p className="bets-stage-question">Il s’ouvre dans le lobby, juste avant le coup d’envoi. Un pari, tiré au sort, pour tout le vestiaire : ça prend 10 secondes.</p>
    {last?.match && <p className="bets-stage-foot">Dernier match : FoodBall {last.match.goalsFor} – {last.match.goalsAgainst} {last.match.opponent}</p>}
  </section>;
}

// ---------------------------------------------------------------- Le reste, replié

function AdminBar({ state }: { state: BetsState }) {
  const admin = useBetsAdmin();
  const fixture = state.fixture;
  const drawn = fixture?.markets.length === 1 ? MARKET_COPY[fixture.markets[0].id].title : null;
  const cancel = () => fixture && window.confirm('Annuler cette rencontre ? Toutes les mises seront remboursées.')
    && admin.mutate({ action: 'cancel', fixtureId: fixture.id });
  return <section className="bets-admin" aria-label="Commandes de l’admin">
    <p className="bets-admin-tag">Admin{drawn && ` · pari tiré : ${drawn}`}</p>
    {!fixture && <button type="button" className="bets-admin-go" disabled={admin.isPending} onClick={() => admin.mutate({ action: 'open' })}>
      🎲 Ouvrir le pari du prochain match</button>}
    {fixture?.status === 'open' && <button type="button" className="bets-admin-go bets-admin-go--kickoff" disabled={admin.isPending}
      onClick={() => admin.mutate({ action: 'lock' })}>Coup d’envoi · fermer les paris</button>}
    {fixture?.status === 'locked' && <p className="bets-hint">Paris fermés. Le match sera relié tout seul dès qu’EA le publie.</p>}
    {fixture && <button type="button" className="bets-admin-cancel" disabled={admin.isPending} onClick={cancel}>Annuler la rencontre</button>}
    {admin.isError && <p className="bets-error" role="alert">{admin.error.message}</p>}
  </section>;
}

function SlipLine({ slip, markets }: { slip: Slip; markets: Market[] }) {
  const result = slip.status === 'won' ? <b>+{slip.payout} {CR}</b>
    : slip.status === 'lost' ? <b>−{slip.stake} {CR}</b>
    : slip.status === 'refunded' ? <b>remboursé</b>
    : <b>{slip.stake} → {payout(slip.stake, slip.odds)} {CR}</b>;
  return <li className={`is-${slip.status}`}>
    <span>{MARKET_COPY[slip.market].emoji} {MARKET_COPY[slip.market].title} · <strong>{optionLabel(markets, slip)}</strong> <em>×{Number(slip.odds).toFixed(2)}</em></span>
    {result}
  </li>;
}

function Drawer({ state }: { state: BetsState }) {
  return <details className="bets-drawer">
    <summary>Classement & mes paris <span aria-hidden="true">▾</span></summary>
    <div className="bets-drawer-body">
      <section className="bets-board" aria-labelledby="bets-board-title">
        <h3 id="bets-board-title">👑 Le classement</h3>
        <ol>{state.leaderboard.map((row, i) => <li key={row.accountId} className={row.me ? 'is-me' : undefined}>
          <span>{i + 1}</span><strong>{row.name}{row.me && ' (toi)'}</strong><b>{row.balance} {CR}</b>
        </li>)}</ol>
      </section>
      {state.history.length > 0 && <section className="bets-history" aria-labelledby="bets-history-title">
        <h3 id="bets-history-title">Mes derniers paris</h3>
        {state.history.map((h) => <div key={h.id} className="bets-history-item">
          <p>{h.match ? <>vs {h.match.opponent} <b>{h.match.goalsFor}–{h.match.goalsAgainst}</b></> : 'Rencontre annulée'}</p>
          <ul className="bets-slip">{h.mySlips.map((s) => <SlipLine key={s.id} slip={s} markets={h.markets} />)}</ul>
        </div>)}
      </section>}
    </div>
  </details>;
}

function Evening({ state, preview }: { state: BetsState; preview: boolean }) {
  const play = useBetsPlay();
  const fixture = state.fixture;
  const [editing, setEditing] = useState(false);
  const [fresh, setFresh] = useState(false);
  // Ne sert qu'à redessiner la scène après « Continuer » : le « déjà vu » vit dans localStorage.
  const [, setSeen] = useState(0);
  useEffect(() => { setEditing(false); }, [fixture?.id, fixture?.status]);

  // Résultat pas encore vu : il passe avant tout le reste, même avant le pari suivant.
  const reveal = state.history.find((h) => h.status === 'settled' && h.mySlips.length > 0
    && Date.now() - new Date(h.settledAt).getTime() < 48 * 3_600_000 && !wasSeen(h.id));
  const mySlip = fixture?.mySlips[0];
  const vote = state.votes[0];

  const stage = reveal ? <RevealStage key={`r${reveal.id}`} item={reveal} onDone={() => { markSeen(reveal.id); setSeen((n) => n + 1); }} />
    : fixture?.status === 'open' && (!mySlip || editing) ? <OpenStage key={`o${fixture.id}`} state={state} onPlaced={() => { setEditing(false); setFresh(true); }} />
    : fixture?.status === 'open' ? <PlacedStage key={`p${fixture.id}`} state={state} fresh={fresh} onEdit={() => { setFresh(false); setEditing(true); }} />
    : fixture?.status === 'locked' ? <LiveStage key={`l${fixture.id}`} state={state} />
    : vote ? <VoteStage key={`v${vote.id}`} vote={vote} state={state} />
    : <IdleStage state={state} />;

  return <div className="bets bets--stage">
    <div className="bets-top">
      <h1 className="bets-title bets-title--small">Vestiaire <span>Bets</span></h1>
      <p className="bets-wallet" aria-label={`Solde : ${state.wallet.balance} ${CURRENCY.name}`}>
        <Coin /><b>{state.wallet.balance}</b> {CR}{state.wallet.bankrupt && <em title="Prêt de la honte en cours"> 📉</em>}
      </p>
    </div>
    {preview && <p className="bets-demo" role="note">Aperçu capitaines : seuls les admins voient les paris pour l’instant.</p>}
    {state.isAdmin && <AdminBar state={state} />}
    {stage}
    {state.wallet.canBailout && <button type="button" className="bets-bailout" disabled={play.isPending}
      onClick={() => play.mutate({ action: 'bailout' })}>À sec ? Prêt de la honte : +100 {CR} (badge 📉 pendant 24 h)</button>}
    <Drawer state={state} />
  </div>;
}

export function BetsView() {
  usePageTitle('Vestiaire Bets');
  const me = useMe();
  const { status, ready } = useBetsStatus();
  const signedIn = me.data?.signedIn === true;
  const state = useBetsState(ready && status.access !== 'locked' && signedIn);
  if (!ready || me.isPending) return <div className="fc-view"><Skeleton rows={[[[1], 120], [[1], 420]]} /></div>;
  if (status.access === 'locked') return <div className="fc-view"><Locked /></div>;
  if (!signedIn) return <div className="fc-view"><SignInCard /></div>;
  return <div className="fc-view"><DataGate queries={[state]} skeleton={<Skeleton rows={[[[1], 80], [[1], 460]]} />}>
    {() => <Evening state={state.data!} preview={status.access === 'preview'} />}
  </DataGate></div>;
}
