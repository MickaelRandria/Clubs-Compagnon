-- Progression en division (voir shared/division-progress.ts et server/division.ts).
--
-- EA ne donne que la division actuelle et les compteurs de la saison : on les relève à chaque
-- synchro où ils bougent, et chaque changement de division devient un événement daté par son
-- match décisif. Les points et les chances se recalculent ensuite à partir des matchs en base.
CREATE TABLE club_season_snapshots (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  club_id integer NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  division smallint NOT NULL,
  games_played integer NOT NULL,
  wins integer NOT NULL,
  draws integer NOT NULL,
  losses integer NOT NULL,
  promotions integer NOT NULL,
  relegations integer NOT NULL,
  taken_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX club_season_snapshots_club_taken_idx ON club_season_snapshots (club_id, taken_at DESC);--> statement-breakpoint
-- `starts_after` : la division commence avec le premier match de ligue joué après cet instant.
CREATE TABLE club_division_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  club_id integer NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('promotion', 'relegation', 'anchor', 'season')),
  from_division smallint,
  to_division smallint NOT NULL,
  starts_after timestamptz NOT NULL,
  match_id bigint REFERENCES matches(id) ON DELETE SET NULL,
  points smallint,
  exact boolean NOT NULL DEFAULT false,
  detected_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE INDEX club_division_events_club_idx ON club_division_events (club_id, starts_after DESC);
