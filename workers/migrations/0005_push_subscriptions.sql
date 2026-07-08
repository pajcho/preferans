-- Web Push pretplate (VAPID). Jedan red = jedan uređaj/browser (endpoint je prirodni ključ).
-- DO (GameRoom) čita po user_id da pošalje „na potezu si" push kad je igrač offline.
CREATE TABLE push_subscriptions (
  endpoint TEXT PRIMARY KEY,          -- push servis URL (jedinstven po uređaju)
  user_id TEXT NOT NULL,              -- identitet (anonimni ili nalog)
  p256dh TEXT NOT NULL,               -- base64url javni ključ pretplate
  auth TEXT NOT NULL,                 -- base64url auth secret
  user_agent TEXT,                    -- radi prepoznavanja uređaja u Podešavanjima
  created_at TEXT NOT NULL,
  last_seen TEXT NOT NULL
);
CREATE INDEX idx_push_subs_user ON push_subscriptions(user_id);
