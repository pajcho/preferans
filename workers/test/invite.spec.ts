import { SELF } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import type { AuthResponse, CreateGameResponse } from '../../src/protocol/messages.ts';

const BASE = 'https://prefa.test';
const SEATS_2H = [{ type: 'human' }, { type: 'human' }, { type: 'bot', difficulty: 'easy' }];

async function anon(): Promise<AuthResponse> {
  const res = await SELF.fetch(`${BASE}/api/auth/anon`, { method: 'POST' });
  return res.json();
}

async function createLobby(displayName: string): Promise<string> {
  const { token } = await anon();
  const res = await SELF.fetch(`${BASE}/api/games`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ displayName, seats: SEATS_2H }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as CreateGameResponse).code;
}

describe('OG invite stranica /o/:code', () => {
  it('lobi partije daje OG naslov sa imenom pozivaoca + redirect na app', async () => {
    const code = await createLobby('Ana');
    const res = await SELF.fetch(`${BASE}/o/${code}`);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const html = await res.text();

    expect(html).toContain('property="og:title"');
    expect(html).toContain('property="og:image"');
    expect(html).toContain('summary_large_image');
    expect(html).toContain('Ana'); // ime pozivaoca u OG
    expect(html).toContain(`/o/${code}`); // redirect target (app)
    expect(html).toContain('og-image.png');
  });

  it('nepoznat kod → generički OG (200), i dalje vodi na app', async () => {
    const res = await SELF.fetch(`${BASE}/o/ZZZZZZ`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('Prefa');
    expect(html).toContain('/o/ZZZZZZ');
  });

  it('HTML-escape-uje ime pozivaoca (bez injekcije u OG)', async () => {
    const code = await createLobby('<b>x</b>');
    const html = await (await SELF.fetch(`${BASE}/o/${code}`)).text();
    expect(html).not.toContain('<b>x</b>'); // sirovo ime se ne ubacuje
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;'); // escaped
  });

  it('POST na /o/:code nije podržan (fall-through 404)', async () => {
    const res = await SELF.fetch(`${BASE}/o/ABCDEF`, { method: 'POST' });
    expect(res.status).toBe(404);
  });
});
