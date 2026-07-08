-- Rows-read optimizacija za admin analitiku (bez ovoga admin dashboard skenira cele tabele).
--
-- PLAYER_SELECT racuna (SELECT COUNT(*) FROM hands WHERE declarer_user_id = ?) kao korelisani
-- podupit za SVAKI red u players (zbog ORDER BY games_played) — bez indeksa to je pun scan
-- `hands` po svakom igracu (kvadratno: players × hands). Indeks ga pretvara u seek.
CREATE INDEX idx_hands_declarer_user ON hands(declarer_user_id);

-- Admin lista partija: `ORDER BY updated_at DESC LIMIT` — bez indeksa skenira sve pa sortira.
CREATE INDEX idx_games_updated_at ON games(updated_at);
