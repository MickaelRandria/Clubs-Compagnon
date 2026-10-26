-- Vestiaire Bets, phase 2 : paris d'avant-match en crédits, réglés par la synchro EA.
--
-- Déroulé : l'admin ouvre les paris (bet_fixtures 'open'), tape « Coup d'envoi »
-- ('locked'). Le premier match EA terminé après le verrouillage est relié à la
-- rencontre : Verdict, Buts, Mur et Rouge sont réglés aussitôt, puis le vote
-- Crack / Casserole s'ouvre ('voting'). Sa clôture règle les deux derniers paris
-- ('settled'). Tout compte Discord parie ; personne ne vote pour son propre joueur.
--
-- Le pilote Neon HTTP n'a pas de transaction interactive : chaque opération sur les
-- crédits passe par bets_dispatch, une seule fonction, donc une seule transaction.
CREATE TABLE credit_wallets (
  account_id integer PRIMARY KEY REFERENCES club_accounts(id) ON DELETE CASCADE,
  balance integer NOT NULL CHECK (balance >= 0),
  bailout_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE TABLE bet_fixtures (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  club_id integer NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'locked', 'voting', 'settled', 'cancelled')),
  -- Cotes Crack / Casserole figées à l'ouverture : [{memberId, gamertag, crack, flop}].
  player_odds jsonb NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  opened_by integer REFERENCES club_accounts(id) ON DELETE SET NULL,
  locked_at timestamptz,
  match_id bigint UNIQUE REFERENCES matches(id) ON DELETE SET NULL,
  settled_at timestamptz,
  crack_ids integer[],
  flop_ids integer[]
);--> statement-breakpoint
-- Une seule rencontre à parier à la fois. Les votes des matchs précédents peuvent rester ouverts.
CREATE UNIQUE INDEX bet_fixture_pending ON bet_fixtures(club_id) WHERE status IN ('open', 'locked');--> statement-breakpoint
CREATE TABLE bet_slips (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  fixture_id integer NOT NULL REFERENCES bet_fixtures(id) ON DELETE CASCADE,
  account_id integer NOT NULL REFERENCES club_accounts(id) ON DELETE CASCADE,
  market text NOT NULL CHECK (market IN ('verdict', 'goals', 'cleansheet', 'red', 'crack', 'flop')),
  option text NOT NULL,
  stake integer NOT NULL CHECK (stake > 0),
  odds numeric(5,2) NOT NULL CHECK (odds >= 1),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'won', 'lost', 'refunded')),
  payout integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fixture_id, account_id, market)
);--> statement-breakpoint
CREATE INDEX bet_slips_account_idx ON bet_slips(account_id, id DESC);--> statement-breakpoint
CREATE TABLE bet_votes (
  fixture_id integer NOT NULL REFERENCES bet_fixtures(id) ON DELETE CASCADE,
  account_id integer NOT NULL REFERENCES club_accounts(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('crack', 'flop')),
  member_id integer NOT NULL REFERENCES members(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (fixture_id, account_id, category)
);--> statement-breakpoint
-- Journal des crédits : chaque mouvement y est écrit, rien n'y est jamais modifié.
CREATE TABLE credit_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id integer NOT NULL REFERENCES club_accounts(id) ON DELETE CASCADE,
  amount integer NOT NULL,
  reason text NOT NULL CHECK (reason IN ('welcome', 'stake', 'payout', 'refund', 'bailout')),
  slip_id integer REFERENCES bet_slips(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX credit_ledger_account_idx ON credit_ledger(account_id, id DESC);--> statement-breakpoint

-- Paris à cotes fixes, calées sur le bilan du club (44 % de victoires, 2,9 buts par match,
-- 12 % de clean sheets). Seule source des cotes : le client ne les envoie jamais.
CREATE OR REPLACE FUNCTION bets_fixed_markets() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT '[
    {"id": "verdict", "options": [{"id": "win", "label": "Victoire", "odds": 2.00}, {"id": "draw", "label": "Nul", "odds": 5.50}, {"id": "loss", "label": "Défaite", "odds": 2.00}]},
    {"id": "goals", "options": [{"id": "0-1", "label": "0 ou 1", "odds": 3.30}, {"id": "2-3", "label": "2 ou 3", "odds": 2.20}, {"id": "4+", "label": "4 et plus", "odds": 2.60}]},
    {"id": "cleansheet", "options": [{"id": "oui", "label": "Oui", "odds": 5.00}, {"id": "non", "label": "Non", "odds": 1.10}]},
    {"id": "red", "options": [{"id": "oui", "label": "Oui", "odds": 4.00}, {"id": "non", "label": "Non", "odds": 1.15}]}
  ]'::jsonb;
$$;--> statement-breakpoint

-- Toutes les options d'une rencontre, cotes comprises.
CREATE OR REPLACE FUNCTION bets_markets(p_player_odds jsonb) RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT jsonb_build_array(
    jsonb_build_object('id', 'crack', 'options', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', (o->>'memberId'), 'label', o->>'gamertag', 'odds', (o->>'crack')::numeric) ORDER BY (o->>'crack')::numeric)
      FROM jsonb_array_elements(p_player_odds) o), '[]'::jsonb)),
    jsonb_build_object('id', 'flop', 'options', coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', (o->>'memberId'), 'label', o->>'gamertag', 'odds', (o->>'flop')::numeric) ORDER BY (o->>'flop')::numeric)
      FROM jsonb_array_elements(p_player_odds) o), '[]'::jsonb))
  ) || bets_fixed_markets();
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION bets_credit(p_account integer, p_amount integer, p_reason text, p_slip integer)
RETURNS void LANGUAGE sql AS $$
  UPDATE credit_wallets SET balance = balance + p_amount WHERE account_id = p_account;
  INSERT INTO credit_ledger(account_id, amount, reason, slip_id) VALUES (p_account, p_amount, p_reason, p_slip);
$$;--> statement-breakpoint

/** Règle des paris en attente : gagnés (gain crédité), perdus ou remboursés. Idempotent. */
CREATE OR REPLACE FUNCTION bets_resolve(p_fixture integer, p_market text, p_winners text[])
RETURNS void LANGUAGE plpgsql AS $$
DECLARE s bet_slips%ROWTYPE;
BEGIN
  FOR s IN SELECT * FROM bet_slips WHERE fixture_id = p_fixture AND market = p_market AND status = 'pending' FOR UPDATE LOOP
    IF p_winners IS NULL THEN
      UPDATE bet_slips SET status = 'refunded', payout = s.stake WHERE id = s.id;
      PERFORM bets_credit(s.account_id, s.stake, 'refund', s.id);
    ELSIF s.option = ANY(p_winners) THEN
      UPDATE bet_slips SET status = 'won', payout = floor(s.stake * s.odds)::integer WHERE id = s.id;
      PERFORM bets_credit(s.account_id, floor(s.stake * s.odds)::integer, 'payout', s.id);
    ELSE
      UPDATE bet_slips SET status = 'lost', payout = 0 WHERE id = s.id;
    END IF;
  END LOOP;
END;
$$;--> statement-breakpoint

/** Joueurs du club présents sur la feuille de match EA (vide si la feuille manque). */
CREATE OR REPLACE FUNCTION bets_match_players(p_match bigint) RETURNS integer[] LANGUAGE sql STABLE AS $$
  SELECT coalesce(array_agg(DISTINCT mb.id), '{}') FROM matches m
    CROSS JOIN LATERAL jsonb_array_elements(coalesce(m.player_stats, '[]'::jsonb)) p
    JOIN members mb ON mb.club_id = m.club_id AND mb.gamertag = p->>'gamertag'
    WHERE m.id = p_match;
$$;--> statement-breakpoint

/** Clôt le vote Crack / Casserole et règle les deux paris. Égalité : tous les ex æquo gagnent. */
CREATE OR REPLACE FUNCTION bets_close_vote(p_fixture integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE cat text; leaders integer[];
BEGIN
  FOREACH cat IN ARRAY ARRAY['crack', 'flop'] LOOP
    SELECT array_agg(member_id ORDER BY member_id) INTO leaders FROM (
      SELECT member_id, count(*) AS n, max(count(*)) OVER () AS best FROM bet_votes
      WHERE fixture_id = p_fixture AND category = cat GROUP BY member_id) t WHERE n = best;
    PERFORM bets_resolve(p_fixture, cat, CASE WHEN leaders IS NULL THEN NULL ELSE leaders::text[] END);
    IF cat = 'crack' THEN UPDATE bet_fixtures SET crack_ids = leaders WHERE id = p_fixture;
    ELSE UPDATE bet_fixtures SET flop_ids = leaders WHERE id = p_fixture; END IF;
  END LOOP;
  UPDATE bet_fixtures SET status = 'settled', settled_at = clock_timestamp() WHERE id = p_fixture;
END;
$$;--> statement-breakpoint

/**
 * Relie les rencontres verrouillées au match EA joué ensuite et règle ce que le score
 * suffit à trancher. Appelée après chaque synchro EA et à chaque lecture de l'état.
 */
CREATE OR REPLACE FUNCTION bets_settle() RETURNS void LANGUAGE plpgsql AS $$
DECLARE f bet_fixtures%ROWTYPE; m matches%ROWTYPE; s bet_slips%ROWTYPE; played integer[];
BEGIN
  -- Coup d'envoi oublié : un match s'est terminé alors que les paris étaient ouverts.
  -- Les mises des 20 dernières minutes avant la fin ont pu être faites en voyant le score.
  FOR f IN SELECT * FROM bet_fixtures WHERE status = 'open' FOR UPDATE LOOP
    SELECT * INTO m FROM matches WHERE club_id = f.club_id AND played_at > f.opened_at
      AND NOT EXISTS(SELECT 1 FROM bet_fixtures b WHERE b.match_id = matches.id) ORDER BY played_at LIMIT 1;
    CONTINUE WHEN NOT FOUND;
    FOR s IN SELECT * FROM bet_slips WHERE fixture_id = f.id AND status = 'pending'
        AND created_at > m.played_at - interval '20 minutes' FOR UPDATE LOOP
      UPDATE bet_slips SET status = 'refunded', payout = s.stake WHERE id = s.id;
      PERFORM bets_credit(s.account_id, s.stake, 'refund', s.id);
    END LOOP;
    UPDATE bet_fixtures SET status = 'locked', locked_at = f.opened_at WHERE id = f.id;
  END LOOP;

  FOR f IN SELECT * FROM bet_fixtures WHERE status = 'locked' AND match_id IS NULL ORDER BY id FOR UPDATE LOOP
    SELECT * INTO m FROM matches WHERE club_id = f.club_id AND played_at > f.locked_at
      AND NOT EXISTS(SELECT 1 FROM bet_fixtures b WHERE b.match_id = matches.id) ORDER BY played_at LIMIT 1;
    CONTINUE WHEN NOT FOUND;
    UPDATE bet_fixtures SET match_id = m.id, status = 'voting' WHERE id = f.id;
    PERFORM bets_resolve(f.id, 'verdict', ARRAY[m.result::text]);
    PERFORM bets_resolve(f.id, 'goals', ARRAY[CASE WHEN m.goals_for <= 1 THEN '0-1' WHEN m.goals_for <= 3 THEN '2-3' ELSE '4+' END]);
    PERFORM bets_resolve(f.id, 'cleansheet', ARRAY[CASE WHEN m.goals_against = 0 THEN 'oui' ELSE 'non' END]);
    -- Sans feuille de match, on ne sait rien des cartons : remboursement.
    PERFORM bets_resolve(f.id, 'red', CASE WHEN m.player_stats IS NULL OR jsonb_array_length(m.player_stats) = 0 THEN NULL
      WHEN EXISTS(SELECT 1 FROM jsonb_array_elements(m.player_stats) p WHERE (p->>'redCards')::integer > 0) THEN ARRAY['oui'] ELSE ARRAY['non'] END);
    -- Un Crack ou une Casserole sur un joueur absent du match est remboursé.
    played := bets_match_players(m.id);
    IF cardinality(played) > 0 THEN
      FOR s IN SELECT * FROM bet_slips WHERE fixture_id = f.id AND market IN ('crack', 'flop')
          AND status = 'pending' AND NOT (option::integer = ANY(played)) FOR UPDATE LOOP
        UPDATE bet_slips SET status = 'refunded', payout = s.stake WHERE id = s.id;
        PERFORM bets_credit(s.account_id, s.stake, 'refund', s.id);
      END LOOP;
    END IF;
  END LOOP;
END;
$$;--> statement-breakpoint

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
    'fixture', (SELECT jsonb_build_object('id', c.id, 'status', c.status, 'openedAt', c.opened_at, 'lockedAt', c.locked_at,
      'markets', bets_markets(c.player_odds), 'bettors', (SELECT count(DISTINCT account_id) FROM bet_slips WHERE fixture_id = c.id),
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
      'markets', bets_markets(f.player_odds),
      'mySlips', coalesce((SELECT jsonb_agg(j ORDER BY id) FROM slips WHERE fixture_id = f.id), '[]'::jsonb)) ORDER BY f.id DESC)
      FROM bet_fixtures f JOIN matches m ON m.id = f.match_id WHERE f.club_id = (SELECT id FROM club) AND f.status = 'voting'), '[]'::jsonb),
    'history', coalesce((SELECT jsonb_agg(h ORDER BY (h->>'id')::integer DESC) FROM (
      SELECT jsonb_build_object('id', f.id, 'status', f.status, 'settledAt', f.settled_at,
        'match', CASE WHEN m.id IS NULL THEN NULL ELSE jsonb_build_object('id', m.id, 'opponent', m.opponent_name,
          'goalsFor', m.goals_for, 'goalsAgainst', m.goals_against, 'result', m.result) END,
        'crack', (SELECT jsonb_agg(gamertag) FROM members WHERE id = ANY(f.crack_ids)),
        'flop', (SELECT jsonb_agg(gamertag) FROM members WHERE id = ANY(f.flop_ids)),
        'markets', bets_markets(f.player_odds),
        'mySlips', coalesce((SELECT jsonb_agg(j ORDER BY id) FROM slips WHERE fixture_id = f.id), '[]'::jsonb)) h
      FROM bet_fixtures f LEFT JOIN matches m ON m.id = f.match_id
      WHERE f.club_id = (SELECT id FROM club) AND f.status IN ('settled', 'cancelled')
        AND EXISTS(SELECT 1 FROM bet_slips s WHERE s.fixture_id = f.id AND s.account_id = p_account)
      ORDER BY f.id DESC LIMIT 5) x), '[]'::jsonb),
    'leaderboard', coalesce((SELECT jsonb_agg(jsonb_build_object('accountId', a.id, 'name', coalesce(a.display_name, a.username),
      'balance', w.balance, 'me', a.id = p_account) ORDER BY w.balance DESC, a.id)
      FROM (SELECT * FROM credit_wallets ORDER BY balance DESC, account_id LIMIT 10) w JOIN club_accounts a ON a.id = w.account_id), '[]'::jsonb)
  );
$$;--> statement-breakpoint

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

  IF p_action IN ('open', 'lock', 'close-vote', 'cancel') AND NOT p_admin THEN
    RETURN jsonb_build_object('error', 'Réservé à l’administrateur du club.', 'status', 403);
  END IF;

  CASE p_action
  WHEN 'state' THEN NULL;

  WHEN 'open' THEN
    IF EXISTS(SELECT 1 FROM bet_fixtures WHERE club_id = club_key AND status IN ('open', 'locked')) THEN
      RETURN jsonb_build_object('error', 'Des paris sont déjà ouverts ou en cours.', 'status', 409);
    END IF;
    IF jsonb_array_length(coalesce(p_input->'playerOdds', '[]'::jsonb)) = 0 THEN
      RETURN jsonb_build_object('error', 'Aucun joueur actif pour ouvrir les paris.', 'status', 400);
    END IF;
    -- Ouvrir le match suivant clôt les votes encore ouverts : un seul geste pour l'admin.
    FOR f IN SELECT * FROM bet_fixtures WHERE club_id = club_key AND status = 'voting' ORDER BY id LOOP
      PERFORM bets_close_vote(f.id);
    END LOOP;
    INSERT INTO bet_fixtures(club_id, player_odds, opened_by) VALUES (club_key, p_input->'playerOdds', p_account);

  WHEN 'lock' THEN
    UPDATE bet_fixtures SET status = 'locked', locked_at = clock_timestamp()
      WHERE club_id = club_key AND status = 'open' RETURNING * INTO f;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Aucun pari ouvert à verrouiller.', 'status', 409); END IF;

  WHEN 'close-vote' THEN
    SELECT * INTO f FROM bet_fixtures WHERE id = (p_input->>'fixtureId')::integer AND club_id = club_key AND status = 'voting' FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Ce vote est déjà clos.', 'status', 409); END IF;
    PERFORM bets_close_vote(f.id);

  WHEN 'cancel' THEN
    SELECT * INTO f FROM bet_fixtures WHERE id = (p_input->>'fixtureId')::integer AND club_id = club_key
      AND status IN ('open', 'locked', 'voting') FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Rencontre introuvable ou déjà réglée.', 'status', 404); END IF;
    FOR market_def IN SELECT jsonb_array_elements(bets_markets(f.player_odds)) LOOP
      PERFORM bets_resolve(f.id, market_def->>'id', NULL);
    END LOOP;
    UPDATE bet_fixtures SET status = 'cancelled', settled_at = clock_timestamp() WHERE id = f.id;

  WHEN 'place' THEN
    SELECT * INTO f FROM bet_fixtures WHERE club_id = club_key AND status = 'open' FOR UPDATE;
    IF NOT FOUND OR f.id <> (p_input->>'fixtureId')::integer THEN
      RETURN jsonb_build_object('error', 'Les paris sont fermés : le match a commencé.', 'status', 409);
    END IF;
    FOR bet IN SELECT jsonb_array_elements(coalesce(p_input->'bets', '[]'::jsonb)) LOOP
      market_def := NULL; option_odds := NULL;
      SELECT m INTO market_def FROM jsonb_array_elements(bets_markets(f.player_odds)) m WHERE m->>'id' = bet->>'market';
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
  ELSIF SQLERRM = 'bets:invalid' THEN
    RETURN jsonb_build_object('error', 'Ce pari n’existe pas.', 'status', 400);
  END IF;
  RAISE;
END;
$$;
