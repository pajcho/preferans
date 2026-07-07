-- Analitika za admin dashboard.
-- players: profil po anonimnom userId-u (poslednje ime, lokacija iz request.cf, aktivnost).
-- hands: svaka obodovana ruka (ugovor, kontra, pad) — „šta se najviše igra".

CREATE TABLE players (
  user_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  country TEXT,                       -- ISO kod iz request.cf.country
  city TEXT,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL
);

CREATE INDEX idx_players_last_seen ON players(last_seen);

CREATE TABLE hands (
  code TEXT NOT NULL,
  hand_no INTEGER NOT NULL,
  declarer_seat INTEGER NOT NULL,
  declarer_name TEXT NOT NULL,
  declarer_user_id TEXT,              -- NULL za botove
  contract TEXT NOT NULL,             -- pik | karo | herc | tref | betl | sans
  as_igra INTEGER NOT NULL DEFAULT 0, -- „igra" (bez talona)
  kontra INTEGER NOT NULL DEFAULT 0,  -- 0..4 (kontra..mortkontra)
  passed INTEGER NOT NULL DEFAULT 0,  -- 1 = nosilac PROŠAO (napravio ugovor: štihova >=6, betl = 0); 0 = pao
  played_at TEXT NOT NULL,
  PRIMARY KEY (code, hand_no)
);

CREATE INDEX idx_hands_contract ON hands(contract);
CREATE INDEX idx_hands_played_at ON hands(played_at);
