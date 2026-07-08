import {
  combinePresetAndAppleSplashScreens,
  createAppleSplashScreens,
  defineConfig,
  minimal2023Preset,
} from '@vite-pwa/assets-generator/config';

// Brend zeleni (felt) — pozadina apple ikone i splash screen-ova.
const BRAND = '#0f5132';

// Regularne PWA ikone + apple-touch iz jednog izvora (public/pwa-icon.svg).
// Maskable se generiše ODVOJENO (scripts/generate-maskable-icon.mjs iz maskable-icon.svg)
// da bismo imali punu kontrolu nad safe-zone-om, pa je ovde isključen.
const preset = {
  ...minimal2023Preset,
  maskable: { sizes: [] as never[] },
  apple: {
    sizes: [180],
    padding: 0,
    resizeOptions: { background: BRAND, fit: 'contain' as const },
  },
};

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: combinePresetAndAppleSplashScreens(
    preset,
    createAppleSplashScreens(
      {
        padding: 0.3,
        resizeOptions: { background: BRAND, fit: 'contain' },
        darkResizeOptions: { background: BRAND, fit: 'contain' },
        linkMediaOptions: { log: true, addMediaScreen: true, basePath: '/', xhtml: false },
        png: { compressionLevel: 9, quality: 60 },
      },
      [
        'iPad Air 9.7"',
        'iPad Pro 11"',
        'iPad Pro 12.9"',
        'iPhone 15 Pro Max',
        'iPhone 15 Pro',
        'iPhone 15',
        'iPhone 14 Pro Max',
        'iPhone 14 Pro',
        'iPhone 13 Pro Max',
        'iPhone 13',
        'iPhone 13 mini',
        'iPhone 11 Pro Max',
        'iPhone 11',
        'iPhone XR',
        'iPhone SE',
        'iPhone 8',
      ],
    ),
  ),
  images: ['public/pwa-icon.svg'],
});
