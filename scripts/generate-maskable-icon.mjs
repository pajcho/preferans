// Maskable ikonu generišemo odvojeno od pwa-assets-generator-a: spade je već
// smanjen u safe-zone unutar public/maskable-icon.svg, pa samo rasterizujemo 512x512
// bez dodatnog padding-a (da Android adaptive maska ne iseca logo).
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'public', 'maskable-icon.svg'));

await sharp(svg, { density: 384 })
  .resize(512, 512)
  .png({ compressionLevel: 9, quality: 90 })
  .toFile(join(root, 'public', 'maskable-icon-512x512.png'));

console.log('public/maskable-icon-512x512.png ✓');
