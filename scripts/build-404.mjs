// Gradi dist/404.html iz dist/index.html sa OG-om za POZIV (druga slika + generički tekst).
// GitHub Pages servira 404.html za sve putanje bez fajla (SPA fallback) — pa /o/KOD dobija
// preview poziva, a / (index.html) ostaje početni preview. Bez servera, radi za crawler-e.
//
// Napomena: GH Pages vraća HTTP 404 status za te putanje; blaži scraper-i (Telegram/Slack/
// iMessage/Viber…) i dalje pokažu preview, ali Facebook/Messenger ga mogu preskočiti. Za
// 100% pouzdan (i pun dinamički) preview postoji Worker ruta /o/KOD — vidi workers/src/invite.ts.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

const INVITE_TITLE = 'Poziv na partiju prefe';
const INVITE_DESC = 'Neko te zove za sto — preferans u troje. Klikni da se prikljucis partiji.';

// Menjamo SAMO OG/Twitter vrednosti koje su jedinstvene u dokumentu (bezbedno za line-wrap).
const swaps = [
  ['Prefa - preferans online u troje', INVITE_TITLE], // og:title + twitter:title
  [
    'Mobile-first preferans za tri igraca: srpska pravila, brz sto protiv kompjutera i online partije sa drustvom.',
    INVITE_DESC,
  ], // og:description
  ['Igraj preferans u troje na telefonu ili desktopu — protiv kompjutera ili online sa drustvom.', INVITE_DESC], // twitter:description
  ['og-image.png', 'og-invite.png'], // og:image + twitter:image
];

let html = readFileSync(join(dist, 'index.html'), 'utf8');
for (const [from, to] of swaps) {
  if (!html.includes(from)) {
    throw new Error(`build-404: nije nađen tekst za zamenu (promenjen index.html?): "${from}"`);
  }
  html = html.replaceAll(from, to);
}
writeFileSync(join(dist, '404.html'), html);
console.log('dist/404.html (OG poziva) ✓');
