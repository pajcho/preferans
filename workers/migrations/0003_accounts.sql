-- Nalozi: opciona nadogradnja anonimnog identiteta u pravi nalog (email + lozinka).
-- userId ostaje isti pri registraciji, pa sve postojeće partije (game_players.user_id)
-- automatski pripadaju nalogu; prijava na drugom uređaju vraća isti userId + token.

ALTER TABLE players ADD COLUMN email TEXT;
ALTER TABLE players ADD COLUMN password_hash TEXT;

CREATE UNIQUE INDEX idx_players_email ON players(email) WHERE email IS NOT NULL;
