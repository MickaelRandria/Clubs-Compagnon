CREATE TYPE "public"."fc27_position" AS ENUM('GK', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LM', 'RM', 'LW', 'RW', 'ST');--> statement-breakpoint
CREATE TABLE "fc27_campaigns" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "fc27_campaigns_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"club_id" integer NOT NULL,
	"status" text DEFAULT 'preparation' NOT NULL,
	"expected_voters" integer DEFAULT 10 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "fc27_campaign_status_check" CHECK ("fc27_campaigns"."status" in ('preparation', 'archived')),
	CONSTRAINT "fc27_quorum_check" CHECK ("fc27_campaigns"."expected_voters" between 1 and 1000)
);
--> statement-breakpoint
CREATE TABLE "fc27_name_proposals" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "fc27_name_proposals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"campaign_id" integer NOT NULL,
	"author_pseudo" text NOT NULL,
	"club_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fc27_proposal_campaign_key" UNIQUE("id","campaign_id"),
	CONSTRAINT "fc27_proposal_pseudo_check" CHECK (char_length("fc27_name_proposals"."author_pseudo") between 1 and 40 and "fc27_name_proposals"."author_pseudo" ~ '[^[:space:]]'),
	CONSTRAINT "fc27_name_check" CHECK (char_length("fc27_name_proposals"."club_name") between 1 and 60 and "fc27_name_proposals"."club_name" ~ '[^[:space:]]')
);
--> statement-breakpoint
CREATE TABLE "fc27_player_profiles" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "fc27_player_profiles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"campaign_id" integer NOT NULL,
	"pseudo" text NOT NULL,
	"in_game_name" text,
	"primary_position" "fc27_position" NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fc27_player_pseudo_key" UNIQUE("campaign_id","pseudo"),
	CONSTRAINT "fc27_player_pseudo_check" CHECK (char_length("fc27_player_profiles"."pseudo") between 1 and 40 and "fc27_player_profiles"."pseudo" ~ '[^[:space:]]'),
	CONSTRAINT "fc27_player_name_check" CHECK (char_length("fc27_player_profiles"."in_game_name") <= 60),
	CONSTRAINT "fc27_player_notes_check" CHECK (char_length("fc27_player_profiles"."notes") <= 1000)
);
--> statement-breakpoint
CREATE TABLE "fc27_player_secondary_positions" (
	"profile_id" integer NOT NULL,
	"position" "fc27_position" NOT NULL,
	CONSTRAINT "fc27_player_secondary_positions_profile_id_position_pk" PRIMARY KEY("profile_id","position")
);
--> statement-breakpoint
CREATE TABLE "fc27_round_candidates" (
	"round_id" integer NOT NULL,
	"proposal_id" integer NOT NULL,
	"campaign_id" integer NOT NULL,
	"final_vote_count" integer,
	"eliminated" boolean DEFAULT false NOT NULL,
	CONSTRAINT "fc27_round_candidates_round_id_proposal_id_pk" PRIMARY KEY("round_id","proposal_id"),
	CONSTRAINT "fc27_final_votes_check" CHECK ("fc27_round_candidates"."final_vote_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "fc27_rounds" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "fc27_rounds_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"campaign_id" integer NOT NULL,
	"number" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"quorum" integer,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deadline_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"close_reason" text,
	"eliminated_proposal_id" integer,
	"tie_break_applied" boolean DEFAULT false NOT NULL,
	CONSTRAINT "fc27_round_number_key" UNIQUE("campaign_id","number"),
	CONSTRAINT "fc27_round_campaign_key" UNIQUE("id","campaign_id"),
	CONSTRAINT "fc27_round_status_check" CHECK ("fc27_rounds"."status" in ('open', 'closed')),
	CONSTRAINT "fc27_round_phase_check" CHECK (("fc27_rounds"."number" = 0 and "fc27_rounds"."quorum" is null and "fc27_rounds"."deadline_at" is null) or ("fc27_rounds"."number" > 0 and "fc27_rounds"."quorum" between 1 and 1000 and "fc27_rounds"."deadline_at" is not null)),
	CONSTRAINT "fc27_round_close_check" CHECK (("fc27_rounds"."status" = 'open' and "fc27_rounds"."closed_at" is null and "fc27_rounds"."close_reason" is null) or ("fc27_rounds"."status" = 'closed' and "fc27_rounds"."closed_at" is not null and "fc27_rounds"."close_reason" in ('start', 'quorum', 'timeout', 'archive')))
);
--> statement-breakpoint
CREATE TABLE "fc27_votes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "fc27_votes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"round_id" integer NOT NULL,
	"proposal_id" integer NOT NULL,
	"voter_pseudo" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fc27_vote_pseudo_key" UNIQUE("round_id","voter_pseudo"),
	CONSTRAINT "fc27_vote_pseudo_check" CHECK (char_length("fc27_votes"."voter_pseudo") between 1 and 40 and "fc27_votes"."voter_pseudo" ~ '[^[:space:]]')
);
--> statement-breakpoint
ALTER TABLE "fc27_campaigns" ADD CONSTRAINT "fc27_campaigns_club_id_clubs_id_fk" FOREIGN KEY ("club_id") REFERENCES "public"."clubs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fc27_name_proposals" ADD CONSTRAINT "fc27_name_proposals_campaign_id_fc27_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."fc27_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fc27_player_profiles" ADD CONSTRAINT "fc27_player_profiles_campaign_id_fc27_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."fc27_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fc27_player_secondary_positions" ADD CONSTRAINT "fc27_player_secondary_positions_profile_id_fc27_player_profiles_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."fc27_player_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fc27_round_candidates" ADD CONSTRAINT "fc27_round_candidates_round_id_campaign_id_fc27_rounds_id_campaign_id_fk" FOREIGN KEY ("round_id","campaign_id") REFERENCES "public"."fc27_rounds"("id","campaign_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fc27_round_candidates" ADD CONSTRAINT "fc27_round_candidates_proposal_id_campaign_id_fc27_name_proposals_id_campaign_id_fk" FOREIGN KEY ("proposal_id","campaign_id") REFERENCES "public"."fc27_name_proposals"("id","campaign_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fc27_rounds" ADD CONSTRAINT "fc27_rounds_campaign_id_fc27_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."fc27_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fc27_rounds" ADD CONSTRAINT "fc27_eliminated_campaign_fk" FOREIGN KEY ("eliminated_proposal_id","campaign_id") REFERENCES "public"."fc27_name_proposals"("id","campaign_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fc27_votes" ADD CONSTRAINT "fc27_votes_round_id_proposal_id_fc27_round_candidates_round_id_proposal_id_fk" FOREIGN KEY ("round_id","proposal_id") REFERENCES "public"."fc27_round_candidates"("round_id","proposal_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "fc27_one_active_campaign" ON "fc27_campaigns" USING btree ("club_id") WHERE "fc27_campaigns"."status" = 'preparation';--> statement-breakpoint
CREATE INDEX "fc27_campaign_club_idx" ON "fc27_campaigns" USING btree ("club_id");--> statement-breakpoint
CREATE INDEX "fc27_proposal_campaign_idx" ON "fc27_name_proposals" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "fc27_player_position_idx" ON "fc27_player_profiles" USING btree ("campaign_id","primary_position");--> statement-breakpoint
CREATE INDEX "fc27_candidate_proposal_idx" ON "fc27_round_candidates" USING btree ("proposal_id","campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fc27_one_open_round" ON "fc27_rounds" USING btree ("campaign_id") WHERE "fc27_rounds"."status" = 'open';--> statement-breakpoint
CREATE INDEX "fc27_round_deadline_idx" ON "fc27_rounds" USING btree ("deadline_at") WHERE "fc27_rounds"."status" = 'open' and "fc27_rounds"."number" > 0;--> statement-breakpoint
CREATE INDEX "fc27_vote_candidate_idx" ON "fc27_votes" USING btree ("round_id","proposal_id");