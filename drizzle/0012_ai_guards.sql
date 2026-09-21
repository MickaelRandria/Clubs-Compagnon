-- Garde-fous des routes IA (coach et débrief de match).
--
-- Deux tables indépendantes des actions du club, comme fc27_staff_reports : elles se
-- purgent sans rien toucher d'autre.

-- Un débrief par match et par état de ses notes. input_hash couvre les stats du match,
-- les notes et la version du format : une note ajoutée ou modifiée produit un nouveau
-- débrief, un simple rechargement de la page réutilise l'existant au lieu d'un nouvel
-- appel facturé.
CREATE TABLE match_debriefs (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  match_id integer NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  input_hash text NOT NULL CHECK (char_length(input_hash) between 1 and 80),
  payload jsonb NOT NULL,
  model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);--> statement-breakpoint
CREATE UNIQUE INDEX match_debrief_key ON match_debriefs(match_id, input_hash);--> statement-breakpoint

-- Appels au coach par compte et par jour. N'importe qui peut créer un compte Discord :
-- la session seule ne protège pas le quota Mistral, un plafond par compte le fait.
CREATE TABLE ai_usage (
  account_id integer NOT NULL REFERENCES club_accounts(id) ON DELETE CASCADE,
  day date NOT NULL,
  calls integer NOT NULL DEFAULT 0 CHECK (calls >= 0),
  PRIMARY KEY (account_id, day)
);
