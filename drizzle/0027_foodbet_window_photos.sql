-- FoodBet : le guichet des retardataires, et les photos des joueurs.
--
-- Guichet : pendant la session, l'admin ouvre 3 minutes de paris entre deux matchs (fermé aussi dès
-- qu'un match se termine). Cotes en direct (`window_markets`, calculées par server/db/bets.ts sur la
-- soirée en cours) ; un pari déjà placé ne se change plus ; mise max un quart du solde ; pas de bonus
-- de ticket. Les mises du guichet sont marquées `late`.
--
-- Photos : une photo par joueur (data URL WebP, 420 px), envoyée depuis l'app.
ALTER TABLE bet_fixtures ADD COLUMN window_from timestamp with time zone;
--> statement-breakpoint
ALTER TABLE bet_fixtures ADD COLUMN window_until timestamp with time zone;
--> statement-breakpoint
ALTER TABLE bet_fixtures ADD COLUMN window_markets jsonb;
--> statement-breakpoint
ALTER TABLE bet_slips ADD COLUMN late boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE TABLE player_photos (
  member_id integer PRIMARY KEY REFERENCES members(id) ON DELETE CASCADE,
  image text NOT NULL CHECK (length(image) < 400000),
  account_id integer REFERENCES club_accounts(id) ON DELETE SET NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
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
  late boolean := false;
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

  IF p_action IN ('open', 'lock', 'window', 'end-session', 'close-vote', 'cancel') AND NOT p_admin THEN
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

  WHEN 'window' THEN
    -- Le guichet des retardataires : 3 minutes entre deux matchs, avec les cotes en direct.
    SELECT * INTO f FROM bet_fixtures WHERE club_id = club_key AND status = 'locked' FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Le guichet ne s’ouvre que pendant la session.', 'status', 409); END IF;
    IF p_input->'markets' IS NULL THEN RETURN jsonb_build_object('error', 'Cotes du guichet manquantes.', 'status', 400); END IF;
    UPDATE bet_fixtures SET window_from = clock_timestamp(), window_until = clock_timestamp() + interval '3 minutes',
      window_markets = p_input->'markets' WHERE id = f.id;

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
    -- Ticket avant le coup d'envoi, ou guichet ouvert pendant la session.
    SELECT * INTO f FROM bet_fixtures bf WHERE bf.club_id = club_key AND (bf.status = 'open' OR (bf.status = 'locked' AND bf.window_until > clock_timestamp() AND NOT EXISTS(SELECT 1 FROM matches mw WHERE mw.club_id = bf.club_id AND mw.played_at > bf.window_from))) FOR UPDATE OF bf;
    IF NOT FOUND OR f.id <> (p_input->>'fixtureId')::integer THEN
      RETURN jsonb_build_object('error', 'Les paris sont fermés : attends que l’admin ouvre le guichet.', 'status', 409);
    END IF;
    late := f.status = 'locked';
    SELECT member_id INTO my_member FROM club_player_claims WHERE account_id = p_account AND status = 'approved' LIMIT 1;
    FOR bet IN SELECT jsonb_array_elements(coalesce(p_input->'bets', '[]'::jsonb)) LOOP
      market_def := NULL; option_odds := NULL;
      -- Sur soi-même : oui au Crack et au Buteur ; jamais au Maladroit ni à la Casserole (on pourrait rater exprès).
      IF bet->>'market' IN ('flop', 'clumsy') AND bet->>'option' = my_member::text THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'bets:self';
      END IF;
      SELECT m INTO market_def FROM jsonb_array_elements(CASE WHEN late THEN f.window_markets ELSE bets_fixture_markets(f.markets, f.player_odds) END) m
        WHERE m->>'id' = bet->>'market';
      SELECT (o->>'odds')::numeric INTO option_odds FROM jsonb_array_elements(market_def->'options') o WHERE o->>'id' = bet->>'option';
      -- Une exception plutôt qu'un RETURN : les mises déjà passées dans ce lot sont annulées avec.
      IF market_def IS NULL OR option_odds IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'bets:invalid';
      END IF;
      -- Changer d'avis : l'ancienne mise du même pari est rendue avant la nouvelle.
      SELECT * INTO old_slip FROM bet_slips WHERE fixture_id = f.id AND account_id = p_account AND market = bet->>'market' FOR UPDATE;
      IF FOUND AND late THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'bets:placed';
      END IF;
      IF FOUND THEN
        PERFORM bets_credit(p_account, old_slip.stake, 'refund', old_slip.id);
        DELETE FROM bet_slips WHERE id = old_slip.id;
      END IF;
      stake := (bet->>'stake')::integer;
      SELECT * INTO w FROM credit_wallets WHERE account_id = p_account FOR UPDATE;
      IF stake IS NULL OR stake <= 0 OR stake > w.balance THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'bets:insufficient';
      END IF;
      -- Mise max par pari : la moitié du solde (jusqu'à 50 quand le solde est petit), pour ne pas tout perdre d'un coup.
      -- Au guichet : un quart du solde (jusqu'à 25 quand le solde est petit).
      IF (NOT late AND stake > greatest(ceil(w.balance / 2.0)::integer, least(w.balance, 50)))
        OR (late AND stake > greatest(ceil(w.balance / 4.0)::integer, least(w.balance, 25))) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'bets:cap';
      END IF;
      INSERT INTO bet_slips(fixture_id, account_id, market, option, stake, odds, late)
        VALUES (f.id, p_account, bet->>'market', bet->>'option', stake, option_odds, late) RETURNING id INTO new_slip;
      PERFORM bets_credit(p_account, -stake, 'stake', new_slip);
    END LOOP;
    -- Ticket complet : +25 crédits, une fois par soirée (pas au guichet).
    IF NOT late AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(bets_fixture_markets(f.markets, f.player_odds)) x
        WHERE NOT EXISTS(SELECT 1 FROM bet_slips s WHERE s.fixture_id = f.id AND s.account_id = p_account AND s.market = x->>'id'))
      AND NOT EXISTS(SELECT 1 FROM credit_ledger WHERE account_id = p_account AND reason = 'ticket' AND fixture_id = f.id) THEN
      UPDATE credit_wallets SET balance = balance + 25 WHERE account_id = p_account;
      INSERT INTO credit_ledger(account_id, amount, reason, fixture_id) VALUES (p_account, 25, 'ticket', f.id);
    END IF;

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
  ELSIF SQLERRM = 'bets:cap' THEN
    RETURN jsonb_build_object('error', 'Mise trop forte pour ce pari (la moitié de ton solde, un quart au guichet).', 'status', 409);
  ELSIF SQLERRM = 'bets:placed' THEN
    RETURN jsonb_build_object('error', 'Déjà joué : au guichet, un pari placé ne se change plus.', 'status', 409);
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
      'stake', s.stake, 'odds', s.odds, 'status', s.status, 'payout', s.payout, 'late', s.late) AS j
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
      'window', CASE WHEN c.status = 'locked' AND c.window_until > clock_timestamp() AND NOT EXISTS(SELECT 1 FROM matches mw WHERE mw.club_id = c.club_id AND mw.played_at > c.window_from) THEN jsonb_build_object('until', c.window_until, 'markets', c.window_markets) END,
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
