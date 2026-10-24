// Generates the desktop app icon (build/icon.png, 512x512) from inline SVG.
// electron-builder converts it to .ico. Re-run only if the design changes.
// Mirrors RegisterMark in src/components/app-shell.tsx, in the default (dark) theme colors.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 28 28">
  <rect width="28" height="28" rx="6" fill="#e0e0e0"/>
  <path d="M5 9.5h18M5 14h18M5 18.5h18" stroke="#9c9c9c" stroke-width="1"/>
  <path d="M5 20.5h5v-6h5v3h4V7.5h4" fill="none" stroke="#444444" stroke-width="2" stroke-linejoin="round"/>
</svg>`;

const out = path.resolve(import.meta.dirname, "..", "build", "icon.png");
fs.mkdirSync(path.dirname(out), { recursive: true });
await sharp(Buffer.from(svg)).png().toFile(out);
console.log(`[generate-icon] wrote ${out}`);
