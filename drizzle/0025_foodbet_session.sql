-- FoodBet : on parie sur la session de la soirée, plus sur un match.
--
-- Une soirée = tous les matchs joués entre le coup d'envoi (`locked_at`) et la « Fin de session »
-- de l'admin (`ended_at`). Pas besoin de savoir combien à l'avance : les paris sont formulés en
-- moyennes et en « meilleur de la soirée ». Tout se règle d'un coup à la fin de session
-- (bets_end_session) ; le Crack de la soirée reste élu par le vote.
--
-- Paris : bilan, attack, scorer, clumsy (le Maladroit : tirs ratés), crack, sr (skill rating),
-- et un bonus parmi cleansheet, red, ragequit, streak (sur la soirée).
ALTER TABLE bet_fixtures ADD COLUMN ended_at timestamp with time zone;
--> statement-breakpoint
ALTER TABLE bet_fixtures ADD COLUMN sr_start integer;
--> statement-breakpoint
ALTER TABLE bet_fixtures ADD COLUMN sr_end integer;
--> statement-breakpoint
ALTER TABLE bet_slips DROP CONSTRAINT bet_slips_market_check;
--> statement-breakpoint
ALTER TABLE bet_slips ADD CONSTRAINT bet_slips_market_check
  CHECK (market IN ('verdict', 'goals', 'against', 'cleansheet', 'red', 'ragequit', 'crack', 'flop', 'scorer',
    'bilan', 'attack', 'clumsy', 'sr', 'streak'));
--> statement-breakpoint
/** Ce qu'a donné la session jusqu'ici : matchs, bilan, buts, joueurs (buts, passes, tirs ratés, note moyenne). */
CREATE OR REPLACE FUNCTION bets_session(p_fixture integer) RETURNS jsonb LANGUAGE sql STABLE AS $$
  WITH f AS (SELECT * FROM bet_fixtures WHERE id = p_fixture),
  ms AS (SELECT m.* FROM matches m, f WHERE m.club_id = f.club_id AND f.locked_at IS NOT NULL AND m.played_at > f.locked_at
    AND (f.ended_at IS NULL OR m.played_at <= f.ended_at)),
  ps AS (SELECT mb.id AS member_id, mb.gamertag, coalesce((p->>'goals')::integer, 0) AS goals,
      coalesce((p->>'assists')::integer, 0) AS assists, coalesce((p->>'shots')::integer, 0) AS shots, (p->>'rating')::numeric AS rating
    FROM ms CROSS JOIN LATERAL jsonb_array_elements(coalesce(ms.player_stats, '[]'::jsonb)) p
    JOIN members mb ON mb.club_id = ms.club_id AND mb.gamertag = p->>'gamertag'),
  agg AS (SELECT member_id, gamertag, sum(goals)::integer AS goals, sum(assists)::integer AS assists,
      sum(greatest(shots - goals, 0))::integer AS missed, round(avg(rating), 1) AS rating, count(*)::integer AS played
    FROM ps GROUP BY member_id, gamertag),
  ordered AS (SELECT result::text AS result, row_number() OVER (ORDER BY played_at) AS rn FROM ms),
  runs AS (SELECT count(*) AS n FROM (SELECT rn - row_number() OVER (ORDER BY rn) AS grp FROM ordered WHERE result = 'win') w GROUP BY grp)
  SELECT jsonb_build_object(
    'startedAt', f.locked_at, 'endedAt', f.ended_at,
    'matches', (SELECT count(*) FROM ms),
    'wins', (SELECT count(*) FROM ms WHERE result::text = 'win'),
    'draws', (SELECT count(*) FROM ms WHERE result::text = 'draw'),
    'losses', (SELECT count(*) FROM ms WHERE result::text = 'loss'),
    'goalsFor', (SELECT coalesce(sum(goals_for), 0) FROM ms),
    'goalsAgainst', (SELECT coalesce(sum(goals_against), 0) FROM ms),
    'cleanSheets', (SELECT count(*) FROM ms WHERE goals_against = 0),
    'withStats', (SELECT count(*) FROM ms WHERE jsonb_array_length(coalesce(player_stats, '[]'::jsonb)) > 0),
    'reds', (SELECT count(*) FROM ms WHERE EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(ms.player_stats, '[]'::jsonb)) p
      WHERE (p->>'redCards')::integer > 0)),
    'ragequits', (SELECT count(*) FROM ms WHERE opponent_quit),
    'quitKnown', (SELECT count(*) FROM ms WHERE opponent_quit IS NOT NULL),
    'bestStreak', (SELECT coalesce(max(n), 0) FROM runs),
    'srStart', f.sr_start,
    'srNow', coalesce(f.sr_end, (SELECT skill_rating FROM clubs WHERE id = f.club_id)),
    'last', (SELECT jsonb_build_object('id', id, 'opponent', opponent_name, 'goalsFor', goals_for, 'goalsAgainst', goals_against,
      'result', result, 'playedAt', played_at) FROM ms ORDER BY played_at DESC LIMIT 1),
    'players', coalesce((SELECT jsonb_agg(jsonb_build_object('memberId', member_id, 'gamertag', gamertag, 'goals', goals,
      'assists', assists, 'missed', missed, 'rating', rating, 'played', played) ORDER BY goals DESC, rating DESC NULLS LAST, gamertag)
      FROM agg), '[]'::jsonb))
  FROM f;
$$;
--> statement-breakpoint
/**
 * Fin de session : tout se règle d'un coup sur les matchs de la soirée. Aucun match joué : tout
 * est remboursé. Le Crack attend le vote (statut 'voting').
 */
CREATE OR REPLACE FUNCTION bets_end_session(p_fixture integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE f bet_fixtures%ROWTYPE; s jsonb; sl bet_slips%ROWTYPE; market_def jsonb; n integer; w integer; l integer;
  average numeric; played integer[]; best integer; stats boolean;
BEGIN
  UPDATE bet_fixtures SET ended_at = clock_timestamp(), sr_end = (SELECT skill_rating FROM clubs WHERE id = club_id)
    WHERE id = p_fixture RETURNING * INTO f;
  s := bets_session(p_fixture);
  n := (s->>'matches')::integer;
  IF n = 0 THEN
    FOR market_def IN SELECT jsonb_array_elements(bets_fixture_markets(f.markets, f.player_odds)) LOOP
      PERFORM bets_resolve(f.id, market_def->>'id', NULL);
    END LOOP;
    UPDATE bet_fixtures SET status = 'cancelled', settled_at = clock_timestamp() WHERE id = f.id;
    RETURN;
  END IF;
  w := (s->>'wins')::integer; l := (s->>'losses')::integer;
  average := (s->>'goalsFor')::numeric / n;
  stats := (s->>'withStats')::integer > 0;
  PERFORM bets_resolve(f.id, 'bilan', ARRAY[CASE WHEN w > l THEN 'win' WHEN w < l THEN 'loss' ELSE 'even' END]);
  PERFORM bets_resolve(f.id, 'attack', ARRAY[CASE WHEN average < 2 THEN 'lt2' WHEN average <= 3 THEN '2-3' ELSE 'gt3' END]);
  -- Skill rating inconnu ou inchangé : remboursé.
  PERFORM bets_resolve(f.id, 'sr', CASE WHEN (s->>'srStart') IS NULL OR (s->>'srNow') IS NULL
    OR (s->>'srStart')::integer = (s->>'srNow')::integer THEN NULL
    WHEN (s->>'srNow')::integer > (s->>'srStart')::integer THEN ARRAY['up'] ELSE ARRAY['down'] END);
  PERFORM bets_resolve(f.id, 'cleansheet', ARRAY[CASE WHEN (s->>'cleanSheets')::integer > 0 THEN 'oui' ELSE 'non' END]);
  PERFORM bets_resolve(f.id, 'streak', ARRAY[CASE WHEN (s->>'bestStreak')::integer >= 3 THEN 'oui' ELSE 'non' END]);
  PERFORM bets_resolve(f.id, 'red', CASE WHEN NOT stats THEN NULL
    WHEN (s->>'reds')::integer > 0 THEN ARRAY['oui'] ELSE ARRAY['non'] END);
  -- Abandon : un seul suffit ; sinon il faut connaître l'issue de chaque match.
  PERFORM bets_resolve(f.id, 'ragequit', CASE WHEN (s->>'ragequits')::integer > 0 THEN ARRAY['oui']
    WHEN (s->>'quitKnown')::integer = n THEN ARRAY['non'] ELSE NULL END);
  IF stats THEN
    -- Un pari sur un joueur qui n'a joué aucun match de la soirée est remboursé.
    played := ARRAY(SELECT (x->>'memberId')::integer FROM jsonb_array_elements(s->'players') x);
    FOR sl IN SELECT * FROM bet_slips WHERE fixture_id = f.id AND market IN ('crack', 'flop', 'scorer', 'clumsy')
        AND status = 'pending' AND NOT (option::integer = ANY(played)) FOR UPDATE LOOP
      UPDATE bet_slips SET status = 'refunded', payout = sl.stake WHERE id = sl.id;
      PERFORM bets_credit(sl.account_id, sl.stake, 'refund', sl.id);
    END LOOP;
    -- Meilleur buteur, plus maladroit : ex æquo, tous gagnent ; personne (0) : personne ne gagne.
    SELECT max((x->>'goals')::integer) INTO best FROM jsonb_array_elements(s->'players') x;
    PERFORM bets_resolve(f.id, 'scorer', ARRAY(SELECT x->>'memberId' FROM jsonb_array_elements(s->'players') x
      WHERE best > 0 AND (x->>'goals')::integer = best));
    SELECT max((x->>'missed')::integer) INTO best FROM jsonb_array_elements(s->'players') x;
    PERFORM bets_resolve(f.id, 'clumsy', ARRAY(SELECT x->>'memberId' FROM jsonb_array_elements(s->'players') x
      WHERE best > 0 AND (x->>'missed')::integer = best));
  ELSE
    PERFORM bets_resolve(f.id, 'scorer', NULL);
    PERFORM bets_resolve(f.id, 'clumsy', NULL);
  END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(bets_fixture_markets(f.markets, f.player_odds)) x WHERE x->>'id' IN ('crack', 'flop')) THEN
    UPDATE bet_fixtures SET status = 'voting' WHERE id = f.id;
  ELSE
    UPDATE bet_fixtures SET status = 'settled', settled_at = clock_timestamp() WHERE id = f.id;
  END IF;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bets_settle() RETURNS void LANGUAGE plpgsql AS $$
DECLARE f bet_fixtures%ROWTYPE; m matches%ROWTYPE; s bet_slips%ROWTYPE;
BEGIN
  -- Coup d'envoi oublié : un match s'est joué alors que les paris étaient ouverts. La session
  -- démarre à l'ouverture ; les mises des 20 dernières minutes avant ce match ont pu être faites
  -- en voyant le score : remboursées.
  FOR f IN SELECT * FROM bet_fixtures WHERE status = 'open' FOR UPDATE LOOP
    SELECT * INTO m FROM matches WHERE club_id = f.club_id AND played_at > f.opened_at ORDER BY played_at LIMIT 1;
    CONTINUE WHEN NOT FOUND;
    FOR s IN SELECT * FROM bet_slips WHERE fixture_id = f.id AND status = 'pending'
        AND created_at > m.played_at - interval '20 minutes' FOR UPDATE LOOP
      UPDATE bet_slips SET status = 'refunded', payout = s.stake WHERE id = s.id;
      PERFORM bets_credit(s.account_id, s.stake, 'refund', s.id);
    END LOOP;
    UPDATE bet_fixtures SET status = 'locked', locked_at = f.opened_at,
      sr_start = (SELECT skill_rating FROM clubs WHERE id = f.club_id) WHERE id = f.id;
  END LOOP;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bets_close_vote(p_fixture integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE cat text; leaders integer[]; s bet_slips%ROWTYPE;
BEGIN
  FOREACH cat IN ARRAY ARRAY['crack', 'flop'] LOOP
    SELECT array_agg(member_id ORDER BY member_id) INTO leaders FROM (
      SELECT member_id, count(*) AS n, max(count(*)) OVER () AS best FROM bet_votes
      WHERE fixture_id = p_fixture AND category = cat GROUP BY member_id) t WHERE n = best;
    -- Élu Crack de la soirée : son pari Crack (forcément sur un autre) lui est remboursé.
    IF cat = 'crack' AND leaders IS NOT NULL THEN
      FOR s IN SELECT b.* FROM bet_slips b JOIN club_player_claims c ON c.account_id = b.account_id AND c.status = 'approved'
          WHERE b.fixture_id = p_fixture AND b.market = 'crack' AND b.status = 'pending' AND c.member_id = ANY(leaders) FOR UPDATE OF b LOOP
        UPDATE bet_slips SET status = 'refunded', payout = s.stake WHERE id = s.id;
        PERFORM bets_credit(s.account_id, s.stake, 'refund', s.id);
      END LOOP;
    END IF;
    PERFORM bets_resolve(p_fixture, cat, CASE WHEN leaders IS NULL THEN NULL ELSE leaders::text[] END);
    IF cat = 'crack' THEN UPDATE bet_fixtures SET crack_ids = leaders WHERE id = p_fixture;
    ELSE UPDATE bet_fixtures SET flop_ids = leaders WHERE id = p_fixture; END IF;
  END LOOP;
  UPDATE bet_fixtures SET status = 'settled', settled_at = clock_timestamp() WHERE id = p_fixture;
END;
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION bets_dispatch(p_action text, p_account integer, p_input jsonb DEFAULT '{}', p_admin boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  club_key integer;
  f bet_fixtures%ROWTYPE;
  w credit_wallets%ROWTYPE;
  bet jsonb;
  market_def jsonb;
  option_odds numeric;
  old_slip bet_slips%ROWTYPE;
  new_slip integer;
  stake integer;
  my_member integer;
  target integer;
BEGIN
  IF NOT EXISTS(SELECT 1 FROM club_accounts WHERE id = p_account) THEN
    RETURN jsonb_build_object('error', 'Session inconnue. Reconnecte-toi.', 'status', 401);
  END IF;
  SELECT id INTO club_key FROM clubs ORDER BY id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Aucun club disponible.', 'status', 404); END IF;

  -- Premier passage : chaque compte Discord reçoit sa cagnotte de départ.
  INSERT INTO credit_wallets(account_id, balance) VALUES (p_account, 500) ON CONFLICT DO NOTHING;
  IF FOUND THEN INSERT INTO credit_ledger(account_id, amount, reason) VALUES (p_account, 500, 'welcome'); END IF;
  PERFORM bets_settle();

  IF p_action IN ('open', 'lock', 'end-session', 'close-vote', 'cancel') AND NOT p_admin THEN
    RETURN jsonb_build_object('error', 'Réservé à l’administrateur du club.', 'status', 403);
  END IF;

  CASE p_action
  WHEN 'state' THEN NULL;

  WHEN 'open' THEN
    IF EXISTS(SELECT 1 FROM bet_fixtures WHERE club_id = club_key AND status IN ('open', 'locked')) THEN
      RETURN jsonb_build_object('error', 'Des paris sont déjà ouverts ou en cours.', 'status', 409);
    END IF;
    IF p_input->'markets' IS NULL AND jsonb_array_length(coalesce(p_input->'playerOdds', '[]'::jsonb)) = 0 THEN
      RETURN jsonb_build_object('error', 'Aucun joueur actif pour ouvrir les paris.', 'status', 400);
    END IF;
    -- Ouvrir le match suivant clôt les votes encore ouverts : un seul geste pour l'admin.
    FOR f IN SELECT * FROM bet_fixtures WHERE club_id = club_key AND status = 'voting' ORDER BY id LOOP
      PERFORM bets_close_vote(f.id);
    END LOOP;
    INSERT INTO bet_fixtures(club_id, player_odds, markets, context, opened_by)
      VALUES (club_key, coalesce(p_input->'playerOdds', '[]'::jsonb), p_input->'markets', p_input->'context', p_account);

  WHEN 'lock' THEN
    UPDATE bet_fixtures SET status = 'locked', locked_at = clock_timestamp(),
      sr_start = (SELECT skill_rating FROM clubs WHERE id = club_key)
      WHERE club_id = club_key AND status = 'open' RETURNING * INTO f;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Aucun pari ouvert à verrouiller.', 'status', 409); END IF;

  WHEN 'end-session' THEN
    SELECT * INTO f FROM bet_fixtures WHERE club_id = club_key AND status = 'locked' FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Aucune session en cours : donne d’abord le coup d’envoi.', 'status', 409); END IF;
    PERFORM bets_end_session(f.id);

  WHEN 'close-vote' THEN
    SELECT * INTO f FROM bet_fixtures WHERE id = (p_input->>'fixtureId')::integer AND club_id = club_key AND status = 'voting' FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Ce vote est déjà clos.', 'status', 409); END IF;
    PERFORM bets_close_vote(f.id);

  WHEN 'cancel' THEN
    SELECT * INTO f FROM bet_fixtures WHERE id = (p_input->>'fixtureId')::integer AND club_id = club_key
      AND status IN ('open', 'locked', 'voting') FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Rencontre introuvable ou déjà réglée.', 'status', 404); END IF;
    FOR market_def IN SELECT jsonb_array_elements(bets_fixture_markets(f.markets, f.player_odds)) LOOP
      PERFORM bets_resolve(f.id, market_def->>'id', NULL);
    END LOOP;
    UPDATE bet_fixtures SET status = 'cancelled', settled_at = clock_timestamp() WHERE id = f.id;

  WHEN 'place' THEN
    SELECT * INTO f FROM bet_fixtures WHERE club_id = club_key AND status = 'open' FOR UPDATE;
    IF NOT FOUND OR f.id <> (p_input->>'fixtureId')::integer THEN
      RETURN jsonb_build_object('error', 'Les paris sont fermés : le match a commencé.', 'status', 409);
    END IF;
    SELECT member_id INTO my_member FROM club_player_claims WHERE account_id = p_account AND status = 'approved' LIMIT 1;
    FOR bet IN SELECT jsonb_array_elements(coalesce(p_input->'bets', '[]'::jsonb)) LOOP
      market_def := NULL; option_odds := NULL;
      -- Pas de pari sur soi-même (Crack, Casserole, Buteur, Maladroit).
      IF bet->>'market' IN ('crack', 'flop', 'scorer', 'clumsy') AND bet->>'option' = my_member::text THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'bets:self';
      END IF;
      SELECT m INTO market_def FROM jsonb_array_elements(bets_fixture_markets(f.markets, f.player_odds)) m WHERE m->>'id' = bet->>'market';
      SELECT (o->>'odds')::numeric INTO option_odds FROM jsonb_array_elements(market_def->'options') o WHERE o->>'id' = bet->>'option';
      -- Une exception plutôt qu'un RETURN : les mises déjà passées dans ce lot sont annulées avec.
      IF market_def IS NULL OR option_odds IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'bets:invalid';
      END IF;
      -- Changer d'avis : l'ancienne mise du même pari est rendue avant la nouvelle.
      SELECT * INTO old_slip FROM bet_slips WHERE fixture_id = f.id AND account_id = p_account AND market = bet->>'market' FOR UPDATE;
      IF FOUND THEN
        PERFORM bets_credit(p_account, old_slip.stake, 'refund', old_slip.id);
        DELETE FROM bet_slips WHERE id = old_slip.id;
      END IF;
      stake := (bet->>'stake')::integer;
      SELECT * INTO w FROM credit_wallets WHERE account_id = p_account FOR UPDATE;
      IF stake IS NULL OR stake <= 0 OR stake > w.balance THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'bets:insufficient';
      END IF;
      INSERT INTO bet_slips(fixture_id, account_id, market, option, stake, odds)
        VALUES (f.id, p_account, bet->>'market', bet->>'option', stake, option_odds) RETURNING id INTO new_slip;
      PERFORM bets_credit(p_account, -stake, 'stake', new_slip);
    END LOOP;

  WHEN 'unplace' THEN
    SELECT * INTO f FROM bet_fixtures WHERE club_id = club_key AND status = 'open' FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Les paris sont fermés : le match a commencé.', 'status', 409); END IF;
    SELECT * INTO old_slip FROM bet_slips WHERE fixture_id = f.id AND account_id = p_account AND market = p_input->>'market' FOR UPDATE;
    IF FOUND THEN
      PERFORM bets_credit(p_account, old_slip.stake, 'refund', old_slip.id);
      DELETE FROM bet_slips WHERE id = old_slip.id;
    END IF;

  WHEN 'vote' THEN
    SELECT * INTO f FROM bet_fixtures WHERE id = (p_input->>'fixtureId')::integer AND club_id = club_key AND status = 'voting';
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Ce vote est clos.', 'status', 409); END IF;
    target := (p_input->>'memberId')::integer;
    SELECT member_id INTO my_member FROM club_player_claims WHERE account_id = p_account AND status = 'approved' LIMIT 1;
    IF target = my_member THEN RETURN jsonb_build_object('error', 'Interdit de voter pour soi.', 'status', 403); END IF;
    IF coalesce(p_input->>'category', '') NOT IN ('crack', 'flop') OR NOT EXISTS(SELECT 1 FROM members WHERE id = target AND club_id = club_key) THEN
      RETURN jsonb_build_object('error', 'Vote invalide.', 'status', 400);
    END IF;
    INSERT INTO bet_votes(fixture_id, account_id, category, member_id) VALUES (f.id, p_account, p_input->>'category', target)
      ON CONFLICT (fixture_id, account_id, category) DO UPDATE SET member_id = excluded.member_id, updated_at = clock_timestamp();

  WHEN 'bailout' THEN
    UPDATE credit_wallets SET balance = balance + 100, bailout_at = clock_timestamp()
      WHERE account_id = p_account AND balance < 25 AND (bailout_at IS NULL OR bailout_at < now() - interval '24 hours')
        AND NOT EXISTS(SELECT 1 FROM bet_slips s WHERE s.account_id = p_account AND s.status = 'pending');
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Le prêt n’est possible qu’à sec, une fois par 24 h.', 'status', 409); END IF;
    INSERT INTO credit_ledger(account_id, amount, reason) VALUES (p_account, 100, 'bailout');

  ELSE
    RETURN jsonb_build_object('error', 'Action inconnue.', 'status', 400);
  END CASE;
  RETURN bets_snapshot(p_account, p_admin);
EXCEPTION WHEN raise_exception THEN
  IF SQLERRM = 'bets:insufficient' THEN
    RETURN jsonb_build_object('error', 'Solde insuffisant pour ces mises.', 'status', 409);
  ELSIF SQLERRM = 'bets:self' THEN
    RETURN jsonb_build_object('error', 'Pas de pari sur toi-même.', 'status', 403);
  ELSIF SQLERRM = 'bets:invalid' THEN
    RETURN jsonb_build_object('error', 'Ce pari n’existe pas.', 'status', 400);
  END IF;
  RAISE;
END;
$$;
--> statement-breakpoint
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
      'session', CASE WHEN c.status = 'locked' THEN bets_session(c.id) END,
      'markets', bets_fixture_markets(c.markets, c.player_odds), 'bettors', (SELECT count(DISTINCT account_id) FROM bet_slips WHERE fixture_id = c.id),
      'mySlips', coalesce((SELECT jsonb_agg(j ORDER BY id) FROM slips WHERE fixture_id = c.id), '[]'::jsonb)) FROM current c),
    'votes', coalesce((SELECT jsonb_agg(jsonb_build_object('id', f.id, 'openedAt', f.opened_at,
      'session', bets_session(f.id),
      -- Candidats : les joueurs de la soirée ; sans feuille de match, tout l'effectif actif.
      'candidates', coalesce((SELECT jsonb_agg(jsonb_build_object('memberId', mb.id, 'gamertag', mb.gamertag) ORDER BY mb.gamertag)
        FROM members mb WHERE mb.id = ANY(CASE WHEN jsonb_array_length(bets_session(f.id)->'players') > 0
          THEN ARRAY(SELECT (x->>'memberId')::integer FROM jsonb_array_elements(bets_session(f.id)->'players') x)
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
      FROM bet_fixtures f WHERE f.club_id = (SELECT id FROM club) AND f.status = 'voting'), '[]'::jsonb),
    'history', coalesce((SELECT jsonb_agg(h ORDER BY (h->>'id')::integer DESC) FROM (
      SELECT jsonb_build_object('id', f.id, 'status', f.status, 'settledAt', f.settled_at,
        'match', CASE WHEN m.id IS NULL THEN NULL ELSE jsonb_build_object('id', m.id, 'opponent', m.opponent_name,
          'goalsFor', m.goals_for, 'goalsAgainst', m.goals_against, 'result', m.result) END,
        'session', CASE WHEN f.locked_at IS NOT NULL AND f.ended_at IS NOT NULL THEN bets_session(f.id) END,
        'crack', (SELECT jsonb_agg(gamertag) FROM members WHERE id = ANY(f.crack_ids)),
        'flop', (SELECT jsonb_agg(gamertag) FROM members WHERE id = ANY(f.flop_ids)),
        'myVote', (SELECT member_id FROM bet_votes WHERE fixture_id = f.id AND account_id = p_account AND category = 'crack'),
        'results', bets_picks(f.id, p_account),
        'ballots', coalesce((SELECT jsonb_agg(jsonb_build_object('voter', bets_player_name(v.account_id), 'me', v.account_id = p_account,
            'memberId', v.member_id, 'gamertag', mb.gamertag) ORDER BY mb.gamertag, bets_player_name(v.account_id))
          FROM bet_votes v JOIN members mb ON mb.id = v.member_id WHERE v.fixture_id = f.id AND v.category = 'crack'), '[]'::jsonb),
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
