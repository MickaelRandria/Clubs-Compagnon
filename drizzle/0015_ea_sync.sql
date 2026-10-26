-- Saison FC 27 : le club devient FoodBall Club et ses stats viennent de l'API EA.
--
-- `ea_synced_at` date la dernière synchro et sert de verrou (server/ea-sync.ts).
ALTER TABLE clubs ADD COLUMN ea_synced_at timestamptz;--> statement-breakpoint
UPDATE clubs SET name = 'FoodBall Club', handle = NULL, ea_club_id = '716066', platform = 'common-gen5'
WHERE id = (SELECT min(id) FROM clubs);--> statement-breakpoint
-- Les matchs de démonstration du seed (sans identifiant EA) laissent la place aux vrais.
-- Leurs notes et débriefs partent avec eux (ON DELETE CASCADE).
DELETE FROM matches WHERE ea_match_id IS NULL;--> statement-breakpoint
-- L'historique du rating de démonstration fausserait la tendance à 30 jours.
DELETE FROM club_rating_snapshots WHERE club_id = (SELECT min(id) FROM clubs);
