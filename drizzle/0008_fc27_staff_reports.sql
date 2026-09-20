-- Cache des analyses rédigées par le modèle, une par composition d'effectif.
-- L'empreinte (squad_hash) est calculée côté application par squadFingerprint() :
-- même effectif = même empreinte = un seul appel facturé pour tout le club.
-- Table indépendante de fc27_dispatch : une analyse n'est pas une action du collectif,
-- elle se régénère et se purge sans toucher aux fiches.
CREATE TABLE "fc27_staff_reports" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY NOT NULL,
  "campaign_id" integer NOT NULL REFERENCES "fc27_campaigns"("id") ON DELETE CASCADE,
  "squad_hash" text NOT NULL,
  "payload" jsonb NOT NULL,
  "model" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "fc27_staff_report_hash_check" CHECK (char_length("squad_hash") between 1 and 80)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "fc27_staff_report_key" ON "fc27_staff_reports" ("campaign_id", "squad_hash");
