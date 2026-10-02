#!/usr/bin/env node

import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICON = path.join(ROOT, 'clients/cloudcdn/v1/icons/512x512.png');
const OUTPUT = path.join(ROOT, 'cdn/shared/social');
const WIDTH = 1200;
const HEIGHT = 630;

function artwork() {
  return Buffer.from(`<svg width="${WIDTH}" height="${HEIGHT}"
  viewBox="0 0 ${WIDTH} ${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#08090d"/><stop offset="1" stop-color="#15172b"/>
    </linearGradient>
    <radialGradient id="glow">
      <stop stop-color="#6366f1" stop-opacity=".38"/>
      <stop offset="1" stop-color="#6366f1" stop-opacity="0"/>
    </radialGradient>
    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M48 0H0V48" fill="none" stroke="#818cf8" stroke-opacity=".09"/>
    </pattern>
  </defs>
  <rect width="1200" height="630" rx="36" fill="url(#bg)"/>
  <rect width="1200" height="630" rx="36" fill="url(#grid)"/>
  <circle cx="205" cy="315" r="270" fill="url(#glow)"/>
  <text x="370" y="245" fill="#f8fafc" font-family="Inter,Arial,sans-serif"
        font-size="92" font-weight="750">Cloud<tspan fill="#818cf8">CDN</tspan></text>
  <text x="374" y="315" fill="#cbd5e1" font-family="Inter,Arial,sans-serif"
        font-size="34" font-weight="600">Self-hosted edge delivery</text>
  <text x="374" y="368" fill="#94a3b8" font-family="Inter,Arial,sans-serif"
        font-size="25">Digital asset management · Image optimization</text>
  <text x="374" y="413" fill="#94a3b8" font-family="Inter,Arial,sans-serif"
        font-size="25">Cloudflare Workers · AI search · MCP</text>
  <rect x="374" y="463" width="310" height="54" rx="27" fill="#6366f1"/>
  <text x="529" y="498" fill="#fff" text-anchor="middle"
        font-family="Inter,Arial,sans-serif" font-size="22"
        font-weight="700">cloudcdn.pro</text>
</svg>`);
}

async function main() {
  await mkdir(OUTPUT, { recursive: true });
  const logo = await sharp(ICON).resize(210, 210).png().toBuffer();
  const png = await sharp(artwork())
    .composite([{ input: logo, left: 95, top: 210 }])
    .png({ compressionLevel: 9 })
    .toBuffer();
  await sharp(png).toFile(path.join(OUTPUT, 'cloudcdn-social-card.png'));
  await sharp(png).webp({ quality: 88 }).toFile(path.join(OUTPUT, 'cloudcdn-social-card.webp'));
  await sharp(png).avif({ quality: 72 }).toFile(path.join(OUTPUT, 'cloudcdn-social-card.avif'));
  console.log('Generated CloudCDN social card in PNG, WebP, and AVIF.');
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
