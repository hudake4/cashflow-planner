// Generates the simple desktop app icon (build/icon.png, 512x512) from inline SVG.
// electron-builder converts it to .ico. Re-run only if the design changes.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect x="16" y="16" width="480" height="480" rx="96" fill="#0f766e"/>
  <polyline points="96,352 192,256 272,304 416,160" fill="none" stroke="#ffffff"
            stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/>
  <polyline points="336,160 416,160 416,240" fill="none" stroke="#ffffff"
            stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const out = path.resolve(import.meta.dirname, "..", "build", "icon.png");
fs.mkdirSync(path.dirname(out), { recursive: true });
await sharp(Buffer.from(svg)).png().toFile(out);
console.log(`[generate-icon] wrote ${out}`);
