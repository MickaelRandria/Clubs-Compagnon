CREATE TYPE "public"."match_result" AS ENUM('win', 'draw', 'loss');--> statement-breakpoint
CREATE TYPE "public"."match_type" AS ENUM('league', 'playoff', 'friendly');--> statement-breakpoint
CREATE TYPE "public"."player_position" AS ENUM('FW', 'MF', 'DF', 'GK');--> statement-breakpoint
CREATE TABLE "club_rating_snapshots" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "club_rating_snapshots_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"club_id" integer NOT NULL,
	"skill_rating" integer NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clubs" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "clubs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"handle" text,
	"ea_club_id" text,
	"platform" text,
	"region" text NOT NULL,
	"reputation" text NOT NULL,
	"skill_rating" integer NOT NULL,
	"best_division" smallint,
	"wins" integer DEFAULT 0 NOT NULL,
	"draws" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"games_played" integer GENERATED ALWAYS AS (wins + draws + losses) STORED,
	"goals_for" integer DEFAULT 0 NOT NULL,
	"goals_against" integer DEFAULT 0 NOT NULL,
	"league_apps" integer DEFAULT 0 NOT NULL,
	"playoff_apps" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clubs_ea_club_id_unique" UNIQUE("ea_club_id")
);
--> statement-breakpoint
CREATE TABLE "match_notes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "match_notes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"match_id" bigint NOT NULL,
	"author_name" text NOT NULL,
	"body" text NOT NULL,
	"motm_member_id" integer,
	"video_url" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_notes_author_name_check" CHECK (char_length("match_notes"."author_name") between 1 and 40),
	CONSTRAINT "match_notes_body_check" CHECK (char_length("match_notes"."body") between 1 and 2000),
	CONSTRAINT "match_notes_video_url_check" CHECK ("match_notes"."video_url" ~ '^https?://')
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "matches_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"club_id" integer NOT NULL,
	"ea_match_id" text,
	"played_at" timestamp with time zone NOT NULL,
	"match_type" "match_type" NOT NULL,
	"opponent_name" text NOT NULL,
	"opponent_ea_club_id" text,
	"goals_for" smallint NOT NULL,
	"goals_against" smallint NOT NULL,
	"result" "match_result" NOT NULL,
	"possession_pct" smallint,
	"shots" smallint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_ea_match_id_unique" UNIQUE("ea_match_id"),
	CONSTRAINT "matches_goals_for_check" CHECK ("matches"."goals_for" >= 0),
	CONSTRAINT "matches_goals_against_check" CHECK ("matches"."goals_against" >= 0),
	CONSTRAINT "matches_possession_pct_check" CHECK ("matches"."possession_pct" between 0 and 100),
	CONSTRAINT "matches_shots_check" CHECK ("matches"."shots" >= 0)
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "members_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"club_id" integer NOT NULL,
	"gamertag" text NOT NULL,
	"position" "player_position" NOT NULL,
	"ovr" smallint NOT NULL,
	"matches_played" integer DEFAULT 0 NOT NULL,
	"goals" integer DEFAULT 0 NOT NULL,
	"assists" integer DEFAULT 0 NOT NULL,
	"avg_rating" numeric(3, 1),
	"pass_pct" smallint,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_club_gamertag_key" UNIQUE("club_id","gamertag"),
	CONSTRAINT "members_ovr_check" CHECK ("members"."ovr" between 0 and 99),
	CONSTRAINT "members_avg_rating_check" CHECK ("members"."avg_rating" between 0 and 10),
	CONSTRAINT "members_pass_pct_check" CHECK ("members"."pass_pct" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "club_rating_snapshots" ADD CONSTRAINT "club_rating_snapshots_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_notes" ADD CONSTRAINT "match_notes_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_notes" ADD CONSTRAINT "match_notes_motm_member_id_members_id_fk" FOREIGN KEY ("motm_member_id") REFERENCES "public"."members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "club_rating_snapshots_club_taken_idx" ON "club_rating_snapshots" USING btree ("club_id","taken_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "match_notes_match_created_idx" ON "match_notes" USING btree ("match_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "matches_club_played_idx" ON "matches" USING btree ("club_id","played_at" DESC NULLS LAST);