CREATE TABLE "fc27_name_elections" (
	"campaign_id" integer PRIMARY KEY NOT NULL,
	"phase" text DEFAULT 'proposing' NOT NULL,
	"started_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"winner_proposal_id" integer,
	"tie_break_applied" boolean DEFAULT false NOT NULL,
	CONSTRAINT "fc27_election_phase_check" CHECK ("fc27_name_elections"."phase" in ('proposing', 'voting', 'closed', 'cancelled')),
	CONSTRAINT "fc27_election_state_check" CHECK (("fc27_name_elections"."phase" = 'proposing' and "fc27_name_elections"."started_at" is null and "fc27_name_elections"."closed_at" is null and "fc27_name_elections"."winner_proposal_id" is null) or ("fc27_name_elections"."phase" = 'voting' and "fc27_name_elections"."started_at" is not null and "fc27_name_elections"."closed_at" is null and "fc27_name_elections"."winner_proposal_id" is null) or ("fc27_name_elections"."phase" = 'closed' and "fc27_name_elections"."started_at" is not null and "fc27_name_elections"."closed_at" is not null and "fc27_name_elections"."winner_proposal_id" is not null) or ("fc27_name_elections"."phase" = 'cancelled' and "fc27_name_elections"."closed_at" is not null and "fc27_name_elections"."winner_proposal_id" is null))
);
--> statement-breakpoint
CREATE TABLE "fc27_name_votes" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "fc27_name_votes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"campaign_id" integer NOT NULL,
	"proposal_id" integer NOT NULL,
	"voter_pseudo" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fc27_name_vote_pseudo_key" UNIQUE("campaign_id","voter_pseudo"),
	CONSTRAINT "fc27_name_vote_pseudo_check" CHECK (char_length("fc27_name_votes"."voter_pseudo") between 1 and 40 and "fc27_name_votes"."voter_pseudo" ~ '[^[:space:]]')
);
--> statement-breakpoint
ALTER TABLE "fc27_name_proposals" ADD COLUMN "final_votes" integer;--> statement-breakpoint
ALTER TABLE "fc27_name_elections" ADD CONSTRAINT "fc27_name_elections_campaign_id_fc27_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."fc27_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fc27_name_elections" ADD CONSTRAINT "fc27_name_elections_winner_proposal_id_campaign_id_fc27_name_proposals_id_campaign_id_fk" FOREIGN KEY ("winner_proposal_id","campaign_id") REFERENCES "public"."fc27_name_proposals"("id","campaign_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fc27_name_votes" ADD CONSTRAINT "fc27_name_votes_campaign_id_fc27_name_elections_campaign_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."fc27_name_elections"("campaign_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fc27_name_votes" ADD CONSTRAINT "fc27_name_votes_proposal_id_campaign_id_fc27_name_proposals_id_campaign_id_fk" FOREIGN KEY ("proposal_id","campaign_id") REFERENCES "public"."fc27_name_proposals"("id","campaign_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fc27_name_vote_proposal_idx" ON "fc27_name_votes" USING btree ("proposal_id","campaign_id");--> statement-breakpoint
ALTER TABLE "fc27_name_proposals" ADD CONSTRAINT "fc27_proposal_final_votes_check" CHECK ("fc27_name_proposals"."final_votes" >= 0);