// Supabase klijenti unutar edge funkcija.
import { createClient } from 'npm:@supabase/supabase-js@2'
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { HttpError } from './http.ts'

export function supabaseUrl(): string {
  return Deno.env.get('SUPABASE_URL') ?? ''
}

export function serviceKey(): string {
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_SECRET_KEY') ?? ''
}

/** Service-role klijent — jedini sme da čita/piše game_states i game_actions. */
export function adminClient(): SupabaseClient {
  return createClient(supabaseUrl(), serviceKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export interface AuthedUser {
  id: string
}

/** Izvuci korisnika iz Authorization header-a (JWT već verifikovan na platformi). */
export async function requireUser(req: Request, admin: SupabaseClient): Promise<AuthedUser> {
  const header = req.headers.get('Authorization') ?? ''
  const token = header.replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError(401, 'Nedostaje autorizacija')
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'Neispravna sesija')
  return { id: data.user.id }
}
