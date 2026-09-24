-- Réglages applicatifs modifiables sans redéploiement.
--
-- Première clé : `bets_mode`, l'interrupteur de lancement de Vestiaire Bets
-- ('off' | 'admins' | 'on'). Il démarre sur 'off' : la tuile reste grisée pour tous.
CREATE TABLE app_settings (
  key text PRIMARY KEY CHECK (char_length(key) between 1 and 60),
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by integer REFERENCES club_accounts(id) ON DELETE SET NULL
);--> statement-breakpoint
INSERT INTO app_settings(key, value) VALUES ('bets_mode', '"off"');
