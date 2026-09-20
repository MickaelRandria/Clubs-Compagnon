-- Identifiants stables et compatibilité par ligne. Les anciennes fiches NULL restent à compléter.
ALTER TABLE "fc27_player_profiles" DROP CONSTRAINT "fc27_player_archetype_check";--> statement-breakpoint
ALTER TABLE "fc27_player_profiles" ADD CONSTRAINT "fc27_player_archetype_check" CHECK ((archetype = 'finisher' and primary_position in ('AG', 'AD', 'BU', 'AT')) or (archetype = 'target' and primary_position in ('AG', 'AD', 'BU', 'AT')) or (archetype = 'magician' and primary_position in ('AG', 'AD', 'BU', 'AT')) or (archetype = 'spark' and primary_position in ('AG', 'AD', 'BU', 'AT')) or (archetype = 'disruptor' and primary_position in ('MDC', 'MC', 'MOC', 'MG', 'MD')) or (archetype = 'maestro' and primary_position in ('MDC', 'MC', 'MOC', 'MG', 'MD')) or (archetype = 'creator' and primary_position in ('MDC', 'MC', 'MOC', 'MG', 'MD')) or (archetype = 'recycler' and primary_position in ('MDC', 'MC', 'MOC', 'MG', 'MD')) or (archetype = 'boss' and primary_position in ('DC', 'DG', 'DD')) or (archetype = 'progressor' and primary_position in ('DC', 'DG', 'DD')) or (archetype = 'marauder' and primary_position in ('DC', 'DG', 'DD')) or (archetype = 'shot-stopper' and primary_position in ('G')) or (archetype = 'sweeper-keeper' and primary_position in ('G')));
--> statement-breakpoint
-- Les anciens PlayStyles sont conservés en base, mais ne sont plus saisis ni modifiés.
CREATE OR REPLACE FUNCTION fc27_dispatch(p_action text, p_input jsonb DEFAULT '{}', p_campaign integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  club_key integer;
  c fc27_campaigns%ROWTYPE;
  e fc27_name_elections%ROWTYPE;
  profile_key integer;
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
  IF c.status = 'archived' AND p_action <> 'reset' THEN
    RETURN jsonb_build_object('error', 'Cette préparation est archivée, en lecture seule.', 'status', 409);
  END IF;
  SELECT * INTO e FROM fc27_name_elections WHERE campaign_id = c.id;
  at_time := clock_timestamp();

  CASE p_action
  WHEN 'propose' THEN
    IF e.phase <> 'proposing' THEN RETURN jsonb_build_object('error', 'Les propositions sont closes.', 'status', 409); END IF;
    INSERT INTO fc27_name_proposals(campaign_id, author_pseudo, club_name) VALUES(c.id, p_input->>'pseudo', p_input->>'name');

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
    INSERT INTO fc27_name_votes(campaign_id, proposal_id, voter_pseudo)
      VALUES(c.id, (p_input->>'proposalId')::integer, p_input->>'pseudo') ON CONFLICT (campaign_id, voter_pseudo) DO NOTHING;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Ce pseudo a déjà voté. Un seul vote est possible.', 'status', 409); END IF;

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
    IF NOT coalesce((p_input->>'archetype' = 'finisher' and p_input->>'primaryPosition' in ('AG', 'AD', 'BU', 'AT')) or (p_input->>'archetype' = 'target' and p_input->>'primaryPosition' in ('AG', 'AD', 'BU', 'AT')) or (p_input->>'archetype' = 'magician' and p_input->>'primaryPosition' in ('AG', 'AD', 'BU', 'AT')) or (p_input->>'archetype' = 'spark' and p_input->>'primaryPosition' in ('AG', 'AD', 'BU', 'AT')) or (p_input->>'archetype' = 'disruptor' and p_input->>'primaryPosition' in ('MDC', 'MC', 'MOC', 'MG', 'MD')) or (p_input->>'archetype' = 'maestro' and p_input->>'primaryPosition' in ('MDC', 'MC', 'MOC', 'MG', 'MD')) or (p_input->>'archetype' = 'creator' and p_input->>'primaryPosition' in ('MDC', 'MC', 'MOC', 'MG', 'MD')) or (p_input->>'archetype' = 'recycler' and p_input->>'primaryPosition' in ('MDC', 'MC', 'MOC', 'MG', 'MD')) or (p_input->>'archetype' = 'boss' and p_input->>'primaryPosition' in ('DC', 'DG', 'DD')) or (p_input->>'archetype' = 'progressor' and p_input->>'primaryPosition' in ('DC', 'DG', 'DD')) or (p_input->>'archetype' = 'marauder' and p_input->>'primaryPosition' in ('DC', 'DG', 'DD')) or (p_input->>'archetype' = 'shot-stopper' and p_input->>'primaryPosition' in ('G')) or (p_input->>'archetype' = 'sweeper-keeper' and p_input->>'primaryPosition' in ('G')), false) THEN
      RETURN jsonb_build_object('error', 'Choisis un archétype de la ligne de ton poste principal.', 'status', 400);
    END IF;
    IF p_input->>'secondaryPosition' = p_input->>'primaryPosition' THEN
      RETURN jsonb_build_object('error', 'Le poste secondaire doit être différent du poste principal.', 'status', 400);
    END IF;
    -- Numéro de maillot : un seul porteur par campagne (l'index unique reste le filet de sécurité).
    SELECT coalesce(nullif(in_game_name, ''), pseudo) INTO kit_holder FROM fc27_player_profiles
      WHERE campaign_id = c.id AND kit_number = (p_input->>'kitNumber')::smallint
        AND id IS DISTINCT FROM (p_input->>'profileId')::integer;
    IF FOUND THEN
      RETURN jsonb_build_object('error', format('Le numéro %s est déjà porté par %s.', p_input->>'kitNumber', kit_holder), 'status', 409);
    END IF;
    IF p_input ? 'profileId' THEN
      UPDATE fc27_player_profiles SET
        in_game_name = p_input->>'kitName', kit_number = (p_input->>'kitNumber')::smallint,
        primary_position = (p_input->>'primaryPosition')::fc27_position, preferred_foot = p_input->>'preferredFoot',
        height_cm = (p_input->>'heightCm')::smallint, weight_kg = (p_input->>'weightKg')::smallint,
        archetype = p_input->>'archetype',
        weak_foot = (p_input->>'weakFootStars')::smallint, skill_moves = (p_input->>'skillMovesStars')::smallint,
        notes = nullif(p_input->>'notes', ''), updated_at = at_time
        WHERE id = (p_input->>'profileId')::integer AND campaign_id = c.id AND pseudo = p_input->>'pseudo'
        RETURNING id INTO profile_key;
      IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Fiche introuvable pour ce pseudo exact.', 'status', 404); END IF;
      DELETE FROM fc27_player_secondary_positions WHERE profile_id = profile_key;
    ELSE
      INSERT INTO fc27_player_profiles(campaign_id, pseudo, in_game_name, kit_number, primary_position, preferred_foot,
          height_cm, weight_kg, archetype, weak_foot, skill_moves, notes)
        VALUES(c.id, p_input->>'pseudo', p_input->>'kitName', (p_input->>'kitNumber')::smallint,
          (p_input->>'primaryPosition')::fc27_position, p_input->>'preferredFoot',
          (p_input->>'heightCm')::smallint, (p_input->>'weightKg')::smallint, p_input->>'archetype',
          (p_input->>'weakFootStars')::smallint, (p_input->>'skillMovesStars')::smallint, nullif(p_input->>'notes', ''))
        ON CONFLICT(campaign_id, pseudo) DO NOTHING RETURNING id INTO profile_key;
      IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Ce pseudo possède déjà une fiche. Utilise « Modifier une fiche ».', 'status', 409); END IF;
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
