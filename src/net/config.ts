// Bazni URL backend-a (Cloudflare Worker). U dev build-u podrazumevano
// pokazuje na lokalni `wrangler dev` (port 8787); u produkciji mora VITE_API_URL.

const DEV_DEFAULT = 'http://localhost:8787'

export function apiBaseUrl(): string | null {
  const configured = import.meta.env.VITE_API_URL as string | undefined
  if (configured) return configured.replace(/\/$/, '')
  return import.meta.env.DEV ? DEV_DEFAULT : null
}

export function hasOnlineEnv(): boolean {
  return apiBaseUrl() !== null
}
