-- The Neon HTTP driver cannot run interactive transactions. Keep the entire
-- election transition in PostgreSQL, under a campaign lock, in one statement.
CREATE FUNCTION fc27_advance(p_campaign integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  c fc27_campaigns%ROWTYPE;
  r fc27_rounds%ROWTYPE;
  eliminated_id integer;
  lowest integer;
  tied integer;
  candidate_count integer;
  vote_count integer;
  next_round integer;
  at_time timestamptz;
  reason text;
BEGIN
  SELECT * INTO c FROM fc27_campaigns WHERE id = p_campaign FOR UPDATE;
  IF NOT FOUND OR c.status <> 'preparation' THEN RETURN; END IF;
  SELECT * INTO r FROM fc27_rounds WHERE campaign_id = c.id AND status = 'open' AND number > 0;
  IF NOT FOUND THEN RETURN; END IF;
  at_time := clock_timestamp();
  SELECT count(*) INTO vote_count FROM fc27_votes WHERE round_id = r.id;
  IF vote_count < r.quorum AND at_time < r.deadline_at THEN RETURN; END IF;
  reason := CASE WHEN vote_count >= r.quorum THEN 'quorum' ELSE 'timeout' END;

  UPDATE fc27_round_candidates rc SET final_vote_count =
    (SELECT count(*) FROM fc27_votes v WHERE v.round_id = rc.round_id AND v.proposal_id = rc.proposal_id)
    WHERE rc.round_id = r.id;
  SELECT min(final_vote_count), count(*) INTO lowest, candidate_count
    FROM fc27_round_candidates WHERE round_id = r.id;
  SELECT count(*) INTO tied FROM fc27_round_candidates WHERE round_id = r.id AND final_vote_count = lowest;
  SELECT proposal_id INTO eliminated_id FROM fc27_round_candidates
    WHERE round_id = r.id AND final_vote_count = lowest ORDER BY random() LIMIT 1;
  UPDATE fc27_round_candidates SET eliminated = true WHERE round_id = r.id AND proposal_id = eliminated_id;
  UPDATE fc27_rounds SET status = 'closed',
    closed_at = CASE WHEN reason = 'timeout' THEN r.deadline_at ELSE at_time END,
    close_reason = reason, eliminated_proposal_id = eliminated_id, tie_break_applied = tied > 1 WHERE id = r.id;
  IF candidate_count > 2 THEN
    INSERT INTO fc27_rounds(campaign_id, number, quorum, opened_at, deadline_at)
      VALUES(c.id, r.number + 1, c.expected_voters, at_time, at_time + interval '72 hours') RETURNING id INTO next_round;
    INSERT INTO fc27_round_candidates(round_id, proposal_id, campaign_id)
      SELECT next_round, proposal_id, c.id FROM fc27_round_candidates WHERE round_id = r.id AND NOT eliminated;
  END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION fc27_snapshot(p_campaign integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'campaign', to_jsonb(c),
    'server_time', clock_timestamp(),
    'proposals', coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY p.id) FROM fc27_name_proposals p WHERE p.campaign_id = c.id), '[]'::jsonb),
    'rounds', coalesce((SELECT jsonb_agg(to_jsonb(r) || jsonb_build_object('candidates',
      coalesce((SELECT jsonb_agg(jsonb_build_object(
        'proposal_id', rc.proposal_id, 'eliminated', rc.eliminated,
        'votes', coalesce(rc.final_vote_count, (SELECT count(*) FROM fc27_votes v WHERE v.round_id = rc.round_id AND v.proposal_id = rc.proposal_id))
      ) ORDER BY rc.proposal_id) FROM fc27_round_candidates rc WHERE rc.round_id = r.id), '[]'::jsonb)
    ) ORDER BY r.number) FROM fc27_rounds r WHERE r.campaign_id = c.id), '[]'::jsonb),
    'players', coalesce((SELECT jsonb_agg(to_jsonb(p) || jsonb_build_object('secondary_positions',
      coalesce((SELECT jsonb_agg(s.position ORDER BY s.position) FROM fc27_player_secondary_positions s WHERE s.profile_id = p.id), '[]'::jsonb)
    ) ORDER BY p.id) FROM fc27_player_profiles p WHERE p.campaign_id = c.id), '[]'::jsonb),
    'winner', (SELECT to_jsonb(p) FROM fc27_name_proposals p WHERE p.campaign_id = c.id
      AND NOT EXISTS(SELECT 1 FROM fc27_rounds r WHERE r.campaign_id = c.id AND r.status = 'open')
      AND EXISTS(SELECT 1 FROM fc27_rounds r WHERE r.campaign_id = c.id AND r.eliminated_proposal_id IS NOT NULL)
      AND NOT EXISTS(SELECT 1 FROM fc27_rounds r WHERE r.campaign_id = c.id AND r.eliminated_proposal_id = p.id)
      AND (SELECT count(*) FROM fc27_name_proposals p2 WHERE p2.campaign_id = c.id
        AND NOT EXISTS(SELECT 1 FROM fc27_rounds r WHERE r.campaign_id = c.id AND r.eliminated_proposal_id = p2.id)) = 1),
    'archives', coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'archived_at', a.archived_at) ORDER BY a.id DESC)
      FROM fc27_campaigns a WHERE a.club_id = c.club_id AND a.status = 'archived'), '[]'::jsonb)
  ) FROM fc27_campaigns c WHERE c.id = p_campaign;
$$;
--> statement-breakpoint
CREATE FUNCTION fc27_dispatch(p_action text, p_input jsonb DEFAULT '{}', p_campaign integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  club_key integer;
  c fc27_campaigns%ROWTYPE;
  r fc27_rounds%ROWTYPE;
  next_round integer;
  profile_key integer;
  at_time timestamptz;
BEGIN
  -- Consistent lock order: club, campaign. Serializes initial creation and reset as
  -- well as voting; no network request or user interaction happens while locked.
  SELECT id INTO club_key FROM clubs ORDER BY id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Aucun club en base.', 'status', 404); END IF;
  IF p_campaign IS NULL THEN
    SELECT * INTO c FROM fc27_campaigns WHERE club_id = club_key ORDER BY id DESC LIMIT 1 FOR UPDATE;
    IF NOT FOUND THEN
      INSERT INTO fc27_campaigns(club_id) VALUES(club_key) RETURNING * INTO c;
      INSERT INTO fc27_rounds(campaign_id, number) VALUES(c.id, 0);
    END IF;
  ELSE
    SELECT * INTO c FROM fc27_campaigns WHERE id = p_campaign AND club_id = club_key FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Campagne introuvable.', 'status', 404); END IF;
  END IF;

  PERFORM fc27_advance(c.id);
  IF p_action IN ('state', 'tick') THEN RETURN fc27_snapshot(c.id); END IF;
  IF c.status = 'archived' AND p_action <> 'reset' THEN
    RETURN jsonb_build_object('error', 'Cette préparation est archivée, en lecture seule.', 'status', 409);
  END IF;
  SELECT * INTO r FROM fc27_rounds WHERE campaign_id = c.id AND status = 'open';
  at_time := clock_timestamp();

  CASE p_action
  WHEN 'propose' THEN
    IF r.id IS NULL OR r.number <> 0 THEN RETURN jsonb_build_object('error', 'Les propositions sont closes.', 'status', 409); END IF;
    INSERT INTO fc27_name_proposals(campaign_id, author_pseudo, club_name) VALUES(c.id, p_input->>'pseudo', p_input->>'name');

  WHEN 'start' THEN
    IF r.id IS NULL OR r.number <> 0 THEN RETURN jsonb_build_object('error', 'Les votes ont déjà démarré.', 'status', 409); END IF;
    IF (SELECT count(*) FROM fc27_name_proposals WHERE campaign_id = c.id) < 2 THEN
      RETURN jsonb_build_object('error', 'Il faut au moins deux propositions pour lancer les votes.', 'status', 400);
    END IF;
    UPDATE fc27_rounds SET status = 'closed', closed_at = at_time, close_reason = 'start' WHERE id = r.id;
    INSERT INTO fc27_rounds(campaign_id, number, quorum, opened_at, deadline_at)
      VALUES(c.id, 1, c.expected_voters, at_time, at_time + interval '72 hours') RETURNING id INTO next_round;
    INSERT INTO fc27_round_candidates(round_id, proposal_id, campaign_id)
      SELECT next_round, id, c.id FROM fc27_name_proposals WHERE campaign_id = c.id;

  WHEN 'vote' THEN
    IF r.id IS NULL OR r.number = 0 OR r.id <> (p_input->>'roundId')::integer THEN
      RETURN jsonb_build_object('error', 'Ce tour est terminé. Consulte le tour actuel avant de voter.', 'status', 409);
    END IF;
    -- Check again with the server clock immediately before inserting.
    IF at_time >= r.deadline_at THEN
      PERFORM fc27_advance(c.id);
      RETURN jsonb_build_object('error', 'Le délai de ce tour est écoulé. Consulte le tour actuel.', 'status', 409);
    END IF;
    IF NOT EXISTS(SELECT 1 FROM fc27_round_candidates WHERE round_id = r.id AND proposal_id = (p_input->>'proposalId')::integer) THEN
      RETURN jsonb_build_object('error', 'Cette proposition ne participe pas à ce tour.', 'status', 400);
    END IF;
    INSERT INTO fc27_votes(round_id, proposal_id, voter_pseudo)
      VALUES(r.id, (p_input->>'proposalId')::integer, p_input->>'pseudo') ON CONFLICT (round_id, voter_pseudo) DO NOTHING;
    IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Ce pseudo a déjà voté pour ce tour.', 'status', 409); END IF;
    PERFORM fc27_advance(c.id);

  WHEN 'settings' THEN
    UPDATE fc27_campaigns SET expected_voters = (p_input->>'quorum')::integer WHERE id = c.id;

  WHEN 'player' THEN
    IF (p_input->'secondaryPositions') ? (p_input->>'primaryPosition') THEN
      RETURN jsonb_build_object('error', 'Le poste principal ne peut pas être secondaire.', 'status', 400);
    END IF;
    IF p_input ? 'profileId' THEN
      UPDATE fc27_player_profiles SET in_game_name = nullif(p_input->>'inGameName', ''),
        primary_position = (p_input->>'primaryPosition')::fc27_position, notes = nullif(p_input->>'notes', ''), updated_at = at_time
        WHERE id = (p_input->>'profileId')::integer AND campaign_id = c.id AND pseudo = p_input->>'pseudo'
        RETURNING id INTO profile_key;
      IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Fiche introuvable pour ce pseudo exact.', 'status', 404); END IF;
      DELETE FROM fc27_player_secondary_positions WHERE profile_id = profile_key;
    ELSE
      INSERT INTO fc27_player_profiles(campaign_id, pseudo, in_game_name, primary_position, notes)
        VALUES(c.id, p_input->>'pseudo', nullif(p_input->>'inGameName', ''), (p_input->>'primaryPosition')::fc27_position, nullif(p_input->>'notes', ''))
        ON CONFLICT(campaign_id, pseudo) DO NOTHING RETURNING id INTO profile_key;
      IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Ce pseudo possède déjà une fiche. Utilise « Modifier une fiche ».', 'status', 409); END IF;
    END IF;
    INSERT INTO fc27_player_secondary_positions(profile_id, position)
      SELECT profile_key, value::fc27_position FROM jsonb_array_elements_text(p_input->'secondaryPositions');

  WHEN 'archive', 'reset' THEN
    IF p_action = 'reset' AND EXISTS(SELECT 1 FROM fc27_campaigns WHERE club_id = club_key AND id > c.id) THEN
      RETURN jsonb_build_object('error', 'Une campagne plus récente existe déjà. Ouvre la préparation actuelle.', 'status', 409);
    END IF;
    IF r.id IS NOT NULL THEN
      UPDATE fc27_round_candidates rc SET final_vote_count =
        (SELECT count(*) FROM fc27_votes v WHERE v.round_id = rc.round_id AND v.proposal_id = rc.proposal_id) WHERE rc.round_id = r.id;
      UPDATE fc27_rounds SET status = 'closed', closed_at = at_time, close_reason = 'archive' WHERE id = r.id;
    END IF;
    UPDATE fc27_campaigns SET status = 'archived', archived_at = coalesce(archived_at, at_time) WHERE id = c.id;
    IF p_action = 'reset' THEN
      INSERT INTO fc27_campaigns(club_id, expected_voters) VALUES(club_key, c.expected_voters) RETURNING * INTO c;
      INSERT INTO fc27_rounds(campaign_id, number) VALUES(c.id, 0);
    END IF;
  ELSE
    RETURN jsonb_build_object('error', 'Action inconnue.', 'status', 400);
  END CASE;
  RETURN fc27_snapshot(c.id);
END;
$$;
