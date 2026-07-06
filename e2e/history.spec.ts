// ─────────────────────────────────────────────────────────────
// E2E regresija: zapis istorije snimljen PRE nego što je `initialHands`
// dodat u šemu (PR #6, bez bump-a verzije) ne sme da sruši prikaz
// detalja partije (nekad: crn ekran + TypeError u InitialHandsPanel).
// ─────────────────────────────────────────────────────────────
import { test, expect } from '@playwright/test'

// minimalan zapis stare šeme — ruka NEMA initialHands
const OLD_RECORD = {
  schemaVersion: 1,
  id: 'old-1',
  mode: 'vs-cpu',
  seed: 42,
  difficulty: 'medium',
  humanSeat: 0,
  playerNames: ['Ja', 'Boki', 'Ceca'],
  startedAt: 1720000000000,
  completedAt: 1720000600000,
  durationMs: 600000,
  startingBule: 40,
  handCount: 1,
  finalLedger: { bule: [36, 40, 40], supe: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], refe: [0, 0, 0] },
  scoreHistory: [[], [], []],
  finalScores: [-8, 4, 4],
  standings: [
    { seat: 0, name: 'Ja', score: -8, rank: 1 },
    { seat: 1, name: 'Boki', score: 4, rank: 2 },
    { seat: 2, name: 'Ceca', score: 4, rank: 2 },
  ],
  hands: [
    {
      handNo: 1,
      dealer: 0,
      declarer: 0,
      contract: { kind: 'suit', trump: 'pik', asGame: false },
      kontra: 0,
      kontraBy: null,
      inviteCaller: null,
      following: [false, true, true],
      refeApplied: false,
      tricksWon: [6, 2, 2],
      passed: true,
      buleDelta: [-4, 0, 0],
      supeDelta: [[0, 0, 0], [0, 0, 0], [0, 0, 0]],
      bidLog: [],
      tricksLog: [],
      talon: [],
      discard: [],
    },
  ],
}

// pun zapis (karte + štihovi) za proveru mobilnog prikaza
const SUITS = ['pik', 'karo', 'herc', 'tref']
const RANKS = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A']
const DECK = SUITS.flatMap((suit) => RANKS.map((rank) => ({ suit, rank })))
const RICH_RECORD = {
  ...OLD_RECORD,
  id: 'rich-1',
  hands: [
    {
      ...OLD_RECORD.hands[0],
      declarer: 1,
      contract: { kind: 'sans', asGame: true },
      kontra: 1,
      kontraBy: 0,
      initialHands: [DECK.slice(0, 10), DECK.slice(10, 20), DECK.slice(20, 30)],
      talon: DECK.slice(30, 32),
      discard: DECK.slice(30, 32),
      bidLog: [
        { seat: 0, kind: 'bid', level: 2 },
        { seat: 1, kind: 'igra', level: 7 },
        { seat: 0, kind: 'pass' },
      ],
      tricksLog: Array.from({ length: 10 }, (_, t) => ({
        winner: t % 3,
        cards: [0, 1, 2].map((seat) => ({ seat, card: DECK[(t * 3 + seat) % 32] })),
      })),
    },
  ],
}

test('istorija: stari zapis bez initialHands se otvara bez greške', async ({ browser }) => {
  const ctx = await browser.newContext()
  const page = await ctx.newPage()
  await page.addInitScript((record) => {
    localStorage.setItem('prefa-game-history-v1', JSON.stringify([record]))
  }, OLD_RECORD)

  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/')
  await page.getByRole('button', { name: 'Istorija partija (1)' }).click()
  await page.waitForURL(/\/history/)

  // detalj partije se prikazuje: rezultat + ruka #1, karte prazne („-"), bez crash-a
  await expect(page.getByText('Konačan rezultat')).toBeVisible()
  await expect(page.getByText('#1')).toBeVisible()
  expect(errors).toEqual([])

  await ctx.close()
})

test('istorija: mobilni prikaz bez horizontalnog overflow-a stranice', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 392, height: 800 } })
  const page = await ctx.newPage()
  await page.addInitScript((record) => {
    localStorage.setItem('prefa-game-history-v1', JSON.stringify([record]))
  }, RICH_RECORD)

  await page.goto('/history')
  await expect(page.getByText('Konačan rezultat')).toBeVisible()
  await page.locator('details').first().click()
  await expect(page.getByText('Odigrani štihovi')).toBeVisible()

  // stranica ne sme da se skroluje horizontalno — štihovi/tabela skroluju u SVOJIM kutijama
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }))
  expect(widths.scroll).toBe(widths.client)

  await ctx.close()
})
