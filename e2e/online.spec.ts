// ─────────────────────────────────────────────────────────────
// E2E multiplayer: 3 odvojena browser konteksta = 3 anonimna identiteta.
// Ana kreira sto (2 čoveka + bot), Boban ulazi kodom, Ceca posmatra.
// Odigra se cela ruka (licitacija→talon→pratnja→kontra→igra→bodovanje),
// testira se reconnect (reload usred partije) i proverava upis u bazu.
// Preduslov: lokalni Supabase (pnpm sb:start) + supabase functions serve.
// ─────────────────────────────────────────────────────────────
import { execSync } from 'node:child_process'
import { test, expect, type Page } from '@playwright/test'

// Ključevi lokalnog Supabase stack-a se čitaju iz `supabase status`
// (ne hardkodujemo ih — GitHub push protection ih inače blokira).
const statusEnv = execSync('supabase status -o env', { encoding: 'utf8' })
const statusVar = (name: string): string => {
  const value = statusEnv.match(new RegExp(`^${name}="?([^"\\n]+)"?$`, 'm'))?.[1]
  if (!value) throw new Error(`supabase status ne vraća ${name} — da li je lokalni stack pokrenut?`)
  return value
}
const SB = statusVar('API_URL')
const ANON_KEY = statusVar('PUBLISHABLE_KEY')
const SERVICE_KEY = statusVar('SECRET_KEY')

const CARD_NAME = /^(7|8|9|10|J|Q|K|A) (pik|karo|herc|tref)$/

async function tryClick(p: Page, name: string | RegExp): Promise<boolean> {
  const btn = p.getByRole('button', { name }).first()
  const visible = await btn.isVisible().catch(() => false)
  if (!visible) return false
  return btn
    .click({ timeout: 2000 })
    .then(() => true)
    .catch(() => false)
}

/**
 * Jedan korak "igranja": klikni šta god je trenutno moguće.
 * Strategija: u licitaciji uvek "Dalje" (bot na kraju dobija), talon se
 * potvrđuje, pratnja "Dođem" (da se ruka stvarno IGRA), bez kontri,
 * u igri klikni prvu legalnu kartu. Vraća true kad je ruka obodovana.
 */
async function step(p: Page): Promise<boolean> {
  if (await p.getByRole('button', { name: 'Sledeća ruka' }).isVisible().catch(() => false)) return true
  if (await tryClick(p, 'Dalje')) return false
  if (await tryClick(p, 'OK')) return false
  if (await tryClick(p, /^Dođem/)) return false
  if (await tryClick(p, /^(Bez kontre|Dosta)$/)) return false
  const myTurnToPlay = await p
    .getByText('Tvoj potez - odigraj kartu')
    .first()
    .isVisible()
    .catch(() => false)
  if (myTurnToPlay) {
    await p.getByRole('button', { name: CARD_NAME }).first().click({ timeout: 2000 }).catch(() => {})
  }
  return false
}

async function driveUntilHandScored(pages: Page[], deadlineMs: number): Promise<void> {
  const start = Date.now()
  while (Date.now() - start < deadlineMs) {
    for (const p of pages) {
      if (await step(p)) return
    }
    await pages[0].waitForTimeout(400)
  }
  throw new Error('ruka nije obodovana u roku')
}

async function sbGet(path: string, token = SERVICE_KEY): Promise<unknown> {
  const res = await fetch(`${SB}/rest/v1/${path}`, {
    headers: { apikey: token, Authorization: `Bearer ${token}` },
  })
  expect(res.ok, `REST ${path} → ${res.status}`).toBeTruthy()
  return res.json()
}

test('online multiplayer: kreiranje, join, cela ruka, reconnect, posmatrač, baza', async ({ browser }) => {
  const ctxA = await browser.newContext()
  const ctxB = await browser.newContext()
  const ctxC = await browser.newContext()
  const ana = await ctxA.newPage()
  const boban = await ctxB.newPage()
  const ceca = await ctxC.newPage()

  // ── Ana kreira sto: [ona, igrač, bot-srednje (default)] ──
  await ana.goto('/')
  await ana.getByPlaceholder('npr. Nikola').fill('Ana')
  await ana.getByRole('button', { name: 'Napravi sto' }).click()
  await ana.waitForURL(/\/o\/[A-Z0-9]+$/, { timeout: 15_000 })
  const code = ana.url().split('/o/')[1]
  expect(code).toMatch(/^[A-Z0-9]{6}$/)
  await expect(ana.getByText(`Sto ${code} — čekanje igrača`)).toBeVisible()

  // ── Boban ulazi preko share linka ──
  await boban.goto(`/o/${code}`)
  await boban.getByPlaceholder('npr. Žika').fill('Boban')
  await boban.getByRole('button', { name: 'Sedi za sto' }).click()

  // partija automatski počinje (sva mesta popunjena) — oba igrača na stolu
  await expect(ana.getByRole('button', { name: `KOD ${code} ⧉` })).toBeVisible({ timeout: 20_000 })
  await expect(boban.getByRole('button', { name: `KOD ${code} ⧉` })).toBeVisible({ timeout: 20_000 })

  // svako vidi SVOJIH 10 karata (licem) — redakcija: protivnici su poleđine
  // (karta je <button> samo kad si na potezu, pa proveravamo slike po alt tekstu)
  await expect(ana.getByRole('img', { name: CARD_NAME })).toHaveCount(10, { timeout: 15_000 })
  await expect(ana.getByAltText('poleđina karte')).toHaveCount(20)

  // ── Ceca otvara isti link — sto je pun → posmatrač ──
  await ceca.goto(`/o/${code}`)
  await expect(ceca.getByText('Posmatraš partiju')).toBeVisible({ timeout: 20_000 })
  // posmatrač ne vidi NIJEDNU kartu licem (sve tri ruke su poleđine)
  await expect(ceca.getByRole('img', { name: CARD_NAME })).toHaveCount(0)

  // ── odigraj celu ruku ──
  await driveUntilHandScored([ana, boban], 240_000)

  // ── reconnect: Boban reload-uje usred partije i vraća se na sto ──
  await boban.reload()
  await expect(boban.getByRole('button', { name: `KOD ${code} ⧉` })).toBeVisible({ timeout: 20_000 })
  await expect(boban.getByRole('button', { name: 'Sledeća ruka' })).toBeVisible({ timeout: 15_000 })

  // nastavak na sledeću ruku
  await boban.getByRole('button', { name: 'Sledeća ruka' }).click()
  await expect
    .poll(
      async () => {
        for (const p of [ana, boban]) {
          if (await p.getByText('Tvoj potez - licitiraj').first().isVisible().catch(() => false)) return true
        }
        return false
      },
      { timeout: 30_000, message: 'nova ruka nije počela' },
    )
    .toBe(true)

  // ── provere u bazi (service role) ──
  const games = (await sbGet(`games?code=eq.${code}&select=id,status,version,hand_no`)) as Array<{
    id: string
    status: string
    version: number
    hand_no: number
  }>
  expect(games).toHaveLength(1)
  const game = games[0]
  expect(game.status).toBe('active')
  expect(game.hand_no).toBeGreaterThanOrEqual(2)

  // svaki potez je u logu: poslednji seq == verzija stanja
  const actions = (await sbGet(
    `game_actions?game_id=eq.${game.id}&select=seq,action&order=seq.asc`,
  )) as Array<{ seq: number; action: { type: string } }>
  expect(actions.length).toBeGreaterThanOrEqual(15)
  expect(actions[0].action.type).toBe('INIT')
  const states = (await sbGet(`game_states?game_id=eq.${game.id}&select=version`)) as Array<{ version: number }>
  expect(states[0].version).toBe(actions[actions.length - 1].seq)
  // u logu postoji bar jedan PLAY (ruka se stvarno igrala) i tačno jedan NEXT_HAND
  expect(actions.some((a) => a.action.type === 'PLAY')).toBeTruthy()
  expect(actions.filter((a) => a.action.type === 'NEXT_HAND')).toHaveLength(1)

  // ── RLS: nasumični anonimni korisnik NE vidi partiju kroz REST ──
  const strangerRes = await fetch(`${SB}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: '{}',
  })
  const stranger = (await strangerRes.json()) as { access_token: string }
  const visible = await fetch(`${SB}/rest/v1/games?code=eq.${code}&select=id`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${stranger.access_token}` },
  }).then((r) => r.json())
  expect(visible).toEqual([])

  await ctxA.close()
  await ctxB.close()
  await ctxC.close()
})
