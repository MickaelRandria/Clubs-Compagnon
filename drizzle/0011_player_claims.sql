CREATE TABLE club_player_claims (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  account_id integer NOT NULL REFERENCES club_accounts(id) ON DELETE CASCADE,
  member_id integer NOT NULL REFERENCES members(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'revoked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by integer REFERENCES club_accounts(id) ON DELETE SET NULL,
  review_note text CHECK (char_length(review_note) <= 240),
  CHECK ((status = 'pending' AND reviewed_at IS NULL) OR (status <> 'pending' AND reviewed_at IS NOT NULL))
);--> statement-breakpoint
CREATE UNIQUE INDEX club_player_claim_account_active ON club_player_claims(account_id) WHERE status IN ('pending', 'approved');--> statement-breakpoint
CREATE UNIQUE INDEX club_player_claim_member_approved ON club_player_claims(member_id) WHERE status = 'approved';--> statement-breakpoint
CREATE INDEX club_player_claim_account_history ON club_player_claims(account_id, id DESC);--> statement-breakpoint
CREATE INDEX club_player_claim_member_idx ON club_player_claims(member_id);--> statement-breakpoint
CREATE INDEX club_player_claim_reviewer_idx ON club_player_claims(reviewed_by);--> statement-breakpoint
CREATE OR REPLACE FUNCTION club_profile_snapshot(p_account integer, p_admin boolean)
RETURNS jsonb LANGUAGE sql AS $$
  WITH club AS (SELECT id, name FROM clubs ORDER BY id LIMIT 1),
  own AS (
    SELECT r.*, m.gamertag FROM club_player_claims r JOIN members m ON m.id = r.member_id
    WHERE r.account_id = p_account AND m.club_id = (SELECT id FROM club) ORDER BY r.id DESC LIMIT 1
  )
  SELECT jsonb_build_object(
    'club', (SELECT to_jsonb(club) FROM club),
    'isAdmin', p_admin,
    'request', (SELECT jsonb_build_object('id', id, 'status', status, 'memberId', member_id,
      'gamertag', gamertag, 'createdAt', created_at, 'reviewedAt', reviewed_at, 'reviewNote', review_note) FROM own),
    'player', (SELECT jsonb_build_object('id', m.id, 'gamertag', m.gamertag, 'position', m.position, 'ovr', m.ovr,
      'matchesPlayed', m.matches_played, 'goals', m.goals, 'assists', m.assists, 'avgRating', m.avg_rating,
      'passPct', m.pass_pct, 'updatedAt', m.updated_at, 'isActive', m.is_active)
      FROM own JOIN members m ON m.id = own.member_id WHERE own.status = 'approved'),
    'availablePlayers', coalesce((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'gamertag', m.gamertag, 'position', m.position, 'ovr', m.ovr) ORDER BY m.gamertag)
      FROM members m WHERE m.club_id = (SELECT id FROM club) AND m.is_active
        AND NOT EXISTS(SELECT 1 FROM club_player_claims r WHERE r.member_id = m.id AND r.status = 'approved')), '[]'::jsonb),
    'adminClaims', CASE WHEN p_admin THEN coalesce((SELECT jsonb_agg(jsonb_build_object(
      'id', r.id, 'status', r.status, 'memberId', m.id, 'gamertag', m.gamertag, 'createdAt', r.created_at,
      'reviewedAt', r.reviewed_at, 'reviewNote', r.review_note, 'accountId', a.id, 'username', a.username,
      'displayName', a.display_name, 'discordId', a.discord_id) ORDER BY r.created_at, r.id)
      FROM club_player_claims r JOIN members m ON m.id = r.member_id JOIN club_accounts a ON a.id = r.account_id
      WHERE m.club_id = (SELECT id FROM club) AND r.status IN ('pending', 'approved')), '[]'::jsonb) ELSE '[]'::jsonb END
  );
$$;--> statement-breakpoint
CREATE OR REPLACE FUNCTION club_profile_dispatch(p_action text, p_account integer, p_input jsonb DEFAULT '{}', p_admin_ids text[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  club_key integer;
  actor_discord text;
  admin boolean;
  claim club_player_claims%ROWTYPE;
  member_key integer;
BEGIN
  SELECT discord_id INTO actor_discord FROM club_accounts WHERE id = p_account;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Session inconnue. Reconnecte-toi.', 'status', 401); END IF;
  -- Cette liste vient uniquement de la configuration du serveur, jamais du formulaire.
  admin := actor_discord = ANY(coalesce(p_admin_ids, '{}'::text[]));
  IF p_action IN ('approve', 'reject', 'revoke') AND NOT admin THEN
    RETURN jsonb_build_object('error', 'Seul un administrateur peut valider les correspondances.', 'status', 403);
  END IF;
  IF p_action = 'state' THEN
    IF NOT EXISTS(SELECT 1 FROM clubs) THEN RETURN jsonb_build_object('error', 'Aucun club disponible.', 'status', 404); END IF;
    RETURN club_profile_snapshot(p_account, admin);
  END IF;
  -- Même ordre de verrouillage que les autres actions du club. Les validations
  -- concurrentes ne peuvent attribuer un joueur ou un compte deux fois.
  SELECT id INTO club_key FROM clubs ORDER BY id LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Aucun club disponible.', 'status', 404); END IF;
  CASE p_action
  WHEN 'request' THEN
    IF EXISTS(SELECT 1 FROM club_player_claims WHERE account_id = p_account AND status IN ('pending', 'approved')) THEN
      RETURN jsonb_build_object('error', 'Tu as déjà une demande en attente ou un joueur validé.', 'status', 409);
    END IF;
    member_key := (p_input->>'memberId')::integer;
    IF NOT EXISTS(SELECT 1 FROM members WHERE id = member_key AND club_id = club_key AND is_active) THEN
      RETURN jsonb_build_object('error', 'Choisis un joueur actif de ce club.', 'status', 400);
    END IF;
    IF EXISTS(SELECT 1 FROM club_player_claims WHERE member_id = member_key AND status = 'approved') THEN
      RETURN jsonb_build_object('error', 'Ce joueur est déjà rattaché à un compte. Contacte un administrateur.', 'status', 409);
    END IF;
    INSERT INTO club_player_claims(account_id, member_id) VALUES(p_account, member_key);
  WHEN 'cancel', 'approve', 'reject', 'revoke' THEN
    SELECT r.* INTO claim FROM club_player_claims r JOIN members m ON m.id = r.member_id
      WHERE r.id = (p_input->>'requestId')::integer AND m.club_id = club_key FOR UPDATE OF r;
    IF NOT FOUND OR (p_action = 'cancel' AND claim.account_id <> p_account) THEN
      RETURN jsonb_build_object('error', 'Demande introuvable.', 'status', 404);
    END IF;
    IF (p_action = 'revoke' AND claim.status <> 'approved') OR (p_action <> 'revoke' AND claim.status <> 'pending') THEN
      RETURN jsonb_build_object('error', 'Cette demande a déjà été traitée. Actualise la liste.', 'status', 409);
    END IF;
    IF p_action = 'approve' THEN
      IF NOT EXISTS(SELECT 1 FROM members WHERE id = claim.member_id AND is_active) THEN
        RETURN jsonb_build_object('error', 'Ce joueur ne fait plus partie de l’effectif actif.', 'status', 409);
      END IF;
      IF EXISTS(SELECT 1 FROM club_player_claims WHERE member_id = claim.member_id AND status = 'approved') THEN
        RETURN jsonb_build_object('error', 'Ce joueur a déjà été attribué.', 'status', 409);
      END IF;
      -- Les autres demandeurs sont informés que la place a été attribuée.
      UPDATE club_player_claims SET status = 'rejected', reviewed_at = clock_timestamp(), reviewed_by = p_account,
        review_note = 'Ce joueur a été rattaché à un autre compte par un administrateur.'
        WHERE member_id = claim.member_id AND status = 'pending' AND id <> claim.id;
    END IF;
    UPDATE club_player_claims SET status = CASE p_action WHEN 'cancel' THEN 'cancelled' WHEN 'approve' THEN 'approved'
      WHEN 'reject' THEN 'rejected' ELSE 'revoked' END, reviewed_at = clock_timestamp(), reviewed_by = p_account,
      review_note = nullif(btrim(p_input->>'note'), '') WHERE id = claim.id;
  ELSE
    RETURN jsonb_build_object('error', 'Action inconnue.', 'status', 400);
  END CASE;
  RETURN club_profile_snapshot(p_account, admin);
END;
$$;
