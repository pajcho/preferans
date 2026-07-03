// Supabase klijent (browser) + anonimna sesija.
// Identitet: svaki igrač automatski dobija trajni anonimni nalog (localStorage);
// kasnije se može povezati sa Google nalogom (linkIdentity) — Faza 3.
import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null

export function hasSupabaseEnv(): boolean {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
}

export function supabase(): SupabaseClient {
  if (!client) {
    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
    if (!url || !key) {
      throw new Error('Online igra nije podešena (nedostaju VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)')
    }
    client = createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  }
  return client
}

/** Vrati user id; ako nema sesije, tiho napravi anonimni nalog. */
export async function ensureSession(displayName?: string): Promise<string> {
  const sb = supabase()
  const { data } = await sb.auth.getSession()
  if (data.session) return data.session.user.id
  const { data: signed, error } = await sb.auth.signInAnonymously(
    displayName ? { options: { data: { display_name: displayName } } } : undefined,
  )
  if (error || !signed.user) {
    throw new Error(`Prijava nije uspela${error ? `: ${error.message}` : ''}`)
  }
  return signed.user.id
}

export async function currentUserId(): Promise<string | null> {
  if (!hasSupabaseEnv()) return null
  const { data } = await supabase().auth.getSession()
  return data.session?.user.id ?? null
}
