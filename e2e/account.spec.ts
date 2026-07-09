// ─────────────────────────────────────────────────────────────
// E2E nalozi: anonimni igrač napravi sto, pa se registruje — partija
// automatski ostaje u „Moje partije". Odjava vraća na anonimno (bez
// partija). „Drugi uređaj" (nov browser kontekst) se prijavi istim
// nalogom i vidi istu istoriju + promeni ime za stolom.
// Preduslov: ništa — Playwright sam podiže vite dev i wrangler dev.
// ─────────────────────────────────────────────────────────────
import { test, expect, type Page } from '@playwright/test';

test('nalog: registracija čuva partije, odjava, prijava na drugom uređaju', async ({ browser }) => {
  const email = `e2e-${Date.now()}@prefa.test`;
  const password = 'tajna-lozinka-1';

  const ctxA = await browser.newContext();
  const ana = await ctxA.newPage();

  // ── anonimno napravi sto (lobi je dovoljan za „Moje partije") ──
  await ana.goto('/');
  await ana.getByRole('button', { name: /Nova partija/ }).click();
  await ana.getByRole('radio', { name: 'Drugari' }).click();
  await ana.getByPlaceholder('npr. Nikola').fill('Ana');
  await ana.getByRole('button', { name: 'Napravi sto' }).click();
  await ana.waitForURL(/\/o\/[A-Z0-9]{6}$/, { timeout: 15_000 });
  const code = ana.url().split('/o/')[1];

  // ── registracija kroz /profil ──
  await ana.goto('/');
  await ana.getByRole('link', { name: 'Prijava' }).click();
  await ana.waitForURL(/\/profil$/);
  const reg = ana.locator('section', { hasText: 'Napravi nalog' });
  await expect(reg.getByPlaceholder('npr. Nikola')).toHaveValue('Ana'); // prefill sa imena za stolom
  await reg.getByPlaceholder('ti@primer.com').fill(email);
  await reg.locator('input[type=password]').fill(password);
  await reg.getByRole('button', { name: 'Registruj se' }).click();
  // „Odjavi se" postoji samo u podešavanjima profila — pouzdan znak da je nalog aktivan
  await expect(ana.getByRole('button', { name: 'Odjavi se' })).toBeVisible();
  await expect(ana.getByText(email)).toBeVisible();

  // ── partija od PRE registracije je u „Moje partije"; header pokazuje nalog ──
  await ana.goto('/');
  await expect(ana.getByRole('button', { name: 'Ana', exact: true })).toBeVisible();
  await expectMyGame(ana, code);

  // ── odjava (kroz dropdown meni): header nudi prijavu, anonimna sesija nema partije ──
  await ana.getByRole('button', { name: 'Ana', exact: true }).click();
  await ana.getByRole('menuitem', { name: 'Odjava' }).click();
  await expect(ana.getByRole('link', { name: 'Prijava' })).toBeVisible();
  await ana.reload();
  await expect(ana.getByText('Nemaš započetih online partija.')).toBeVisible();

  // ── „drugi uređaj": nov kontekst, prijava → ista istorija ──
  const ctxB = await browser.newContext();
  const bob = await ctxB.newPage();
  await bob.goto('/profil');
  const login = bob.locator('section', { hasText: 'Već imaš nalog' });
  await login.getByPlaceholder('ti@primer.com').fill(email);
  await login.locator('input[type=password]').fill(password);
  await login.getByRole('button', { name: 'Prijavi se' }).click();
  await expect(bob.getByRole('button', { name: 'Odjavi se' })).toBeVisible();

  // promena imena za stolom (podešavanje profila)
  const nameSection = bob.locator('section', { hasText: 'Ime za stolom' });
  await nameSection.locator('input').fill('Ana Nova');
  await nameSection.getByRole('button', { name: 'Sačuvaj ime' }).click();
  await expect(nameSection.getByText('Sačuvano ✓')).toBeVisible();

  await bob.goto('/');
  await expect(bob.getByRole('button', { name: 'Ana Nova' })).toBeVisible();
  await expectMyGame(bob, code);

  // kreiranje stola bez polja za ime: registrovan igrač igra pod imenom naloga
  await bob.getByRole('button', { name: /Nova partija/ }).click();
  await bob.getByRole('radio', { name: 'Drugari' }).click();
  await expect(bob.getByPlaceholder('npr. Nikola')).toHaveCount(0);
  await bob.getByRole('button', { name: 'Napravi sto' }).click();
  await bob.waitForURL(/\/o\/[A-Z0-9]{6}$/, { timeout: 15_000 });
  await expect(bob.getByText('Ana Nova').first()).toBeVisible();

  await ctxA.close();
  await ctxB.close();
});

/** „Moje partije" se pune iz D1 (asinhroni sync) — reload dok se partija ne pojavi. */
async function expectMyGame(page: Page, code: string): Promise<void> {
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole('button', { name: new RegExp(code) })).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15_000 });
}
