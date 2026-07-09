// ─────────────────────────────────────────────────────────────
// E2E multiplayer: 3 odvojena browser konteksta = 3 anonimna identiteta.
// Ana kreira sto pa u lobiju podesi mesta (jedno prebaci na kompjuter),
// Boban ulazi kodom, Ceca stane u čekaonicu pa posle starta posmatra.
// Odigra se cela ruka (licitacija→talon→pratnja→kontra→igra→bodovanje),
// testira se reconnect (reload usred partije), „Moje partije" i backend
// (log poteza u GameRoom DO + redakcija za stranca).
// Drugi test: čekaonica — povezan čekač automatski seda kad kreator
// oslobodi mesto (Kompjuter → Igrač).
// Preduslov: ništa — Playwright sam podiže vite dev i wrangler dev.
// ─────────────────────────────────────────────────────────────
import { test, expect, type Page } from '@playwright/test';

const API = 'http://localhost:8787';
const CARD_NAME = /^(7|8|9|10|J|Q|K|A) (pik|karo|herc|tref)$/;

/** Kreiranje stola kroz unificirani tok: „＋ Nova partija" → „Drugari" (+ ime za anonimne) → „Napravi sto". */
async function createTable(p: Page, name?: string): Promise<void> {
  await p.getByRole('button', { name: /Nova partija/ }).click();
  await p.getByRole('radio', { name: 'Drugari' }).click();
  if (name) await p.getByPlaceholder('npr. Nikola').fill(name);
  await p.getByRole('button', { name: 'Napravi sto' }).click();
}

async function tryClick(p: Page, name: string | RegExp): Promise<boolean> {
  const btn = p.getByRole('button', { name }).first();
  const visible = await btn.isVisible().catch(() => false);
  if (!visible) return false;
  return btn
    .click({ timeout: 2000 })
    .then(() => true)
    .catch(() => false);
}

/**
 * Jedan korak "igranja": klikni šta god je trenutno moguće.
 * Strategija: u licitaciji uvek "Dalje" (bot na kraju dobija), talon se
 * potvrđuje, pratnja "Dođem" (da se ruka stvarno IGRA), bez kontri,
 * u igri klikni prvu legalnu kartu. Vraća true kad je ruka obodovana.
 */
async function step(p: Page): Promise<boolean> {
  if (
    await p
      .getByRole('button', { name: 'Sledeća ruka' })
      .isVisible()
      .catch(() => false)
  )
    return true;
  if (await tryClick(p, 'Dalje')) return false;
  if (await tryClick(p, 'OK')) return false;
  if (await tryClick(p, /^Dođem/)) return false;
  if (await tryClick(p, /^(Bez kontre|Dosta)$/)) return false;
  const myTurnToPlay = await p
    .getByText('Tvoj potez - odigraj kartu')
    .first()
    .isVisible()
    .catch(() => false);
  if (myTurnToPlay) {
    await p
      .getByRole('button', { name: CARD_NAME })
      .first()
      .click({ timeout: 2000 })
      .catch(() => {});
  }
  return false;
}

async function driveUntilHandScored(pages: Page[], code: string, deadlineMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < deadlineMs) {
    for (const p of pages) {
      if (await step(p)) {
        // „sve dalje" ruka (bot ne licitira svaku) nema nijedan PLAY u logu —
        // takvu preskoči na sledeće deljenje i teraj dok se ruka STVARNO ne odigra
        const debug = (await fetch(`${API}/api/games/${code}/debug`).then((r) => r.json())) as DebugInfo;
        if (debug.actions.some((a) => a.action.type === 'PLAY')) return;
        await tryClick(p, 'Sledeća ruka');
      }
    }
    await pages[0].waitForTimeout(400);
  }
  throw new Error('ruka nije obodovana u roku');
}

interface DebugInfo {
  meta: { status: string; phase: string | null; handNo: number; version: number };
  actions: { seq: number; handNo: number; seat: number | null; action: { type: string } }[];
}

test('online multiplayer: kreiranje, join, cela ruka, reconnect, posmatrač, backend', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const ctxC = await browser.newContext();
  const ana = await ctxA.newPage();
  const boban = await ctxB.newPage();
  const ceca = await ctxC.newPage();

  // ── Ana kreira sto (samo ime) → lobi sa kodom i podešavanjem mesta ──
  await ana.goto('/');
  await createTable(ana, 'Ana');
  await ana.waitForURL(/\/o\/[A-Z0-9]+$/, { timeout: 15_000 });
  const code = ana.url().split('/o/')[1];
  expect(code).toMatch(/^[A-Z0-9]{6}$/);
  await expect(ana.getByText(`Sto ${code} — priprema`)).toBeVisible();

  // default: 2 slobodna mesta — jedno prebaci na kompjuter (srednje po defaultu)
  await ana.getByRole('button', { name: 'Kompjuter', pressed: false }).first().click();
  await expect(ana.getByText('kompjuter (srednje)')).toBeVisible();

  // ── Ana podesi pravila: bule 40 → 30 ──
  const buleInput = ana.getByLabel('Bule');
  await buleInput.fill('30');
  await buleInput.press('Enter');

  // ── Boban ulazi preko share linka i seda na slobodno mesto ──
  await boban.goto(`/o/${code}`);
  await boban.getByPlaceholder('npr. Žika').fill('Boban');
  await boban.getByRole('button', { name: 'Sedi za sto' }).click();
  await expect(boban.getByText('Sediš za stolom — čeka se da kreator počne partiju.')).toBeVisible();

  // ── Ceca otvara isti link — sto je pun → čekaonica ──
  await ceca.goto(`/o/${code}`);
  await ceca.getByPlaceholder('npr. Žika').fill('Ceca');
  await ceca.getByRole('button', { name: 'Stani u red za mesto' }).click();
  await expect(ceca.getByText(/Čekaš mesto \(#1 u redu\)/)).toBeVisible();
  // i Ana u lobiju vidi čekaonicu
  await expect(ana.getByText(/1\. Ceca/)).toBeVisible();

  // ── Ana startuje partiju ──
  await ana.getByRole('button', { name: 'Počni partiju ▶' }).click();
  await expect(ana.getByRole('button', { name: '← Izađi' })).toBeVisible({ timeout: 20_000 });
  await expect(boban.getByRole('button', { name: '← Izađi' })).toBeVisible({ timeout: 20_000 });

  // svako vidi SVOJIH 10 karata (licem) — redakcija: protivnici su poleđine
  // (karta je <button> samo kad si na potezu, pa proveravamo slike po alt tekstu)
  await expect(ana.getByRole('img', { name: CARD_NAME })).toHaveCount(10, { timeout: 15_000 });
  await expect(ana.getByAltText('poleđina karte')).toHaveCount(20);

  // ── Ceca iz čekaonice postaje posmatrač (partija je počela bez nje) ──
  await expect(ceca.getByText('Posmatraš partiju')).toBeVisible({ timeout: 20_000 });
  // posmatrač ne vidi NIJEDNU kartu licem (sve tri ruke su poleđine)
  await expect(ceca.getByRole('img', { name: CARD_NAME })).toHaveCount(0);

  // ── odigraj celu ruku ──
  await driveUntilHandScored([ana, boban], code, 240_000);

  // ── reconnect: Boban reload-uje usred partije i vraća se na sto ──
  await boban.reload();
  await expect(boban.getByRole('button', { name: '← Izađi' })).toBeVisible({ timeout: 20_000 });
  await expect(boban.getByRole('button', { name: 'Sledeća ruka' })).toBeVisible({ timeout: 15_000 });

  // nastavak na sledeću ruku
  await boban.getByRole('button', { name: 'Sledeća ruka' }).click();
  await expect
    .poll(
      async () => {
        for (const p of [ana, boban]) {
          if (
            await p
              .getByText('Tvoj potez - licitiraj')
              .first()
              .isVisible()
              .catch(() => false)
          )
            return true;
        }
        return false;
      },
      { timeout: 30_000, message: 'nova ruka nije počela' },
    )
    .toBe(true);

  // ── backend provere: log poteza u GameRoom DO (debug endpoint, samo lokalno) ──
  const debug = (await fetch(`${API}/api/games/${code}/debug`).then((r) => r.json())) as DebugInfo;
  expect(debug.meta.status).toBe('active');
  expect(debug.meta.handNo).toBeGreaterThanOrEqual(2);

  // svaki potez je u logu: INIT je prvi, seq-ovi neprekinuti, poslednji == verzija stanja
  const actions = debug.actions;
  expect(actions.length).toBeGreaterThanOrEqual(15);
  expect(actions[0].action.type).toBe('INIT');
  expect(actions.map((a) => a.seq)).toEqual(actions.map((_, i) => i + 1));
  expect(actions[actions.length - 1].seq).toBe(debug.meta.version);
  // u logu postoji bar jedan PLAY (ruka se stvarno igrala) i bar jedan NEXT_HAND
  // (pre odigrane ruke moguće su i „sve dalje" ruke, svaka sa svojim NEXT_HAND)
  expect(actions.some((a) => a.action.type === 'PLAY')).toBeTruthy();
  expect(actions.filter((a) => a.action.type === 'NEXT_HAND').length).toBeGreaterThanOrEqual(1);

  // ── redakcija: nasumični anonimni korisnik kroz view NE vidi nijednu kartu ni seed ──
  const stranger = (await fetch(`${API}/api/auth/anon`, { method: 'POST' }).then((r) => r.json())) as {
    token: string;
  };
  const strangerView = (await fetch(`${API}/api/games/${code}/view`, {
    headers: { Authorization: `Bearer ${stranger.token}` },
  }).then((r) => r.json())) as {
    role: string;
    state: { seed: number; hands: { suit: string; rank: string }[][] };
  };
  expect(strangerView.role).toBe('spectator');
  expect(strangerView.state.seed).toBe(0);
  const isFiller = (c: { suit: string; rank: string }) => c.suit === 'pik' && c.rank === '7';
  expect(strangerView.state.hands.flat().every(isFiller)).toBeTruthy();

  // ── „Moje partije": Ana sa početne ulazi nazad u partiju ──
  await ana.goto('/');
  const myGameBtn = ana.getByRole('button', { name: new RegExp(code) });
  await expect(myGameBtn).toBeVisible({ timeout: 15_000 });
  await myGameBtn.click();
  await ana.waitForURL(new RegExp(`/o/${code}$`));
  await expect(ana.getByRole('button', { name: '← Izađi' })).toBeVisible({ timeout: 20_000 });

  await ctxA.close();
  await ctxB.close();
  await ctxC.close();
});

test('čekaonica: povezan čekač automatski seda kad kreator oslobodi mesto', async ({ browser }) => {
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const ctxC = await browser.newContext();
  const ana = await ctxA.newPage();
  const boban = await ctxB.newPage();
  const ceca = await ctxC.newPage();

  // ── Ana kreira sto i OBA slobodna mesta prebaci na kompjuter → sto „pun" ──
  await ana.goto('/');
  await createTable(ana, 'Ana');
  await ana.waitForURL(/\/o\/[A-Z0-9]+$/, { timeout: 15_000 });
  const code = ana.url().split('/o/')[1];

  await ana.getByRole('button', { name: 'Kompjuter', pressed: false }).first().click();
  await expect(ana.getByRole('button', { name: 'Kompjuter', pressed: true })).toHaveCount(1);
  await ana.getByRole('button', { name: 'Kompjuter', pressed: false }).first().click();
  await expect(ana.getByRole('button', { name: 'Kompjuter', pressed: true })).toHaveCount(2);

  // ── Boban i Ceca ulaze kodom → nema mesta → čekaonica #1 i #2 ──
  await boban.goto(`/o/${code}`);
  await boban.getByPlaceholder('npr. Žika').fill('Boban');
  await boban.getByRole('button', { name: 'Stani u red za mesto' }).click();
  await expect(boban.getByText(/Čekaš mesto \(#1 u redu\)/)).toBeVisible();

  await ceca.goto(`/o/${code}`);
  await ceca.getByPlaceholder('npr. Žika').fill('Ceca');
  await ceca.getByRole('button', { name: 'Stani u red za mesto' }).click();
  await expect(ceca.getByText(/Čekaš mesto \(#2 u redu\)/)).toBeVisible();

  // ── Ceca se predomisli: izađe iz reda, pa se vrati (na kraj reda — opet #2) ──
  await ceca.getByRole('button', { name: 'Izađi iz reda' }).click();
  await expect(ceca.getByRole('button', { name: 'Stani u red za mesto' })).toBeVisible();
  await expect(ana.getByText(/2\. Ceca/)).toHaveCount(0); // i Ana vidi da je red kraći
  await ceca.getByPlaceholder('npr. Žika').fill('Ceca');
  await ceca.getByRole('button', { name: 'Stani u red za mesto' }).click();
  await expect(ceca.getByText(/Čekaš mesto \(#2 u redu\)/)).toBeVisible();

  // ── Ana oslobodi JEDNO mesto (Kompjuter → Igrač) → Boban (prvi povezan) seda ──
  await ana.getByRole('button', { name: 'Igrač', pressed: false }).first().click();
  await expect(boban.getByText('Sediš za stolom — čeka se da kreator počne partiju.')).toBeVisible({
    timeout: 15_000,
  });
  // Ceca se pomera na #1, i dalje čeka
  await expect(ceca.getByText(/Čekaš mesto \(#1 u redu\)/)).toBeVisible({ timeout: 15_000 });
  // Ana vidi Bobana za stolom; njegovo mesto više nema toggle (zauzeto)
  await expect(ana.getByText('Boban')).toBeVisible();

  // ── Ana oslobodi i drugo mesto → seda i Ceca → 3 igrača, start ──
  await ana.getByRole('button', { name: 'Igrač', pressed: false }).first().click();
  await expect(ceca.getByText('Sediš za stolom — čeka se da kreator počne partiju.')).toBeVisible({
    timeout: 15_000,
  });

  await ana.getByRole('button', { name: 'Počni partiju ▶' }).click();
  for (const p of [ana, boban, ceca]) {
    await expect(p.getByRole('button', { name: '← Izađi' })).toBeVisible({ timeout: 20_000 });
  }

  await ctxA.close();
  await ctxB.close();
  await ctxC.close();
});
