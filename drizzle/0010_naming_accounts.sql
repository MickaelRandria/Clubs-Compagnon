-- Le vote du nom passe aussi par les comptes.
--
-- Avant : une proposition était signée d'un pseudo tapé au clavier, et le vote était
-- limité « un par pseudo » — il suffisait d'en changer pour revoter. Désormais les deux
-- sont rattachés à un compte Discord, et le nom affiché vient du compte.
--
-- Les propositions et votes existants gardent un account_id NULL : ils restent lisibles
-- et comptabilisés. Aucun rattachement à un compte n'est deviné à partir du pseudo.
ALTER TABLE "fc27_name_proposals" ADD COLUMN "author_account_id" integer REFERENCES "club_accounts"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "fc27_name_votes" ADD COLUMN "voter_account_id" integer REFERENCES "club_accounts"("id") ON DELETE SET NULL;--> statement-breakpoint
-- Une voix par compte et par campagne. Partielle : les anciens votes sans compte sont ignorés.
CREATE UNIQUE INDEX "fc27_name_vote_account_key" ON "fc27_name_votes" ("campaign_id", "voter_account_id") WHERE "voter_account_id" IS NOT NULL;--> statement-breakpoint
-- Trois propositions au maximum par compte : la limite est aussi dans la base, pas seulement dans le code.
CREATE INDEX "fc27_proposal_author_idx" ON "fc27_name_proposals" ("campaign_id", "author_account_id");--> statement-breakpoint
-- L'unicité par pseudo devient fausse dès que deux comptes portent le même nom affiché.
ALTER TABLE "fc27_name_votes" DROP CONSTRAINT IF EXISTS "fc27_name_vote_pseudo_key";--> statement-breakpoint
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
  top_votes integer;
  leaders integer[];
  chosen integer;
  kit_holder text;
BEGIN
  -- One lock order for proposal, vote, close, player and reset. A vote either commits
  -- before manual closure and counts, or sees 'closed' and is rejected.
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
  -- 'tick' is kept as a read-only compatibility alias for stale clients.
  IF p_action IN ('state', 'tick') THEN RETURN fc27_snapshot(c.id); END IF;
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

  WHEN 'vote' THEN
    IF e.phase <> 'voting' THEN RETURN jsonb_build_object('error', 'Le vote n’est pas ouvert.', 'status', 409); END IF;
    IF NOT EXISTS(SELECT 1 FROM fc27_name_proposals WHERE campaign_id = c.id AND id = (p_input->>'proposalId')::integer) THEN
      RETURN jsonb_build_object('error', 'Cette proposition ne fait pas partie de ce vote.', 'status', 400);
    END IF;
    account_key := (p_input->>'accountId')::integer;
    SELECT left(coalesce(nullif(display_name, ''), username), 40) INTO author FROM club_accounts WHERE id = account_key;
    IF author IS NULL THEN
      RETURN jsonb_build_object('error', 'Connecte-toi pour voter.', 'status', 401);
    END IF;
    -- Une voix par compte : changer de pseudo ne permet plus de revoter.
    INSERT INTO fc27_name_votes(campaign_id, proposal_id, voter_account_id, voter_pseudo)
      VALUES(c.id, (p_input->>'proposalId')::integer, account_key, author)
      -- L'index unique est partiel : le ON CONFLICT doit reprendre sa condition,
      -- sinon Postgres ne le reconnait pas (« no unique or exclusion constraint matching »).
      ON CONFLICT (campaign_id, voter_account_id) WHERE voter_account_id IS NOT NULL DO NOTHING;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Tu as déjà voté. Un seul vote est possible.', 'status', 409); END IF;

  WHEN 'close' THEN
    IF e.phase <> 'voting' THEN RETURN jsonb_build_object('error', 'Le vote n’est pas ouvert.', 'status', 409); END IF;
    SELECT max(score) INTO top_votes FROM (
      SELECT count(v.id)::integer score FROM fc27_name_proposals p LEFT JOIN fc27_name_votes v ON v.proposal_id = p.id
      WHERE p.campaign_id = c.id GROUP BY p.id
    ) scores;
    IF coalesce(top_votes, 0) = 0 THEN RETURN jsonb_build_object('error', 'Aucun vote reçu. Attends au moins un vote avant de clôturer.', 'status', 400); END IF;
    SELECT array_agg(id ORDER BY id) INTO leaders FROM (
      SELECT p.id FROM fc27_name_proposals p LEFT JOIN fc27_name_votes v ON v.proposal_id = p.id
      WHERE p.campaign_id = c.id GROUP BY p.id HAVING count(v.id) = top_votes
    ) scores;
    chosen := (p_input->>'winnerProposalId')::integer;
    IF array_length(leaders, 1) > 1 AND chosen IS NULL THEN
      RETURN jsonb_build_object('error', 'Égalité en tête : choisis le gagnant parmi les ex æquo.', 'status', 409);
    END IF;
    IF chosen IS NOT NULL AND NOT (chosen = ANY(leaders)) THEN
      RETURN jsonb_build_object('error', 'Le gagnant doit être une des propositions en tête. Actualise les résultats.', 'status', 409);
    END IF;
    chosen := coalesce(chosen, leaders[1]);
    UPDATE fc27_name_proposals p SET final_votes = (SELECT count(*) FROM fc27_name_votes v WHERE v.proposal_id = p.id) WHERE p.campaign_id = c.id;
    UPDATE fc27_name_elections SET phase = 'closed', closed_at = at_time,
      winner_proposal_id = chosen, tie_break_applied = array_length(leaders, 1) > 1 WHERE campaign_id = c.id;

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
      UPDATE fc27_name_proposals p SET final_votes = (SELECT count(*) FROM fc27_name_votes v WHERE v.proposal_id = p.id) WHERE p.campaign_id = c.id;
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
  RETURN fc27_snapshot(c.id);
END;
$$;
