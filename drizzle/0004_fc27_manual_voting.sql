-- Replace the elimination engine without deleting its historical records.
-- A stale scheduler from an older deployment must never advance an election.
CREATE OR REPLACE FUNCTION fc27_advance(p_campaign integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN RETURN; END;
$$;
--> statement-breakpoint
INSERT INTO fc27_name_elections(campaign_id, phase, started_at, closed_at)
SELECT c.id,
  CASE WHEN c.status = 'archived' THEN 'cancelled'
    WHEN EXISTS(SELECT 1 FROM fc27_rounds r WHERE r.campaign_id = c.id AND r.number > 0) THEN 'voting' ELSE 'proposing' END,
  (SELECT min(opened_at) FROM fc27_rounds r WHERE r.campaign_id = c.id AND r.number > 0),
  CASE WHEN c.status = 'archived' THEN c.archived_at ELSE NULL END
FROM fc27_campaigns c;
--> statement-breakpoint
-- If old rounds exist, retain the earliest ballot per exact pseudo. All original
-- ballots remain in fc27_votes; no legacy data is destroyed by deduplication.
INSERT INTO fc27_name_votes(campaign_id, proposal_id, voter_pseudo, created_at)
SELECT DISTINCT ON (r.campaign_id, v.voter_pseudo) r.campaign_id, v.proposal_id, v.voter_pseudo, v.created_at
FROM fc27_votes v JOIN fc27_rounds r ON r.id = v.round_id
ORDER BY r.campaign_id, v.voter_pseudo, v.created_at, v.id;
--> statement-breakpoint
UPDATE fc27_name_proposals p SET final_votes = (SELECT count(*) FROM fc27_name_votes v WHERE v.proposal_id = p.id)
WHERE p.campaign_id IN (SELECT campaign_id FROM fc27_name_elections WHERE phase = 'cancelled');
--> statement-breakpoint
UPDATE fc27_round_candidates rc SET final_vote_count = (SELECT count(*) FROM fc27_votes v WHERE v.round_id = rc.round_id AND v.proposal_id = rc.proposal_id)
WHERE rc.round_id IN (SELECT id FROM fc27_rounds WHERE status = 'open');
--> statement-breakpoint
UPDATE fc27_rounds SET status = 'closed', closed_at = clock_timestamp(), close_reason = 'archive' WHERE status = 'open';
--> statement-breakpoint
CREATE OR REPLACE FUNCTION fc27_snapshot(p_campaign integer) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object(
    'campaign', to_jsonb(c) - 'expected_voters',
    'server_time', clock_timestamp(),
    'election', (SELECT to_jsonb(e) FROM fc27_name_elections e WHERE e.campaign_id = c.id),
    'proposals', coalesce((SELECT jsonb_agg(to_jsonb(p) || jsonb_build_object('votes',
      coalesce(p.final_votes, (SELECT count(*) FROM fc27_name_votes v WHERE v.proposal_id = p.id))) ORDER BY p.id)
      FROM fc27_name_proposals p WHERE p.campaign_id = c.id), '[]'::jsonb),
    'players', coalesce((SELECT jsonb_agg(to_jsonb(p) || jsonb_build_object('secondary_positions',
      coalesce((SELECT jsonb_agg(s.position ORDER BY s.position) FROM fc27_player_secondary_positions s WHERE s.profile_id = p.id), '[]'::jsonb)
    ) ORDER BY p.id) FROM fc27_player_profiles p WHERE p.campaign_id = c.id), '[]'::jsonb),
    'winner', (SELECT to_jsonb(p) || jsonb_build_object('votes', p.final_votes) FROM fc27_name_proposals p
      JOIN fc27_name_elections e ON e.winner_proposal_id = p.id WHERE e.campaign_id = c.id AND e.phase = 'closed'),
    'archives', coalesce((SELECT jsonb_agg(jsonb_build_object('id', a.id, 'archived_at', a.archived_at) ORDER BY a.id DESC)
      FROM fc27_campaigns a WHERE a.club_id = c.club_id AND a.status = 'archived'), '[]'::jsonb)
  ) FROM fc27_campaigns c WHERE c.id = p_campaign;
$$;
--> statement-breakpoint
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
BEGIN
  -- One lock order for proposal, vote, close and reset. A vote either commits
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
