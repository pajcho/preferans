import { env, SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { AuthResponse } from '../../src/protocol/messages.ts';
import { turnNotifyTarget } from '../src/room.ts';
import type { PlayerRec } from '../src/room.ts';

const BASE = 'https://prefa.test';

async function anon(): Promise<AuthResponse> {
  const res = await SELF.fetch(`${BASE}/api/auth/anon`, { method: 'POST' });
  expect(res.status).toBe(200);
  return res.json();
}

function post(path: string, token: string, body: unknown): Promise<Response> {
  return SELF.fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ── Čista odluka: koga obavestiti da je na potezu ──
describe('turnNotifyTarget', () => {
  const players: PlayerRec[] = [
    { seat: 0, userId: 'u0', displayName: 'Ana', isBot: false, botDifficulty: null },
    { seat: 1, userId: null, displayName: 'Pera', isBot: true, botDifficulty: 'medium' },
    { seat: 2, userId: 'u2', displayName: 'Mika', isBot: false, botDifficulty: null },
  ];
  type Meta = Parameters<typeof turnNotifyTarget>[0];
  const base: Meta = { status: 'active', abandon: null, currentActor: 0, players, version: 5, lastTurnPush: null };

  it('offline čovek na potezu → meta za push', () => {
    expect(turnNotifyTarget(base, new Set())).toEqual({ userId: 'u0', seat: 0 });
  });
  it('povezan igrač (gleda partiju) → null', () => {
    expect(turnNotifyTarget(base, new Set(['u0']))).toBeNull();
  });
  it('bot na potezu → null', () => {
    expect(turnNotifyTarget({ ...base, currentActor: 1 }, new Set())).toBeNull();
  });
  it('već poslato za ovu verziju (dedup) → null', () => {
    expect(turnNotifyTarget({ ...base, lastTurnPush: 5 }, new Set())).toBeNull();
  });
  it('pauza (predlog prekida) → null', () => {
    expect(turnNotifyTarget({ ...base, abandon: { by: 2, votes: {} } }, new Set())).toBeNull();
  });
  it('partija nije aktivna → null', () => {
    expect(turnNotifyTarget({ ...base, status: 'lobby' }, new Set())).toBeNull();
  });
  it('nema aktera (npr. između štihova) → null', () => {
    expect(turnNotifyTarget({ ...base, currentActor: null }, new Set())).toBeNull();
  });
});

// ── REST: pretplata na push ──
describe('push subscribe/unsubscribe', () => {
  const sub = (endpoint: string) => ({
    endpoint,
    keys: { p256dh: 'BExamplePublicKeyBase64Url', auth: 'AuthSecretBase64Url' },
    userAgent: 'Vitest/1.0',
  });

  it('čuva pretplatu pod pozivaocem i briše je', async () => {
    const { token, userId } = await anon();
    const endpoint = 'https://push.example.com/dev-1';

    const res = await post('/api/push/subscribe', token, sub(endpoint));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });

    const row = await env.DB.prepare('SELECT user_id FROM push_subscriptions WHERE endpoint = ?')
      .bind(endpoint)
      .first<{ user_id: string }>();
    expect(row?.user_id).toBe(userId);

    const del = await post('/api/push/unsubscribe', token, { endpoint });
    expect(del.status).toBe(200);
    const gone = await env.DB.prepare('SELECT 1 FROM push_subscriptions WHERE endpoint = ?').bind(endpoint).first();
    expect(gone).toBeNull();
  });

  it('drugi subscribe za isti endpoint samo upsert-uje (bez duplikata)', async () => {
    const { token } = await anon();
    const endpoint = 'https://push.example.com/dev-2';
    await post('/api/push/subscribe', token, sub(endpoint));
    await post('/api/push/subscribe', token, sub(endpoint));
    const rows = await env.DB.prepare('SELECT COUNT(*) AS n FROM push_subscriptions WHERE endpoint = ?')
      .bind(endpoint)
      .first<{ n: number }>();
    expect(rows?.n).toBe(1);
  });

  it('odbija ne-https endpoint (400) i traži auth (401)', async () => {
    const { token } = await anon();
    const bad = await post('/api/push/subscribe', token, {
      endpoint: 'ftp://x/y',
      keys: { p256dh: 'a', auth: 'b' },
    });
    expect(bad.status).toBe(400);

    const noAuth = await SELF.fetch(`${BASE}/api/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub('https://push.example.com/dev-3')),
    });
    expect(noAuth.status).toBe(401);
  });

  it('/api/push/vapid vraća javni ključ', async () => {
    const res = await SELF.fetch(`${BASE}/api/push/vapid`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { publicKey: string | null };
    expect(typeof body.publicKey).toBe('string');
    expect(body.publicKey).toContain('BGTd77');
  });
});
