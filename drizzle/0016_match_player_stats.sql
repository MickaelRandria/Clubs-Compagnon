-- Feuille de match EA : note, buts, passes, tacles… de chaque joueur du club.
-- Remplie par la synchro (server/ea-sync.ts), y compris pour les matchs déjà en base.
ALTER TABLE matches ADD COLUMN player_stats jsonb;
