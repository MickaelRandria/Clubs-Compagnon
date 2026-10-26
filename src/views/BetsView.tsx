import { useState } from 'react';
import { Link } from 'react-router';
import {
  CURRENCY, DEFAULT_STAKE, MARKET_COPY, MARKET_ORDER, STAKES, optionLabel, payout,
  type BetsState, type Market, type MarketId, type Slip,
} from '../../shared/bets';
import { useMe } from '../api/auth';
import { useBetsAdmin, useBetsPlay, useBetsState, useBetsStatus } from '../api/bets';
import { SignInButton } from '../components/fc27/SignIn';
import { DataGate } from '../components/ui/DataGate';
import { Skeleton } from '../components/ui/Skeleton';
import { usePageTitle } from '../lib/hooks';
import '../styles/bets.css';

// Vestiaire Bets : paris d'avant-match en crédits.
// Un écran, une chose à faire à la fois : parier quand c'est ouvert, attendre pendant le
// match, voter Crack / Casserole après. Les règles et l'argent sont côté serveur
// (drizzle/0017_bets.sql) ; ici on n'affiche que ce que renvoie /api/bets/state.

const CR = CURRENCY.short;

function Coin() { return <i className="bets-coin" aria-hidden="true" />; }

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
    <h1 className="bets-title">Parie avant <span>le match</span></h1>
    <p className="bets-lead">Connecte-toi avec Discord : tu reçois <b>500 {CURRENCY.name}</b> pour parier sur le prochain match du club. Aucun argent réel.</p>
    <SignInButton className="bets-signin" />
  </div>;
}

/** « Victoire · 50 → 100 CR » et son issue une fois réglé. */
function SlipLine({ slip, markets }: { slip: Slip; markets: Market[] }) {
  const result = slip.status === 'won' ? <b className="is-won">+{slip.payout} {CR}</b>
    : slip.status === 'lost' ? <b className="is-lost">−{slip.stake} {CR}</b>
    : slip.status === 'refunded' ? <b>remboursé</b>
    : <b>{slip.stake} → {payout(slip.stake, slip.odds)} {CR}</b>;
  return <li className={`is-${slip.status}`}>
    <span>{MARKET_COPY[slip.market].emoji} {MARKET_COPY[slip.market].title} · <strong>{optionLabel(markets, slip)}</strong> <em>×{Number(slip.odds).toFixed(2)}</em></span>
    {result}
  </li>;
}

function AdminPanel({ state }: { state: BetsState }) {
  const admin = useBetsAdmin();
  const fixture = state.fixture;
  const cancel = () => fixture && window.confirm('Annuler cette rencontre ? Toutes les mises seront remboursées.')
    && admin.mutate({ action: 'cancel', fixtureId: fixture.id });
  return <section className="bets-admin" aria-label="Commandes de l’admin">
    <p className="bets-admin-tag">Admin</p>
    {!fixture && <>
      <button type="button" className="bets-admin-go" disabled={admin.isPending} onClick={() => admin.mutate({ action: 'open' })}>
        Ouvrir les paris du prochain match
      </button>
      <p className="bets-hint">À faire dans le lobby, avant de lancer le match.{state.votes.length > 0 && ' Ça clôt aussi le vote en cours.'}</p>
    </>}
    {fixture?.status === 'open' && <>
      <button type="button" className="bets-admin-go bets-admin-go--kickoff" disabled={admin.isPending} onClick={() => admin.mutate({ action: 'lock' })}>
        Coup d’envoi · fermer les paris
      </button>
      <p className="bets-hint">{fixture.bettors} parieur{fixture.bettors > 1 ? 's' : ''} pour l’instant. Tape au lancement du match.</p>
    </>}
    {fixture?.status === 'locked' && <p className="bets-hint">Paris fermés. Le match sera relié tout seul dès qu’EA le publie.</p>}
    {fixture && <button type="button" className="bets-admin-cancel" disabled={admin.isPending} onClick={cancel}>Annuler la rencontre</button>}
    {admin.isError && <p className="bets-error" role="alert">{admin.error.message}</p>}
  </section>;
}

function MarketCard({ market, pick, slip, onPick, onRemove }: {
  market: Market; pick?: string; slip?: Slip; onPick: (optionId: string) => void; onRemove: () => void;
}) {
  const copy = MARKET_COPY[market.id];
  const players = market.id === 'crack' || market.id === 'flop';
  return <article className={`bets-card${market.id === 'flop' ? ' bets-card--flop' : ''}${slip ? ' bets-card--placed' : ''}`}>
    <header><h3>{copy.emoji} {copy.title}</h3><p>{copy.question}</p></header>
    <div className={`bets-odds${players ? ' bets-odds--players' : ''}`}>
      {market.options.map((o) => {
        const chosen = pick === o.id || (pick === undefined && slip?.option === o.id);
        return <button key={o.id} type="button" className="bets-odd" aria-pressed={chosen} onClick={() => onPick(o.id)}>
          <span>{o.label}</span><b>×{o.odds.toFixed(2)}</b>
        </button>;
      })}
    </div>
    {slip && <footer className="bets-placed">
      {pick !== undefined && pick !== slip.option
        ? <span>Nouveau choix : il remplacera ton pari en validant.</span>
        : <span>✓ Misé <b>{slip.stake} {CR}</b> · gain possible <b>{payout(slip.stake, slip.odds)} {CR}</b></span>}
      <button type="button" onClick={onRemove}>Retirer</button>
    </footer>}
  </article>;
}

function Betting({ state }: { state: BetsState }) {
  const fixture = state.fixture!;
  const play = useBetsPlay();
  const [picks, setPicks] = useState<Partial<Record<MarketId, string>>>({});
  const [stakeChoice, setStakeChoice] = useState<number | 'max'>(DEFAULT_STAKE);
  const [done, setDone] = useState(false);
  const slipOf = (id: MarketId) => fixture.mySlips.find((s) => s.market === id);
  const markets = MARKET_ORDER.map((id) => fixture.markets.find((m) => m.id === id)).filter((m): m is Market => m !== undefined);

  // Seuls les vrais changements comptent : retoucher l'option déjà misée ne fait rien.
  const changes = markets.flatMap((m) => {
    const optionId = picks[m.id];
    const option = m.options.find((o) => o.id === optionId);
    return option && optionId !== slipOf(m.id)?.option ? [{ market: m, option }] : [];
  });
  // Une mise remplacée est rendue avant la nouvelle : elle compte dans le disponible.
  const available = state.wallet.balance + changes.reduce((sum, c) => sum + (slipOf(c.market.id)?.stake ?? 0), 0);
  const stake = changes.length === 0 ? 0 : stakeChoice === 'max' ? Math.floor(available / changes.length) : stakeChoice;
  const affordable = stake > 0 && stake * changes.length <= available;
  const potential = changes.reduce((sum, c) => sum + payout(stake, c.option.odds), 0);

  const pickOption = (id: MarketId, optionId: string) => {
    setDone(false);
    setPicks((p) => {
      const next = { ...p };
      if (p[id] === optionId || (p[id] === undefined && slipOf(id)?.option === optionId)) delete next[id];
      else next[id] = optionId;
      return next;
    });
  };
  const validate = () => {
    if (!affordable) return;
    play.mutate({ action: 'place', fixtureId: fixture.id, bets: changes.map((c) => ({ market: c.market.id, option: c.option.id, stake })) },
      { onSuccess: () => { setPicks({}); setDone(true); } });
  };

  return <>
    <ol className="bets-steps" aria-label="Comment parier">
      <li><b>1</b> Touche une cote</li><li><b>2</b> Choisis ta mise</li><li><b>3</b> Valide</li>
    </ol>
    <div className="bets-grid">
      {markets.map((m) => <MarketCard key={m.id} market={m} pick={picks[m.id]} slip={slipOf(m.id)}
        onPick={(o) => pickOption(m.id, o)} onRemove={() => play.mutate({ action: 'unplace', market: m.id })} />)}
    </div>
    {play.isError && <p className="bets-error" role="alert">{play.error.message}</p>}
    <div className={`bets-bar${done && changes.length === 0 ? ' bets-bar--done' : ''}`} role="region" aria-label="Mise et validation" aria-live="polite">
      <div className="bets-stakes" role="group" aria-label="Mise par pari">
        {[...STAKES, 'max' as const].map((s) => <button key={s} type="button" aria-pressed={stakeChoice === s} onClick={() => setStakeChoice(s)}>
          {s === 'max' ? 'Max' : s}
        </button>)}
      </div>
      <button type="button" className="bets-validate" disabled={!affordable || play.isPending} onClick={validate}>
        {play.isPending ? 'Enregistrement…'
          : changes.length === 0 && done ? '✓ Paris enregistrés · modifiables jusqu’au coup d’envoi'
          : changes.length === 0 ? 'Touche une cote pour parier'
          : !affordable ? 'Solde insuffisant'
          : <>Valider {changes.length} pari{changes.length > 1 ? 's' : ''} · {stake * changes.length} {CR} → jusqu’à {potential} {CR}</>}
      </button>
    </div>
  </>;
}

function LiveMatch({ state }: { state: BetsState }) {
  const fixture = state.fixture!;
  return <section className="bets-card bets-live">
    <header><h3>🔒 Match en cours</h3><p>Les paris sont fermés. Les résultats tombent tout seuls quelques minutes après le coup de sifflet, quand EA publie le match.</p></header>
    {fixture.mySlips.length === 0
      ? <p className="bets-hint">Tu n’as pas parié sur ce match. Rendez-vous au prochain !</p>
      : <ul className="bets-slip">{fixture.mySlips.map((s) => <SlipLine key={s.id} slip={s} markets={fixture.markets} />)}</ul>}
  </section>;
}

function VoteCard({ vote, state }: { vote: BetsState['votes'][number]; state: BetsState }) {
  const play = useBetsPlay();
  const admin = useBetsAdmin();
  const { match } = vote;
  const list = (category: 'crack' | 'flop') => {
    const counts = vote.tally[category];
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    return <ul className="bets-vote-list">
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
    </ul>;
  };
  return <section className="bets-vote-block" aria-label={`Vote du match contre ${match.opponent}`}>
    <p className="bets-score">FoodBall <b>{match.goalsFor} – {match.goalsAgainst}</b> {match.opponent}</p>
    {vote.mySlips.length > 0 && <div className="bets-card">
      <header><h3>Tes paris</h3><p>Réglés avec le score EA. Le Crack et la Casserole attendent le vote.</p></header>
      <ul className="bets-slip">{vote.mySlips.map((s) => <SlipLine key={s.id} slip={s} markets={vote.markets} />)}</ul>
    </div>}
    <div className="bets-grid">
      <article className="bets-card bets-vote"><header><h3>🔥 Le Crack du match</h3><p>Le plus décisif ? Tu peux changer ton vote.</p></header>{list('crack')}</article>
      <article className="bets-card bets-vote bets-card--flop"><header><h3>🍳 La Casserole</h3><p>La bévue du match ?</p></header>{list('flop')}</article>
    </div>
    {play.isError && <p className="bets-error" role="alert">{play.error.message}</p>}
    {state.isAdmin && <button type="button" className="bets-admin-close" disabled={admin.isPending}
      onClick={() => admin.mutate({ action: 'close-vote', fixtureId: vote.id })}>Clore le vote et payer les gagnants <small>(admin)</small></button>}
  </section>;
}

function History({ state }: { state: BetsState }) {
  if (state.history.length === 0) return null;
  return <section className="bets-card bets-history" aria-labelledby="bets-history-title">
    <header><h3 id="bets-history-title">Mes derniers paris</h3></header>
    {state.history.map((h) => <div key={h.id} className="bets-history-item">
      <p>{h.match ? <>vs {h.match.opponent} <b>{h.match.goalsFor}–{h.match.goalsAgainst}</b></> : 'Rencontre annulée'}
        {h.crack && <span> · 🔥 {h.crack.join(' & ')}</span>}{h.flop && <span> · 🍳 {h.flop.join(' & ')}</span>}</p>
      <ul className="bets-slip">{h.mySlips.map((s) => <SlipLine key={s.id} slip={s} markets={h.markets} />)}</ul>
    </div>)}
  </section>;
}

function Leaderboard({ state }: { state: BetsState }) {
  return <section className="bets-card bets-board" aria-labelledby="bets-board-title">
    <header><h3 id="bets-board-title">👑 Le classement</h3></header>
    <ol>{state.leaderboard.map((row, i) => <li key={row.accountId} className={row.me ? 'is-me' : undefined}>
      <span>{i + 1}</span><strong>{row.name}{row.me && ' (toi)'}</strong><b>{row.balance} {CR}</b>
    </li>)}</ol>
  </section>;
}

function Evening({ state, preview }: { state: BetsState; preview: boolean }) {
  const play = useBetsPlay();
  const fixture = state.fixture;
  return <div className="bets">
    <div className="bets-top">
      <div>
        <p className="fc27-tag">{fixture?.status === 'open' ? 'Paris ouverts' : fixture?.status === 'locked' ? 'Match en cours' : state.votes.length ? 'Place au vote' : 'Vestiaire Bets'}</p>
        <h1 className="bets-title">Vestiaire <span>Bets</span></h1>
      </div>
      <p className="bets-wallet" aria-label={`Solde : ${state.wallet.balance} ${CURRENCY.name}`}>
        <Coin /><b>{state.wallet.balance}</b> {CR}{state.wallet.bankrupt && <em title="Prêt de la honte en cours"> 📉</em>}
      </p>
    </div>
    {preview && <p className="bets-demo" role="note">Aperçu capitaines : seuls les admins voient les paris pour l’instant.</p>}
    {state.wallet.canBailout && <button type="button" className="bets-bailout" disabled={play.isPending}
      onClick={() => play.mutate({ action: 'bailout' })}>À sec ? Prends le prêt de la honte : +100 {CR} (badge 📉 pendant 24 h)</button>}
    {state.isAdmin && <AdminPanel state={state} />}

    {state.votes.map((v) => <VoteCard key={v.id} vote={v} state={state} />)}

    {fixture?.status === 'open' && <Betting key={fixture.id} state={state} />}
    {fixture?.status === 'locked' && <LiveMatch state={state} />}
    {!fixture && state.votes.length === 0 && <section className="bets-card bets-empty">
      <header><h3>Pas de paris ouverts</h3><p>Ils s’ouvrent juste avant le prochain match, dans le lobby. Reviens à ce moment-là : ça prend 10 secondes.</p></header>
    </section>}

    <History state={state} />
    <Leaderboard state={state} />
  </div>;
}

export function BetsView() {
  usePageTitle('Vestiaire Bets');
  const me = useMe();
  const { status, ready } = useBetsStatus();
  const signedIn = me.data?.signedIn === true;
  const state = useBetsState(ready && status.access !== 'locked' && signedIn);
  if (!ready || me.isPending) return <div className="fc-view"><Skeleton rows={[[[1], 120], [[1, 1], 260]]} /></div>;
  if (status.access === 'locked') return <div className="fc-view"><Locked /></div>;
  if (!signedIn) return <div className="fc-view"><SignInCard /></div>;
  return <div className="fc-view"><DataGate queries={[state]} skeleton={<Skeleton rows={[[[1], 120], [[1, 1], 260]]} />}>
    {() => <Evening state={state.data!} preview={status.access === 'preview'} />}
  </DataGate></div>;
}
