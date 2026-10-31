-- FoodBet : miser sur soi-même.
--
-- Permis au Crack et au Buteur (on gagne si on l'est), interdit au Maladroit et à la Casserole
-- (on pourrait rater exprès). Élu Crack ou meilleur buteur de la soirée alors qu'on avait misé
-- sur un autre : la mise de ce pari est rendue.
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
    -- Meilleur buteur de la soirée : son pari Buteur sur un autre lui est rendu.
    FOR sl IN SELECT b.* FROM bet_slips b JOIN club_player_claims c ON c.account_id = b.account_id AND c.status = 'approved'
        WHERE b.fixture_id = f.id AND b.market = 'scorer' AND b.status = 'pending' AND best > 0
          AND c.member_id IN (SELECT (x->>'memberId')::integer FROM jsonb_array_elements(s->'players') x WHERE (x->>'goals')::integer = best)
          AND b.option NOT IN (SELECT x->>'memberId' FROM jsonb_array_elements(s->'players') x WHERE (x->>'goals')::integer = best)
        FOR UPDATE OF b LOOP
      UPDATE bet_slips SET status = 'refunded', payout = sl.stake WHERE id = sl.id;
      PERFORM bets_credit(sl.account_id, sl.stake, 'refund', sl.id);
    END LOOP;
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
CREATE OR REPLACE FUNCTION bets_close_vote(p_fixture integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE cat text; leaders integer[]; s bet_slips%ROWTYPE;
BEGIN
  FOREACH cat IN ARRAY ARRAY['crack', 'flop'] LOOP
    SELECT array_agg(member_id ORDER BY member_id) INTO leaders FROM (
      SELECT member_id, count(*) AS n, max(count(*)) OVER () AS best FROM bet_votes
      WHERE fixture_id = p_fixture AND category = cat GROUP BY member_id) t WHERE n = best;
    -- Élu Crack de la soirée : son pari Crack sur un autre lui est rendu (sur lui-même, il gagne).
    IF cat = 'crack' AND leaders IS NOT NULL THEN
      FOR s IN SELECT b.* FROM bet_slips b JOIN club_player_claims c ON c.account_id = b.account_id AND c.status = 'approved'
          WHERE b.fixture_id = p_fixture AND b.market = 'crack' AND b.status = 'pending' AND c.member_id = ANY(leaders)
            AND NOT (b.option::integer = ANY(leaders)) FOR UPDATE OF b LOOP
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
      -- Sur soi-même : oui au Crack et au Buteur ; jamais au Maladroit ni à la Casserole (on pourrait rater exprès).
      IF bet->>'market' IN ('flop', 'clumsy') AND bet->>'option' = my_member::text THEN
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
