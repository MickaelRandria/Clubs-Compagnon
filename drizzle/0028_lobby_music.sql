-- « En ce moment dans le lobby » : le titre Spotify en cours chez l'hôte, et le lien de la Jam.
--
-- Une seule ligne (id = 1). L'hôte (un admin) relie son compte Spotify : le serveur garde le jeton de
-- rafraîchissement et appelle Spotify à sa place (server/spotify.ts). Le lien de la Jam est collé par un admin.
CREATE TABLE lobby_music (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  account_id integer REFERENCES club_accounts(id) ON DELETE SET NULL,
  refresh_token text,
  access_token text,
  expires_at timestamp with time zone,
  jam_url text,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
