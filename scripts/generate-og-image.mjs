// Rasterizuje public/og-image.svg → public/og-image.png (1200×630) za link preview (OG/Twitter).
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'public', 'og-image.svg'));

await sharp(svg, { density: 144 })
  .resize(1200, 630)
  .png({ compressionLevel: 9, quality: 90 })
  .toFile(join(root, 'public', 'og-image.png'));

console.log('public/og-image.png ✓');
