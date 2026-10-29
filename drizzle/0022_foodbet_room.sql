-- FoodBet : la salle d'attente.
--
-- `credit_wallets.seen_at` : dernier passage sur FoodBet (mis à jour par server/db/bets.ts à
-- chaque lecture de l'état). `room` dans l'état : les joueurs présents ou engagés dans la
-- soirée, avec « a joué » et « a voté », sans jamais dire ce qu'ils ont choisi.
ALTER TABLE credit_wallets ADD COLUMN seen_at timestamp with time zone;--> statement-breakpoint
CREATE OR REPLACE FUNCTION bets_snapshot(p_account integer, p_admin boolean) RETURNS jsonb LANGUAGE sql STABLE AS $$
  WITH club AS (SELECT id FROM clubs ORDER BY id LIMIT 1),
  me AS (SELECT r.member_id FROM club_player_claims r WHERE r.account_id = p_account AND r.status = 'approved' LIMIT 1),
  wallet AS (SELECT * FROM credit_wallets WHERE account_id = p_account),
  current AS (SELECT * FROM bet_fixtures WHERE club_id = (SELECT id FROM club) AND status IN ('open', 'locked') LIMIT 1),
  slips AS (SELECT s.*, jsonb_build_object('id', s.id, 'fixtureId', s.fixture_id, 'market', s.market, 'option', s.option,
      'stake', s.stake, 'odds', s.odds, 'status', s.status, 'payout', s.payout) AS j
    FROM bet_slips s WHERE s.account_id = p_account)
  SELECT jsonb_build_object(
    'isAdmin', p_admin,
    'myMemberId', (SELECT member_id FROM me),
    'wallet', (SELECT jsonb_build_object('balance', balance,
      'canBailout', balance < 25 AND (bailout_at IS NULL OR bailout_at < now() - interval '24 hours')
        AND NOT EXISTS(SELECT 1 FROM bet_slips s WHERE s.account_id = p_account AND s.status = 'pending'),
      'bankrupt', bailout_at > now() - interval '24 hours') FROM wallet),
    'fixture', (SELECT jsonb_build_object('id', c.id, 'status', c.status, 'openedAt', c.opened_at, 'lockedAt', c.locked_at, 'context', c.context,
      'markets', bets_fixture_markets(c.markets, c.player_odds), 'bettors', (SELECT count(DISTINCT account_id) FROM bet_slips WHERE fixture_id = c.id),
      'mySlips', coalesce((SELECT jsonb_agg(j ORDER BY id) FROM slips WHERE fixture_id = c.id), '[]'::jsonb)) FROM current c),
    'votes', coalesce((SELECT jsonb_agg(jsonb_build_object('id', f.id, 'openedAt', f.opened_at,
      'match', jsonb_build_object('id', m.id, 'opponent', m.opponent_name, 'goalsFor', m.goals_for, 'goalsAgainst', m.goals_against,
        'result', m.result, 'playedAt', m.played_at),
      'candidates', coalesce((SELECT jsonb_agg(jsonb_build_object('memberId', mb.id, 'gamertag', mb.gamertag) ORDER BY mb.gamertag)
        FROM members mb WHERE mb.id = ANY(CASE WHEN cardinality(bets_match_players(m.id)) > 0 THEN bets_match_players(m.id)
          ELSE ARRAY(SELECT id FROM members WHERE club_id = f.club_id AND is_active) END)), '[]'::jsonb),
      'tally', jsonb_build_object(
        'crack', coalesce((SELECT jsonb_object_agg(member_id, n) FROM (SELECT member_id, count(*) n FROM bet_votes WHERE fixture_id = f.id AND category = 'crack' GROUP BY member_id) t), '{}'::jsonb),
        'flop', coalesce((SELECT jsonb_object_agg(member_id, n) FROM (SELECT member_id, count(*) n FROM bet_votes WHERE fixture_id = f.id AND category = 'flop' GROUP BY member_id) t), '{}'::jsonb)),
      'myVotes', jsonb_build_object(
        'crack', (SELECT member_id FROM bet_votes WHERE fixture_id = f.id AND account_id = p_account AND category = 'crack'),
        'flop', (SELECT member_id FROM bet_votes WHERE fixture_id = f.id AND account_id = p_account AND category = 'flop')),
      'voters', (SELECT count(DISTINCT account_id) FROM bet_votes WHERE fixture_id = f.id),
      'picks', CASE WHEN EXISTS(SELECT 1 FROM bet_votes WHERE fixture_id = f.id AND account_id = p_account)
        THEN bets_picks(f.id, p_account) END,
      'markets', bets_fixture_markets(f.markets, f.player_odds),
      'mySlips', coalesce((SELECT jsonb_agg(j ORDER BY id) FROM slips WHERE fixture_id = f.id), '[]'::jsonb)) ORDER BY f.id DESC)
      FROM bet_fixtures f JOIN matches m ON m.id = f.match_id WHERE f.club_id = (SELECT id FROM club) AND f.status = 'voting'), '[]'::jsonb),
    'history', coalesce((SELECT jsonb_agg(h ORDER BY (h->>'id')::integer DESC) FROM (
      SELECT jsonb_build_object('id', f.id, 'status', f.status, 'settledAt', f.settled_at,
        'match', CASE WHEN m.id IS NULL THEN NULL ELSE jsonb_build_object('id', m.id, 'opponent', m.opponent_name,
          'goalsFor', m.goals_for, 'goalsAgainst', m.goals_against, 'result', m.result) END,
        'crack', (SELECT jsonb_agg(gamertag) FROM members WHERE id = ANY(f.crack_ids)),
        'flop', (SELECT jsonb_agg(gamertag) FROM members WHERE id = ANY(f.flop_ids)),
        'myVote', (SELECT member_id FROM bet_votes WHERE fixture_id = f.id AND account_id = p_account AND category = 'crack'),
        'results', bets_picks(f.id, p_account),
        'markets', bets_fixture_markets(f.markets, f.player_odds),
        'mySlips', coalesce((SELECT jsonb_agg(j ORDER BY id) FROM slips WHERE fixture_id = f.id), '[]'::jsonb)) h
      FROM bet_fixtures f LEFT JOIN matches m ON m.id = f.match_id
      WHERE f.club_id = (SELECT id FROM club) AND f.status IN ('settled', 'cancelled')
      ORDER BY f.id DESC LIMIT 5) x), '[]'::jsonb),
    -- La salle d'attente : qui est là (FoodBet ouvert ces 2 dernières minutes), qui a joué, qui a voté.
    -- Jamais ce qu'ils ont choisi : ça, c'est `picks`, dévoilé après le vote.
    'room', coalesce((SELECT jsonb_agg(jsonb_build_object('name', bets_player_name(w.account_id), 'me', w.account_id = p_account,
        'here', w.seen_at > now() - interval '2 minutes',
        'played', EXISTS(SELECT 1 FROM bet_slips s JOIN bet_fixtures f ON f.id = s.fixture_id
          WHERE s.account_id = w.account_id AND f.club_id = (SELECT id FROM club) AND f.status IN ('open', 'locked', 'voting')),
        'voted', EXISTS(SELECT 1 FROM bet_votes v JOIN bet_fixtures f ON f.id = v.fixture_id
          WHERE v.account_id = w.account_id AND f.club_id = (SELECT id FROM club) AND f.status = 'voting'))
      ORDER BY w.account_id <> p_account, bets_player_name(w.account_id))
      FROM credit_wallets w
      WHERE w.account_id = p_account OR w.seen_at > now() - interval '2 minutes'
        OR EXISTS(SELECT 1 FROM bet_slips s JOIN bet_fixtures f ON f.id = s.fixture_id
          WHERE s.account_id = w.account_id AND f.status IN ('open', 'locked', 'voting'))
        OR EXISTS(SELECT 1 FROM bet_votes v JOIN bet_fixtures f ON f.id = v.fixture_id
          WHERE v.account_id = w.account_id AND f.status = 'voting')), '[]'::jsonb),
    'leaderboard', coalesce((SELECT jsonb_agg(jsonb_build_object('accountId', a.id, 'name', bets_player_name(a.id),
      'balance', w.balance, 'me', a.id = p_account) ORDER BY w.balance DESC, a.id)
      FROM (SELECT * FROM credit_wallets ORDER BY balance DESC, account_id LIMIT 10) w JOIN club_accounts a ON a.id = w.account_id), '[]'::jsonb)
  );
$$;
