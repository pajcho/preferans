-- D1: lookup partija po kodu + lista „Moje partije".
-- Pun GameState i log poteza žive u GameRoom Durable Object storage-u;
-- ovde su samo metapodaci koje DO asinhrono sinhronizuje.

CREATE TABLE games (
  code TEXT PRIMARY KEY,
  status TEXT NOT NULL,               -- lobby | active | finished | abandoned
  created_by TEXT NOT NULL,           -- userId kreatora
  starting_bule INTEGER NOT NULL,
  seats TEXT NOT NULL,                -- JSON SeatsConfig
  phase TEXT,
  hand_no INTEGER NOT NULL DEFAULT 0,
  current_actor INTEGER,
  version INTEGER NOT NULL DEFAULT 0,
  summary TEXT,                       -- JSON { scores } kad je finished
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_games_status ON games(status);

CREATE TABLE game_players (
  code TEXT NOT NULL,
  seat INTEGER NOT NULL,
  user_id TEXT,                       -- NULL za botove
  display_name TEXT NOT NULL,
  is_bot INTEGER NOT NULL DEFAULT 0,
  bot_difficulty TEXT,
  PRIMARY KEY (code, seat)
);

CREATE INDEX idx_game_players_user ON game_players(user_id);
