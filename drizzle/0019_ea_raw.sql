-- Réponses EA brutes et abandon adverse.
--
-- EA ne garde que les 10 derniers matchs de chaque type : tout champ non conservé à la
-- synchro est perdu pour de bon. `ea_raw` garde la réponse complète (les deux équipes,
-- temps de jeu, arrêts, attributs des Pros…) pour que les futures pages s'appliquent
-- aussi aux matchs déjà joués. Rempli par server/ea-sync.ts, jamais lu par le navigateur.
--
-- `opponent_quit` : l'adversaire a quitté le match (`winnerByDnf` côté EA). null : inconnu,
-- c'est le cas de tous les matchs synchronisés avant cette migration.
ALTER TABLE clubs ADD COLUMN ea_raw jsonb;--> statement-breakpoint
ALTER TABLE members ADD COLUMN ea_raw jsonb;--> statement-breakpoint
ALTER TABLE matches ADD COLUMN ea_raw jsonb;--> statement-breakpoint
ALTER TABLE matches ADD COLUMN opponent_quit boolean;--> statement-breakpoint
-- Nouveau pari du match : « Abandon adverse », réglé par `opponent_quit`.
ALTER TABLE bet_slips DROP CONSTRAINT bet_slips_market_check;--> statement-breakpoint
ALTER TABLE bet_slips ADD CONSTRAINT bet_slips_market_check
  CHECK (market IN ('verdict', 'goals', 'cleansheet', 'red', 'ragequit', 'crack', 'flop'));--> statement-breakpoint
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
    -- Abandon inconnu (ancienne synchro) : remboursement.
    PERFORM bets_resolve(f.id, 'ragequit', CASE WHEN m.opponent_quit IS NULL THEN NULL
      WHEN m.opponent_quit THEN ARRAY['oui'] ELSE ARRAY['non'] END);
    -- Un Crack ou une Casserole sur un joueur absent du match est remboursé.
    played := bets_match_players(m.id);
    IF cardinality(played) > 0 THEN
      FOR s IN SELECT * FROM bet_slips WHERE fixture_id = f.id AND market IN ('crack', 'flop')
          AND status = 'pending' AND NOT (option::integer = ANY(played)) FOR UPDATE LOOP
        UPDATE bet_slips SET status = 'refunded', payout = s.stake WHERE id = s.id;
        PERFORM bets_credit(s.account_id, s.stake, 'refund', s.id);
      END LOOP;
    END IF;
    -- Pari du match réglé par le score : pas de vote à attendre.
    IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(bets_fixture_markets(f.markets, f.player_odds)) x WHERE x->>'id' IN ('crack', 'flop')) THEN
      UPDATE bet_fixtures SET status = 'settled', settled_at = clock_timestamp() WHERE id = f.id;
    END IF;
  END LOOP;
END;
$$;
