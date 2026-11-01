-- L'hôte peut masquer le lecteur public. Les portées proviennent de la réponse OAuth réelle.
ALTER TABLE lobby_music ADD COLUMN visible boolean NOT NULL DEFAULT true;
--> statement-breakpoint
ALTER TABLE lobby_music ADD COLUMN spotify_scope text;
