-- Niveau de nos adversaires.
--
-- EA ne met pas le skill rating dans les données d'un match : server/ea-sync.ts le demande
-- à part (fiche du club adverse) et le fige sur le match, avec le nôtre au même moment,
-- pour comparer les deux niveaux du jour du match.
--
-- `opponent_sr_estimated` : la fiche adverse a été lue bien après le match (matchs déjà en
-- base avant cette migration, ou synchro tardive) : son skill rating a pu bouger depuis.
-- `opponent_checked_at` : null tant que la fiche adverse n'a pas été lue pour ce match.
ALTER TABLE matches ADD COLUMN opponent_skill_rating integer;--> statement-breakpoint
ALTER TABLE matches ADD COLUMN our_skill_rating integer;--> statement-breakpoint
ALTER TABLE matches ADD COLUMN opponent_sr_estimated boolean NOT NULL DEFAULT false;--> statement-breakpoint
ALTER TABLE matches ADD COLUMN opponent_checked_at timestamp with time zone;--> statement-breakpoint
-- Dernière fiche EA connue de chaque club adverse (bilan, séries, skill rating du jour).
CREATE TABLE opponent_clubs (
  ea_club_id text PRIMARY KEY,
  name text NOT NULL,
  overall jsonb NOT NULL,
  fetched_at timestamp with time zone NOT NULL DEFAULT now()
);
