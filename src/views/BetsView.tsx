import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  DEFAULT_STAKE, HERO_VOTE_MINUTES, STAKES, STARTING_BALANCE,
  canVoteFor, payout, playerOdds, resolveStake, tally,
} from '../../shared/bets';
import type { Member } from '../../shared/types';
import { useBetsStatus } from '../api/bets';
import { useProfile } from '../api/profile';
import { useMembers } from '../api/queries';
import { DataGate } from '../components/ui/DataGate';
import { Skeleton } from '../components/ui/Skeleton';
import { usePageTitle } from '../lib/hooks';
import '../styles/bets.css';

// Phase 1 : prototype interactif. L'effectif est réel, le reste est fictif et rien n'est
// enregistré. La phase 2 remplacera `MOCK` et l'état local par /api/bets/state.

const MOCK = { opponent: 'Eristof', goalsFor: 3, goalsAgainst: 1, rageQuit: false, redCard: false };

interface Option { id: string; label: string; odds: number; memberId?: number }
interface Market { id: string; title: string; question: string; options: Option[]; tone?: 'flop'; extra?: boolean }
type Stage = 'paris' | 'vote' | 'heros';

function buildMarkets(present: Member[]): Market[] {
  const odds = (kind: 'crack' | 'flop') => playerOdds(present.map((m) => ({ memberId: m.id, avgRating: m.avgRating })), kind);
  const crack = odds('crack');
  const flop = odds('flop');
  const players = (table: Map<number, number>) => present.map((m) => ({ id: `m${m.id}`, label: m.gamertag, odds: table.get(m.id)!, memberId: m.id }));
  return [
    { id: 'crack', title: 'Le Crack du match', question: 'Qui va rouler sur le match ?', options: players(crack) },
    { id: 'flop', title: 'La Casserole', question: 'Qui va tenter la roulette de trop ?', options: players(flop), tone: 'flop' },
    { id: 'cleansheet', title: 'Le Mur', question: 'Clean sheet ce match ?', options: [{ id: 'oui', label: 'Oui', odds: 2.2 }, { id: 'non', label: 'Non', odds: 1.35 }] },
    { id: 'verdict', title: 'Le Verdict', question: 'Résultat du match ?', extra: true,
      options: [{ id: 'v', label: 'Victoire', odds: 1.7 }, { id: 'n', label: 'Nul', odds: 3.6 }, { id: 'd', label: 'Défaite', odds: 2.6 }] },
    { id: 'score', title: 'Le Scénario offensif', question: 'Combien de buts pour Dommage ?', extra: true,
      options: [{ id: '0-1', label: '0-1', odds: 2.1 }, { id: '2-3', label: '2-3', odds: 1.9 }, { id: '4+', label: '4+ festival', odds: 3.4 }] },
    { id: 'ragequit', title: 'Rage-quit adverse', question: 'L’adversaire quitte avant la fin ?', extra: true,
      options: [{ id: 'oui', label: 'Oui', odds: 2.8 }, { id: 'non', label: 'Non', odds: 1.25 }] },
    { id: 'red', title: 'Carton rouge', question: 'Un joueur du club prend un rouge ?', extra: true,
      options: [{ id: 'oui', label: 'Oui', odds: 4 }, { id: 'non', label: 'Non', odds: 1.15 }] },
  ];
}

/** Votes fictifs des coéquipiers, pour que les barres de répartition aient de quoi s'animer. */
function mockVotes(present: Member[], kind: 'crack' | 'flop' | 'hero'): number[] {
  const ranked = [...present].sort((a, b) => (b.avgRating ?? 0) - (a.avgRating ?? 0));
  const order = kind === 'flop' ? [...ranked].reverse() : ranked;
  return [3, 2, 1].flatMap((n, i) => (order[i] ? Array<number>(n).fill(order[i].id) : []));
}

function Coin() { return <i className="bets-coin" aria-hidden="true" />; }

function Locked() {
  return <div className="bets bets--locked">
    <p className="fc27-tag">Bientôt</p>
    <h1 className="bets-title">Vestiaire <span>Bets</span></h1>
    <p className="bets-lead">Les paris et votes du vestiaire ouvriront avec les sessions Clubs Pro sur FC 27.</p>
    <Link className="bets-back" to="/fc27">← Retour à FC 27</Link>
  </div>;
}

function MarketCard({ market, selected, onPick }: { market: Market; selected?: string; onPick: (optionId: string) => void }) {
  return <article className={`bets-card${market.tone === 'flop' ? ' bets-card--flop' : ''}`}>
    <header><h3>{market.title}</h3><p>{market.question}</p></header>
    <div className={`bets-odds${market.options.length > 3 ? ' bets-odds--players' : ''}`}>
      {market.options.map((o) => <button key={o.id} type="button" className="bets-odd" aria-pressed={selected === o.id} onClick={() => onPick(o.id)}>
        <span>{o.label}</span><b>×{o.odds.toFixed(2)}</b>
      </button>)}
    </div>
  </article>;
}

function VoteCard({ title, question, tone, present, votes, mine, myMemberId, onVote }: {
  title: string; question: string; tone?: 'flop'; present: Member[]; votes: number[]; mine: number | null;
  myMemberId: number | null; onVote: (memberId: number) => void;
}) {
  const result = tally(mine === null ? votes : [...votes, mine]);
  return <article className={`bets-card bets-vote${tone === 'flop' ? ' bets-card--flop' : ''}`}>
    <header><h3>{title}</h3><p>{question}</p></header>
    <ul className="bets-vote-list">
      {present.map((m) => {
        const count = result.counts.get(m.id) ?? 0;
        const share = result.total ? Math.round((count / result.total) * 100) : 0;
        // Compte non lié : l'aperçu laisse voter pour montrer l'écran, la phase 2 refusera.
        const self = !canVoteFor(myMemberId ?? -1, m.id);
        return <li key={m.id}>
          <button type="button" aria-pressed={mine === m.id} disabled={self} onClick={() => onVote(m.id)}
            title={self ? 'Interdit de voter pour soi' : undefined}>
            <span className="bets-vote-name">{m.gamertag}{self && <em> · toi</em>}</span>
            <span className="bets-vote-bar"><i style={{ width: `${share}%` }} /></span>
            <b>{share}%</b>
          </button>
        </li>;
      })}
    </ul>
  </article>;
}

function useCountdown(active: boolean, minutes: number) {
  const [left, setLeft] = useState(minutes * 60);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return left;
}

function Prototype({ members }: { members: Member[] }) {
  const profile = useProfile();
  const myMemberId = profile.data?.player?.id ?? null;
  // Les « présents » de la soirée fictive : les six joueurs les plus capés.
  const present = useMemo(() => [...members].sort((a, b) => b.matchesPlayed - a.matchesPlayed).slice(0, 6), [members]);
  const markets = useMemo(() => buildMarkets(present), [present]);

  const [stage, setStage] = useState<Stage>('paris');
  const [balance, setBalance] = useState(STARTING_BALANCE);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [stakeChoice, setStakeChoice] = useState<number | 'max'>(DEFAULT_STAKE);
  const [placed, setPlaced] = useState<{ market: Market; option: Option; stake: number }[]>([]);
  const [votes, setVotes] = useState<{ crack: number | null; flop: number | null; hero: number | null }>({ crack: null, flop: null, hero: null });
  const [closed, setClosed] = useState(false);
  const [winning, setWinning] = useState<Record<string, string> | null>(null);
  const heroLeft = useCountdown(stage === 'heros', HERO_VOTE_MINUTES);

  const selection = markets.flatMap((m) => {
    const option = m.options.find((o) => o.id === picks[m.id]);
    return option ? [{ market: m, option }] : [];
  });
  // Une même mise par pari choisi ; MAX partage le solde entre eux.
  const stake = selection.length === 0 ? null
    : resolveStake(stakeChoice === 'max' ? Math.floor(balance / selection.length) : stakeChoice, Math.floor(balance / selection.length));
  const potential = stake === null ? 0 : selection.reduce((sum, s) => sum + payout(stake, s.option.odds), 0);

  const toggle = (marketId: string, optionId: string) =>
    setPicks((p) => (p[marketId] === optionId ? Object.fromEntries(Object.entries(p).filter(([k]) => k !== marketId)) : { ...p, [marketId]: optionId }));

  const validate = () => {
    if (stake === null) return;
    setPlaced((prev) => [...prev, ...selection.map((s) => ({ ...s, stake }))]);
    setBalance((b) => b - stake * selection.length);
    setPicks({});
  };

  const crackVotes = useMemo(() => mockVotes(present, 'crack'), [present]);
  const flopVotes = useMemo(() => mockVotes(present, 'flop'), [present]);
  const heroVotes = useMemo(() => mockVotes(present, 'hero'), [present]);

  /** Fermeture du vote par l'admin : règlement des paris du match fictif. */
  const settle = () => {
    const leader = (base: number[], mine: number | null) => tally(mine === null ? base : [...base, mine]).leaders[0];
    const crack = leader(crackVotes, votes.crack);
    const flop = leader(flopVotes, votes.flop);
    const goals = MOCK.goalsFor;
    const winning: Record<string, string> = {
      crack: `m${crack}`, flop: `m${flop}`,
      cleansheet: MOCK.goalsAgainst === 0 ? 'oui' : 'non',
      verdict: MOCK.goalsFor > MOCK.goalsAgainst ? 'v' : MOCK.goalsFor === MOCK.goalsAgainst ? 'n' : 'd',
      score: goals <= 1 ? '0-1' : goals <= 3 ? '2-3' : '4+',
      ragequit: MOCK.rageQuit ? 'oui' : 'non', red: MOCK.redCard ? 'oui' : 'non',
    };
    const won = placed.filter((p) => winning[p.market.id] === p.option.id).reduce((sum, p) => sum + payout(p.stake, p.option.odds), 0);
    setBalance((b) => b + won);
    setClosed(true);
    return winning;
  };
  const mmss = `${Math.floor(heroLeft / 60)}:${String(heroLeft % 60).padStart(2, '0')}`;
  const heroes = tally(votes.hero === null ? heroVotes : [...heroVotes, votes.hero]).leaders;

  return <div className="bets">
    <div className="bets-top">
      <div><p className="fc27-tag">Session du soir · vs {MOCK.opponent}</p><h1 className="bets-title">Vestiaire <span>Bets</span></h1></div>
      <p className="bets-wallet" aria-label={`Solde : ${balance} Dommage Coins`}><Coin /><b>{balance}</b> DC</p>
    </div>
    <p className="bets-demo" role="note">Aperçu · données fictives · rien n’est enregistré</p>

    <nav className="bets-stages" aria-label="Moment de la soirée">
      {([['paris', 'Avant-match'], ['vote', 'Fin de match'], ['heros', 'Fin de session']] as const).map(([id, label]) =>
        <button key={id} type="button" aria-current={stage === id ? 'step' : undefined} onClick={() => setStage(id)}>{label}</button>)}
    </nav>

    {stage === 'paris' && <>
      <div className="bets-grid">
        {markets.filter((m) => !m.extra).map((m) => <MarketCard key={m.id} market={m} selected={picks[m.id]} onPick={(o) => toggle(m.id, o)} />)}
      </div>
      <details className="bets-more">
        <summary>Plus de paris <b>{markets.filter((m) => m.extra).length}</b></summary>
        <div className="bets-grid">
          {markets.filter((m) => m.extra).map((m) => <MarketCard key={m.id} market={m} selected={picks[m.id]} onPick={(o) => toggle(m.id, o)} />)}
        </div>
      </details>
      {placed.length > 0 && <section className="bets-card bets-slip">
        <header><h3>Mes paris</h3><p>Cotes figées au moment de la mise.</p></header>
        <ul>{placed.map((p, i) => <li key={i}><span>{p.market.title} · {p.option.label}</span><b>{p.stake} DC × {p.option.odds.toFixed(2)}</b></li>)}</ul>
      </section>}
      <div className="bets-bar">
        <div className="bets-stakes" role="group" aria-label="Mise par pari">
          {[...STAKES, 'max' as const].map((s) => <button key={s} type="button" aria-pressed={stakeChoice === s} onClick={() => setStakeChoice(s)}>{s === 'max' ? 'Max' : s}</button>)}
        </div>
        <button type="button" className="bets-validate" disabled={stake === null} onClick={validate}>
          {selection.length === 0 ? 'Choisis une cote' : stake === null ? 'Solde insuffisant' : <>Valider {selection.length} pari{selection.length > 1 ? 's' : ''} · gain possible {potential} DC <span aria-hidden="true">↗</span></>}
        </button>
      </div>
    </>}

    {stage === 'vote' && <>
      <p className="bets-score">Dommage <b>{MOCK.goalsFor} – {MOCK.goalsAgainst}</b> {MOCK.opponent}</p>
      {myMemberId === null && <p className="bets-hint">Ton compte n’est pas lié à un joueur : en vrai, tu ne pourrais pas voter. Lie-le depuis ton profil.</p>}
      <div className="bets-grid">
        <VoteCard title="Le Crack du match" question="Le plus décisif ce match ?" present={present} votes={crackVotes} mine={votes.crack}
          myMemberId={myMemberId} onVote={(id) => !closed && setVotes((v) => ({ ...v, crack: id }))} />
        <VoteCard title="La Casserole d’or" question="La bévue du match ?" tone="flop" present={present} votes={flopVotes} mine={votes.flop}
          myMemberId={myMemberId} onVote={(id) => !closed && setVotes((v) => ({ ...v, flop: id }))} />
      </div>
      {!closed
        ? <button type="button" className="bets-admin-close" onClick={() => setWinning(settle())}>Fermer le vote et régler les paris <small>(admin)</small></button>
        : <section className="bets-card bets-slip">
          <header><h3>Paris réglés</h3><p>Le vote est fermé. Les égalités sont tranchées par l’admin.</p></header>
          {placed.length === 0 ? <p className="bets-hint">Aucun pari placé avant le match.</p>
            : <ul>{placed.map((p, i) => {
              const won = winning?.[p.market.id] === p.option.id;
              return <li key={i} className={won ? 'is-won' : 'is-lost'}><span>{p.market.title} · {p.option.label}</span>
                <b>{won ? `+${payout(p.stake, p.option.odds)} DC` : `−${p.stake} DC`}</b></li>;
            })}</ul>}
        </section>}
    </>}

    {stage === 'heros' && <>
      <p className="bets-countdown" aria-live="off">Vote ouvert encore <b>{heroLeft > 0 ? mmss : 'terminé'}</b></p>
      <VoteCard title="Le Héros de la session" question="Qui a porté l’équipe ce soir ?" present={present} votes={heroVotes} mine={votes.hero}
        myMemberId={myMemberId} onVote={(id) => heroLeft > 0 && setVotes((v) => ({ ...v, hero: id }))} />
      {heroLeft === 0 && <p className="bets-hero-result">🦸 {heroes.map((id) => present.find((m) => m.id === id)?.gamertag).join(' & ')}</p>}
    </>}
  </div>;
}

export function BetsView() {
  usePageTitle('Vestiaire Bets');
  const { status, ready } = useBetsStatus();
  const members = useMembers();
  if (!ready) return <div className="fc-view"><Skeleton rows={[[[1], 120], [[1, 1], 260]]} /></div>;
  if (status.access === 'locked') return <div className="fc-view"><Locked /></div>;
  return <div className="fc-view"><DataGate queries={[members]} skeleton={<Skeleton rows={[[[1, 1], 260]]} />}>
    {() => <Prototype members={members.data!} />}
  </DataGate></div>;
}
