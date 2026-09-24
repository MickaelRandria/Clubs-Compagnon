-- Le vote du nom devient un tournoi en plusieurs étapes, chacune close à la main par l'admin.
--
-- 1. Premier tour : jusqu'à trois choix par compte, modifiables tant que l'étape est ouverte.
-- 2. Les noms qui ont reçu au moins une voix restent en course :
--    plus de 4 → second tour (trois choix, les 4 premiers passent) ; 4 → demi-finales ;
--    3 → podium ; 2 → finale ; 1 → vainqueur direct.
-- 3. Demi-finales (1 contre 4, 2 contre 3, une voix par duel), puis finale (une voix).
-- Une égalité qui décide d'une qualification ou du titre est tranchée par l'admin.
-- La logique est dupliquée côté client dans shared/fc27-bracket.ts pour l'aperçu : garder les deux alignées.
CREATE TABLE "fc27_name_stages" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "campaign_id" integer NOT NULL REFERENCES "fc27_name_elections"("campaign_id") ON DELETE CASCADE,
  "number" smallint NOT NULL CHECK ("number" between 1 and 20),
  "kind" text NOT NULL CHECK ("kind" in ('qualif', 'repechage', 'semis', 'final', 'podium')),
  "max_choices" smallint NOT NULL CHECK ("max_choices" between 1 and 3),
  "opened_at" timestamptz NOT NULL DEFAULT now(),
  "closed_at" timestamptz,
  "tie_break_applied" boolean NOT NULL DEFAULT false,
  CONSTRAINT "fc27_stage_number_key" UNIQUE ("campaign_id", "number"),
  CONSTRAINT "fc27_stage_campaign_key" UNIQUE ("id", "campaign_id")
);--> statement-breakpoint
-- Une seule étape ouverte à la fois par campagne.
CREATE UNIQUE INDEX "fc27_stage_open_key" ON "fc27_name_stages" ("campaign_id") WHERE "closed_at" IS NULL;--> statement-breakpoint
CREATE TABLE "fc27_name_stage_entries" (
  "stage_id" integer NOT NULL,
  "campaign_id" integer NOT NULL,
  "proposal_id" integer NOT NULL,
  -- Rang d'entrée dans l'étape (1 = meilleur score de l'étape précédente).
  "seed" smallint NOT NULL CHECK ("seed" between 1 and 200),
  -- Demi-finales seulement : 1 = têtes de série 1 et 4, 2 = têtes de série 2 et 3.
  "duel" smallint CHECK ("duel" in (1, 2)),
  "final_votes" integer CHECK ("final_votes" >= 0),
  "result" text CHECK ("result" in ('advanced', 'eliminated', 'winner', 'runner_up', 'third')),
  PRIMARY KEY ("stage_id", "proposal_id"),
  FOREIGN KEY ("stage_id", "campaign_id") REFERENCES "fc27_name_stages"("id", "campaign_id") ON DELETE CASCADE,
  FOREIGN KEY ("proposal_id", "campaign_id") REFERENCES "fc27_name_proposals"("id", "campaign_id") ON DELETE CASCADE
);--> statement-breakpoint
-- Les voix d'avant les étapes gardent stage_id NULL et leur ancienne règle (une par compte et par campagne).
ALTER TABLE "fc27_name_votes" ADD COLUMN "stage_id" integer;--> statement-breakpoint
-- Une voix ne peut viser qu'un nom encore en jeu dans l'étape.
ALTER TABLE "fc27_name_votes" ADD CONSTRAINT "fc27_name_votes_stage_entry_fk" FOREIGN KEY ("stage_id", "proposal_id")
  REFERENCES "fc27_name_stage_entries"("stage_id", "proposal_id") ON DELETE CASCADE;--> statement-breakpoint
DROP INDEX IF EXISTS "fc27_name_vote_account_key";--> statement-breakpoint
CREATE UNIQUE INDEX "fc27_name_vote_account_key" ON "fc27_name_votes" ("campaign_id", "voter_account_id")
  WHERE "voter_account_id" IS NOT NULL AND "stage_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "fc27_name_vote_stage_key" ON "fc27_name_votes" ("stage_id", "voter_account_id", "proposal_id")
  WHERE "stage_id" IS NOT NULL;--> statement-breakpoint
-- Un vote déjà ouvert devient le premier tour ; ses voix deviennent des choix de ce tour.
INSERT INTO "fc27_name_stages"("campaign_id", "number", "kind", "max_choices", "opened_at")
  SELECT campaign_id, 1, 'qualif', 3, started_at FROM "fc27_name_elections" WHERE phase = 'voting';--> statement-breakpoint
INSERT INTO "fc27_name_stage_entries"("stage_id", "campaign_id", "proposal_id", "seed")
  SELECT s.id, s.campaign_id, p.id, row_number() OVER (PARTITION BY s.id ORDER BY p.id)
  FROM "fc27_name_stages" s JOIN "fc27_name_proposals" p ON p.campaign_id = s.campaign_id;--> statement-breakpoint
UPDATE "fc27_name_votes" v SET stage_id = s.id FROM "fc27_name_stages" s
  WHERE s.campaign_id = v.campaign_id AND s.number = 1 AND v.stage_id IS NULL;--> statement-breakpoint
-- La signature change (compte du visiteur, pour renvoyer son bulletin) : l'ancienne serait ambiguë.
DROP FUNCTION IF EXISTS fc27_snapshot(integer);--> statement-breakpoint
CREATE FUNCTION fc27_snapshot(p_campaign integer, p_account integer DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'campaign', to_jsonb(c) - 'expected_voters',
    'server_time', clock_timestamp(),
    'election', (SELECT to_jsonb(e) FROM fc27_name_elections e WHERE e.campaign_id = c.id),
    -- `votes` = score du premier tour (ou de l'unique tour, pour les campagnes d'avant les étapes).
    'proposals', coalesce((SELECT jsonb_agg(to_jsonb(p) || jsonb_build_object('votes',
      coalesce(p.final_votes, (SELECT count(*) FROM fc27_name_votes v WHERE v.proposal_id = p.id
        AND v.stage_id IS NOT DISTINCT FROM (SELECT min(s.id) FROM fc27_name_stages s WHERE s.campaign_id = c.id)))) ORDER BY p.id)
      FROM fc27_name_proposals p WHERE p.campaign_id = c.id), '[]'::jsonb),
    'stages', coalesce((SELECT jsonb_agg(to_jsonb(s) - 'campaign_id' || jsonb_build_object(
        'voters', (SELECT count(DISTINCT v.voter_account_id) FROM fc27_name_votes v WHERE v.stage_id = s.id),
        'entries', (SELECT jsonb_agg(jsonb_build_object('proposal_id', en.proposal_id, 'seed', en.seed, 'duel', en.duel, 'result', en.result,
            'votes', coalesce(en.final_votes, (SELECT count(*) FROM fc27_name_votes v WHERE v.stage_id = s.id AND v.proposal_id = en.proposal_id)))
          ORDER BY en.duel NULLS FIRST, en.seed) FROM fc27_name_stage_entries en WHERE en.stage_id = s.id)
      ) ORDER BY s.number) FROM fc27_name_stages s WHERE s.campaign_id = c.id), '[]'::jsonb),
    -- Le bulletin du visiteur pour l'étape ouverte : de quoi pré-cocher ses choix et les modifier.
    'my_ballot', coalesce((SELECT jsonb_agg(v.proposal_id ORDER BY v.proposal_id) FROM fc27_name_votes v
      JOIN fc27_name_stages s ON s.id = v.stage_id AND s.closed_at IS NULL
      WHERE s.campaign_id = c.id AND p_account IS NOT NULL AND v.voter_account_id = p_account), '[]'::jsonb),
    'players', coalesce((SELECT jsonb_agg(to_jsonb(p) || jsonb_build_object('secondary_positions',
      coalesce((SELECT jsonb_agg(s.position ORDER BY s.position) FROM fc27_player_secondary_positions s WHERE s.profile_id = p.id), '[]'::jsonb)
    ) ORDER BY p.id) FROM fc27_player_profiles p WHERE p.campaign_id = c.id), '[]'::jsonb),
    -- Score du vainqueur = celui de sa dernière étape (la finale, le plus souvent).
    'winner', (SELECT to_jsonb(p) || jsonb_build_object('votes', coalesce((SELECT en.final_votes FROM fc27_name_stage_entries en
        JOIN fc27_name_stages s ON s.id = en.stage_id WHERE en.proposal_id = p.id ORDER BY s.number DESC LIMIT 1), p.final_votes))
      FROM fc27_name_proposals p
      JOIN fc27_name_elections e ON e.winner_proposal_id = p.id WHERE e.campaign_id = c.id AND e.phase = 'closed'),
    'archives', coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'archived_at', a.archived_at) ORDER BY a.id DESC)
      FROM fc27_campaigns a WHERE a.club_id = c.club_id AND a.status = 'archived'), '[]'::jsonb)
  ) FROM fc27_campaigns c WHERE c.id = p_campaign;
$$;--> statement-breakpoint
-- Ouvre une étape avec ses noms, dans l'ordre de classement reçu.
CREATE FUNCTION fc27_open_stage(p_campaign integer, p_number integer, p_kind text, p_ids integer[], p_at timestamptz)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  stage_key integer;
BEGIN
  INSERT INTO fc27_name_stages(campaign_id, number, kind, max_choices, opened_at)
    VALUES(p_campaign, p_number, p_kind, CASE WHEN p_kind IN ('qualif', 'repechage') THEN 3 ELSE 1 END, p_at)
    RETURNING id INTO stage_key;
  INSERT INTO fc27_name_stage_entries(stage_id, campaign_id, proposal_id, seed, duel)
    SELECT stage_key, p_campaign, x, o, CASE WHEN p_kind <> 'semis' THEN NULL WHEN o IN (1, 4) THEN 1 ELSE 2 END
    FROM unnest(p_ids) WITH ORDINALITY t(x, o);
END;
$$;--> statement-breakpoint
-- Clôt l'étape ouverte et ouvre la suivante, ou désigne le vainqueur. Renvoie NULL, ou une erreur
-- sans rien avoir écrit : une égalité non tranchée laisse l'étape ouverte et ses voix vivantes.
CREATE FUNCTION fc27_advance_stage(p_campaign integer, p_picks integer[], p_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  s fc27_name_stages%ROWTYPE;
  ranked integer[];
  scores integer[];
  total integer;
  voted integer[];
  above integer[];
  tied integer[];
  picked integer[];
  used integer[] := '{}';
  qualified integer[] := '{}';
  podium integer[] := '{}';
  winner integer;
  need integer;
  cut integer;
  d integer;
  tie boolean := false;
  next_kind text;
BEGIN
  p_picks := coalesce(p_picks, '{}');
  SELECT * INTO s FROM fc27_name_stages WHERE campaign_id = p_campaign AND closed_at IS NULL;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Aucune étape de vote n’est ouverte.', 'status', 409); END IF;
  -- Classement : voix décroissantes, puis rang d'entrée.
  SELECT coalesce(sum(n), 0), array_agg(proposal_id ORDER BY n DESC, seed), array_agg(n ORDER BY n DESC, seed)
    INTO total, ranked, scores
    FROM (SELECT en.proposal_id, en.seed, (SELECT count(*)::integer FROM fc27_name_votes v
            WHERE v.stage_id = s.id AND v.proposal_id = en.proposal_id) n
          FROM fc27_name_stage_entries en WHERE en.stage_id = s.id) x;
  IF total = 0 THEN
    RETURN jsonb_build_object('error', 'Aucun vote reçu sur cette étape. Attends au moins un vote avant de passer à la suite.', 'status', 400);
  END IF;

  IF s.kind IN ('qualif', 'repechage') THEN
    voted := ARRAY(SELECT ranked[i] FROM generate_subscripts(ranked, 1) i WHERE scores[i] > 0 ORDER BY i);
    IF cardinality(voted) > 4 AND s.kind = 'qualif' THEN
      qualified := voted; next_kind := 'repechage';
    ELSIF cardinality(voted) > 4 THEN
      cut := scores[4];
      above := ARRAY(SELECT ranked[i] FROM generate_subscripts(ranked, 1) i WHERE scores[i] > cut ORDER BY i);
      tied := ARRAY(SELECT ranked[i] FROM generate_subscripts(ranked, 1) i WHERE scores[i] = cut ORDER BY i);
      need := 4 - cardinality(above);
      IF cardinality(tied) > need THEN
        picked := ARRAY(SELECT x FROM unnest(tied) WITH ORDINALITY t(x, o) WHERE x = ANY(p_picks) ORDER BY o);
        IF cardinality(picked) <> need THEN
          RETURN jsonb_build_object('error', format('Égalité pour la dernière place en demi-finales : choisis %s nom(s) parmi les ex æquo.', need), 'status', 409);
        END IF;
        used := picked; tie := true; tied := picked;
      END IF;
      qualified := above || tied; next_kind := 'semis';
    ELSE
      qualified := voted;
      next_kind := CASE cardinality(voted) WHEN 4 THEN 'semis' WHEN 3 THEN 'podium' WHEN 2 THEN 'final' ELSE 'done' END;
      IF next_kind = 'done' THEN winner := voted[1]; podium := ARRAY[winner]; END IF;
    END IF;

  ELSIF s.kind = 'semis' THEN
    FOR d IN 1..2 LOOP
      SELECT array_agg(proposal_id ORDER BY n DESC, seed), array_agg(n ORDER BY n DESC, seed) INTO tied, scores
        FROM (SELECT en.proposal_id, en.seed, (SELECT count(*)::integer FROM fc27_name_votes v
                WHERE v.stage_id = s.id AND v.proposal_id = en.proposal_id) n
              FROM fc27_name_stage_entries en WHERE en.stage_id = s.id AND en.duel = d) x;
      IF scores[1] > scores[2] THEN
        qualified := qualified || tied[1];
      ELSE
        picked := ARRAY(SELECT x FROM unnest(tied) x WHERE x = ANY(p_picks));
        IF cardinality(picked) <> 1 THEN
          RETURN jsonb_build_object('error', format('Égalité dans la demi-finale %s : choisis le nom qui va en finale.', d), 'status', 409);
        END IF;
        qualified := qualified || picked; used := used || picked; tie := true;
      END IF;
    END LOOP;
    next_kind := 'final';

  ELSE -- 'final' ou 'podium' : le premier gagne, une égalité en tête est tranchée par l'admin.
    tied := ARRAY(SELECT ranked[i] FROM generate_subscripts(ranked, 1) i WHERE scores[i] = scores[1] ORDER BY i);
    IF cardinality(tied) > 1 THEN
      picked := ARRAY(SELECT x FROM unnest(tied) x WHERE x = ANY(p_picks));
      IF cardinality(picked) <> 1 THEN
        RETURN jsonb_build_object('error', 'Égalité en tête : choisis le vainqueur parmi les ex æquo.', 'status', 409);
      END IF;
      winner := picked[1]; used := picked; tie := true;
    ELSE
      winner := ranked[1];
    END IF;
    podium := ARRAY[winner] || ARRAY(SELECT x FROM unnest(ranked) WITH ORDINALITY t(x, o) WHERE x <> winner ORDER BY o);
    next_kind := 'done';
  END IF;

  IF EXISTS(SELECT 1 FROM unnest(p_picks) x WHERE NOT x = ANY(used)) THEN
    RETURN jsonb_build_object('error', 'Ce départage ne correspond plus aux résultats. Actualise la page.', 'status', 409);
  END IF;

  -- Rien n'a été écrit avant ce point.
  UPDATE fc27_name_stage_entries en SET
    final_votes = (SELECT count(*) FROM fc27_name_votes v WHERE v.stage_id = s.id AND v.proposal_id = en.proposal_id),
    result = CASE
      WHEN en.proposal_id = podium[1] THEN 'winner'
      WHEN s.kind IN ('final', 'podium') AND en.proposal_id = podium[2] THEN 'runner_up'
      WHEN s.kind = 'podium' AND en.proposal_id = podium[3] THEN 'third'
      WHEN en.proposal_id = ANY(qualified) AND next_kind <> 'done' THEN 'advanced'
      ELSE 'eliminated' END
    WHERE en.stage_id = s.id;
  UPDATE fc27_name_stages SET closed_at = p_at, tie_break_applied = tie WHERE id = s.id;
  IF next_kind = 'done' THEN
    UPDATE fc27_name_proposals p SET final_votes = coalesce((SELECT en.final_votes FROM fc27_name_stage_entries en
        JOIN fc27_name_stages f ON f.id = en.stage_id AND f.number = 1 WHERE f.campaign_id = p_campaign AND en.proposal_id = p.id), 0)
      WHERE p.campaign_id = p_campaign;
    UPDATE fc27_name_elections SET phase = 'closed', closed_at = p_at, winner_proposal_id = winner,
      tie_break_applied = EXISTS(SELECT 1 FROM fc27_name_stages f WHERE f.campaign_id = p_campaign AND f.tie_break_applied)
      WHERE campaign_id = p_campaign;
  ELSE
    PERFORM fc27_open_stage(p_campaign, s.number + 1, next_kind, qualified, p_at);
  END IF;
  RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION fc27_dispatch(p_action text, p_input jsonb DEFAULT '{}', p_campaign integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  club_key integer;
  c fc27_campaigns%ROWTYPE;
  e fc27_name_elections%ROWTYPE;
  profile_key integer;
  account_key integer;
  owned integer;
  author text;
  mine integer;
  at_time timestamptz;
  s fc27_name_stages%ROWTYPE;
  picks integer[];
  outcome jsonb;
  kit_holder text;
BEGIN
  -- One lock order for proposal, vote, stage advance, player and reset. A vote either commits
  -- before the stage closes and counts, or sees 'closed' and is rejected.
  SELECT id INTO club_key FROM clubs ORDER BY id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Aucun club en base.', 'status', 404); END IF;
  IF p_campaign IS NULL THEN
    SELECT * INTO c FROM fc27_campaigns WHERE club_id = club_key ORDER BY id DESC LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO fc27_campaigns(club_id) VALUES(club_key) RETURNING * INTO c;
      INSERT INTO fc27_name_elections(campaign_id) VALUES(c.id);
    END IF;
  ELSE
    SELECT * INTO c FROM fc27_campaigns WHERE id = p_campaign AND club_id = club_key FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Campagne introuvable.', 'status', 404); END IF;
  END IF;
  -- 'tick' is kept as a read-only compatibility alias for stale clients. The account (from the
  -- signed session, never the request body) only selects which ballot is returned.
  IF p_action IN ('state', 'tick') THEN RETURN fc27_snapshot(c.id, (p_input->>'accountId')::integer); END IF;
  account_key := (p_input->>'accountId')::integer;
  IF account_key IS NULL OR NOT EXISTS(SELECT 1 FROM club_accounts WHERE id = account_key) THEN
    RETURN jsonb_build_object('error', 'Connecte-toi avec Discord pour participer.', 'status', 401);
  END IF;
  IF c.status = 'archived' AND p_action <> 'reset' THEN
    RETURN jsonb_build_object('error', 'Cette préparation est archivée, en lecture seule.', 'status', 409);
  END IF;
  SELECT * INTO e FROM fc27_name_elections WHERE campaign_id = c.id;
  at_time := clock_timestamp();

  CASE p_action
  WHEN 'propose' THEN
    IF e.phase <> 'proposing' THEN RETURN jsonb_build_object('error', 'Les propositions sont closes.', 'status', 409); END IF;
    account_key := (p_input->>'accountId')::integer;
    -- Le nom affiché vient du compte : une proposition ne peut plus être signée d'un pseudo inventé.
    SELECT left(coalesce(nullif(display_name, ''), username), 40) INTO author FROM club_accounts WHERE id = account_key;
    IF author IS NULL THEN
      RETURN jsonb_build_object('error', 'Connecte-toi pour proposer un nom.', 'status', 401);
    END IF;
    SELECT count(*) INTO mine FROM fc27_name_proposals
      WHERE campaign_id = c.id AND author_account_id = account_key;
    IF mine >= 3 THEN
      RETURN jsonb_build_object('error', 'Tu as déjà proposé trois noms pour cette préparation.', 'status', 409);
    END IF;
    INSERT INTO fc27_name_proposals(campaign_id, author_account_id, author_pseudo, club_name)
      VALUES(c.id, account_key, author, p_input->>'name');


  WHEN 'start' THEN
    IF e.phase <> 'proposing' THEN RETURN jsonb_build_object('error', 'Les votes ont déjà démarré.', 'status', 409); END IF;
    IF NOT EXISTS(SELECT 1 FROM fc27_name_proposals WHERE campaign_id = c.id) THEN
      RETURN jsonb_build_object('error', 'Ajoute au moins une proposition avant de lancer les votes.', 'status', 400);
    END IF;
    UPDATE fc27_name_elections SET phase = 'voting', started_at = at_time WHERE campaign_id = c.id;
    PERFORM fc27_open_stage(c.id, 1, 'qualif',
      ARRAY(SELECT id FROM fc27_name_proposals WHERE campaign_id = c.id ORDER BY id), at_time);

  WHEN 'vote' THEN
    IF e.phase <> 'voting' THEN RETURN jsonb_build_object('error', 'Le vote n’est pas ouvert.', 'status', 409); END IF;
    SELECT * INTO s FROM fc27_name_stages WHERE campaign_id = c.id AND closed_at IS NULL;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Aucune étape de vote n’est ouverte.', 'status', 409); END IF;
    -- Le bulletin complet de l'étape. `proposalId` seul vient d'un client d'avant les étapes.
    picks := ARRAY(SELECT DISTINCT x::integer FROM jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(p_input->'proposalIds') = 'array' THEN p_input->'proposalIds'
        ELSE jsonb_build_array(p_input->'proposalId') END) x WHERE x IS NOT NULL);
    IF EXISTS(SELECT 1 FROM unnest(picks) x WHERE NOT EXISTS(
        SELECT 1 FROM fc27_name_stage_entries en WHERE en.stage_id = s.id AND en.proposal_id = x)) THEN
      RETURN jsonb_build_object('error', 'Ce nom n’est plus en course dans cette étape. Actualise la page.', 'status', 400);
    END IF;
    IF s.kind = 'semis' THEN
      IF EXISTS(SELECT 1 FROM fc27_name_stage_entries en WHERE en.stage_id = s.id AND en.proposal_id = ANY(picks)
          GROUP BY en.duel HAVING count(*) > 1) THEN
        RETURN jsonb_build_object('error', 'Un seul nom par demi-finale.', 'status', 400);
      END IF;
    ELSIF cardinality(picks) > s.max_choices THEN
      RETURN jsonb_build_object('error', format('%s choix maximum sur cette étape.', s.max_choices), 'status', 400);
    END IF;
    SELECT left(coalesce(nullif(display_name, ''), username), 40) INTO author FROM club_accounts WHERE id = account_key;
    -- Le nouveau bulletin remplace l'ancien : changer d'avis est permis tant que l'étape est ouverte.
    -- Un bulletin vide retire la voix.
    DELETE FROM fc27_name_votes WHERE stage_id = s.id AND voter_account_id = account_key;
    INSERT INTO fc27_name_votes(campaign_id, stage_id, proposal_id, voter_account_id, voter_pseudo)
      SELECT c.id, s.id, x, account_key, author FROM unnest(picks) x;

  WHEN 'advance', 'close' THEN
    IF e.phase <> 'voting' THEN RETURN jsonb_build_object('error', 'Le vote n’est pas ouvert.', 'status', 409); END IF;
    -- 'close' + winnerProposalId vient d'un client d'avant les étapes : même règle, départage compris.
    picks := CASE WHEN jsonb_typeof(p_input->'picks') = 'array'
      THEN ARRAY(SELECT x::integer FROM jsonb_array_elements_text(p_input->'picks') x)
      ELSE ARRAY(SELECT (p_input->>'winnerProposalId')::integer WHERE p_input ? 'winnerProposalId') END;
    outcome := fc27_advance_stage(c.id, picks, at_time);
    IF outcome IS NOT NULL THEN RETURN outcome; END IF;

  WHEN 'player' THEN
    account_key := (p_input->>'accountId')::integer;
    IF account_key IS NULL THEN
      RETURN jsonb_build_object('error', 'Connecte-toi pour créer ou modifier ta fiche.', 'status', 401);
    END IF;
    IF NOT EXISTS(SELECT 1 FROM club_accounts WHERE id = account_key) THEN
      RETURN jsonb_build_object('error', 'Session inconnue. Reconnecte-toi.', 'status', 401);
    END IF;
    -- Une seule fiche par compte et par campagne.
    SELECT id INTO owned FROM fc27_player_profiles
      WHERE campaign_id = c.id AND account_id = account_key;
    IF NOT coalesce((p_input->>'archetype' = 'finisher' and p_input->>'primaryPosition' in ('AG', 'AD', 'BU', 'AT')) or (p_input->>'archetype' = 'target' and p_input->>'primaryPosition' in ('AG', 'AD', 'BU', 'AT')) or (p_input->>'archetype' = 'magician' and p_input->>'primaryPosition' in ('AG', 'AD', 'BU', 'AT')) or (p_input->>'archetype' = 'spark' and p_input->>'primaryPosition' in ('AG', 'AD', 'BU', 'AT')) or (p_input->>'archetype' = 'disruptor' and p_input->>'primaryPosition' in ('MDC', 'MC', 'MOC', 'MG', 'MD')) or (p_input->>'archetype' = 'maestro' and p_input->>'primaryPosition' in ('MDC', 'MC', 'MOC', 'MG', 'MD')) or (p_input->>'archetype' = 'creator' and p_input->>'primaryPosition' in ('MDC', 'MC', 'MOC', 'MG', 'MD')) or (p_input->>'archetype' = 'recycler' and p_input->>'primaryPosition' in ('MDC', 'MC', 'MOC', 'MG', 'MD')) or (p_input->>'archetype' = 'boss' and p_input->>'primaryPosition' in ('DC', 'DG', 'DD')) or (p_input->>'archetype' = 'progressor' and p_input->>'primaryPosition' in ('DC', 'DG', 'DD')) or (p_input->>'archetype' = 'marauder' and p_input->>'primaryPosition' in ('DC', 'DG', 'DD')) or (p_input->>'archetype' = 'shot-stopper' and p_input->>'primaryPosition' in ('G')) or (p_input->>'archetype' = 'sweeper-keeper' and p_input->>'primaryPosition' in ('G')), false) THEN
      RETURN jsonb_build_object('error', 'Choisis un archétype de la ligne de ton poste principal.', 'status', 400);
    END IF;
    IF p_input->>'secondaryPosition' = p_input->>'primaryPosition' THEN
      RETURN jsonb_build_object('error', 'Le poste secondaire doit être différent du poste principal.', 'status', 400);
    END IF;
    -- Numéro de maillot : un seul porteur par campagne (l'index unique reste le filet de sécurité).
    SELECT coalesce(nullif(in_game_name, ''), pseudo) INTO kit_holder FROM fc27_player_profiles
      WHERE campaign_id = c.id AND kit_number = (p_input->>'kitNumber')::smallint
        AND id IS DISTINCT FROM owned;
    IF FOUND THEN
      RETURN jsonb_build_object('error', format('Le numéro %s est déjà porté par %s.', p_input->>'kitNumber', kit_holder), 'status', 409);
    END IF;
    IF owned IS NOT NULL THEN
      UPDATE fc27_player_profiles SET
        in_game_name = p_input->>'kitName', kit_number = (p_input->>'kitNumber')::smallint,
        primary_position = (p_input->>'primaryPosition')::fc27_position, preferred_foot = p_input->>'preferredFoot',
        height_cm = (p_input->>'heightCm')::smallint, weight_kg = (p_input->>'weightKg')::smallint,
        archetype = p_input->>'archetype',
        attribute_priorities = ARRAY(SELECT jsonb_array_elements_text(p_input->'attributePriorities')),
        weak_foot = (p_input->>'weakFootStars')::smallint, skill_moves = (p_input->>'skillMovesStars')::smallint,
        notes = nullif(p_input->>'notes', ''), updated_at = at_time
        WHERE id = owned AND campaign_id = c.id AND account_id = account_key
        RETURNING id INTO profile_key;
      IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Ta fiche est introuvable. Recharge la page.', 'status', 404); END IF;
      DELETE FROM fc27_player_secondary_positions WHERE profile_id = profile_key;
    ELSE
      INSERT INTO fc27_player_profiles(campaign_id, account_id, pseudo, in_game_name, kit_number, primary_position, preferred_foot,
          height_cm, weight_kg, archetype, attribute_priorities, weak_foot, skill_moves, notes)
        VALUES(c.id, account_key, p_input->>'pseudo', p_input->>'kitName', (p_input->>'kitNumber')::smallint,
          (p_input->>'primaryPosition')::fc27_position, p_input->>'preferredFoot',
          (p_input->>'heightCm')::smallint, (p_input->>'weightKg')::smallint, p_input->>'archetype',
          ARRAY(SELECT jsonb_array_elements_text(p_input->'attributePriorities')),
          (p_input->>'weakFootStars')::smallint, (p_input->>'skillMovesStars')::smallint, nullif(p_input->>'notes', ''))
        ON CONFLICT(campaign_id, pseudo) DO NOTHING RETURNING id INTO profile_key;
      IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Ce pseudo est déjà pris par un autre joueur. Choisis-en un autre.', 'status', 409); END IF;
    END IF;
    IF nullif(p_input->>'secondaryPosition', '') IS NOT NULL THEN
      INSERT INTO fc27_player_secondary_positions(profile_id, position)
        VALUES(profile_key, (p_input->>'secondaryPosition')::fc27_position);
    END IF;

  WHEN 'archive', 'reset' THEN
    IF p_action = 'reset' AND EXISTS(SELECT 1 FROM fc27_campaigns WHERE club_id = club_key AND id > c.id) THEN
      RETURN jsonb_build_object('error', 'Une campagne plus récente existe déjà. Ouvre la préparation actuelle.', 'status', 409);
    END IF;
    IF p_action = 'archive' AND e.phase = 'voting' THEN
      RETURN jsonb_build_object('error', 'Clôture le vote avant de terminer la préparation.', 'status', 409);
    END IF;
    IF e.phase IN ('proposing', 'voting') THEN
      -- L'étape en cours est figée telle quelle, sans vainqueur.
      UPDATE fc27_name_stage_entries en SET final_votes = (SELECT count(*) FROM fc27_name_votes v
          WHERE v.stage_id = en.stage_id AND v.proposal_id = en.proposal_id)
        FROM fc27_name_stages f WHERE f.id = en.stage_id AND f.campaign_id = c.id AND f.closed_at IS NULL;
      UPDATE fc27_name_stages SET closed_at = at_time WHERE campaign_id = c.id AND closed_at IS NULL;
      UPDATE fc27_name_proposals p SET final_votes = (SELECT count(*) FROM fc27_name_votes v WHERE v.proposal_id = p.id
          AND v.stage_id IS NOT DISTINCT FROM (SELECT min(f.id) FROM fc27_name_stages f WHERE f.campaign_id = c.id))
        WHERE p.campaign_id = c.id;
      UPDATE fc27_name_elections SET phase = 'cancelled', closed_at = at_time WHERE campaign_id = c.id;
    END IF;
    UPDATE fc27_campaigns SET status = 'archived', archived_at = coalesce(archived_at, at_time) WHERE id = c.id;
    IF p_action = 'reset' THEN
      INSERT INTO fc27_campaigns(club_id) VALUES(club_key) RETURNING * INTO c;
      INSERT INTO fc27_name_elections(campaign_id) VALUES(c.id);
    END IF;
  ELSE
    RETURN jsonb_build_object('error', 'Action inconnue.', 'status', 400);
  END CASE;
  RETURN fc27_snapshot(c.id, account_key);
END;
$$;
