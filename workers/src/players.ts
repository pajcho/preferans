// Best-effort profil igrača za analitiku: poslednje ime + lokacija (Cloudflare request.cf).
// Deli ga router (create/join) i vs-kompjuter submit — upis ide kroz ctx.waitUntil (ne blokira odgovor).
export function upsertPlayer(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
  userId: string,
  displayName: string,
): void {
  const cf = request.cf;
  const country = typeof cf?.country === 'string' ? cf.country : null;
  const city = typeof cf?.city === 'string' ? cf.city : null;
  const now = new Date().toISOString();
  ctx.waitUntil(
    env.DB.prepare(
      `INSERT INTO players (user_id, display_name, country, city, first_seen, last_seen)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         display_name = excluded.display_name,
         country = COALESCE(excluded.country, players.country),
         city = COALESCE(excluded.city, players.city),
         last_seen = excluded.last_seen`,
    )
      .bind(userId, displayName, country, city, now, now)
      .run()
      .then(
        () => {},
        (e: unknown) => console.error('[players]', userId, e),
      ),
  );
}
