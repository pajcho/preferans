// Rasterizuje OG slike (1200×630) za link preview (OG/Twitter):
//   public/og-image.svg  → og-image.png   (početna / deljenje sajta)
//   public/og-invite.svg → og-invite.png  (poziv na partiju — drugačiji CTA)
// Obe su STATIČKE (bez dinamičkog generisanja na serveru); dinamični su naslov/opis.
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

for (const name of ['og-image', 'og-invite']) {
  const svg = readFileSync(join(root, 'public', `${name}.svg`));
  await sharp(svg, { density: 144 })
    .resize(1200, 630)
    .png({ compressionLevel: 9, quality: 90 })
    .toFile(join(root, 'public', `${name}.png`));
  console.log(`public/${name}.png ✓`);
}
