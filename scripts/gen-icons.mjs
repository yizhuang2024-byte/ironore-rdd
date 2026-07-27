/**
 * 由 favicon.svg 產生 PWA 所需的 PNG 圖示。
 *
 * 用 Playwright 的 headless Chromium 而非 sharp/ImageMagick —— 專案已因 E2E
 * 測試而具備 Chromium，不需為了產圖再多裝一個原生相依套件。
 *
 * 用法：node scripts/gen-icons.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = resolve(root, 'apps/web/public');
const svg = readFileSync(resolve(publicDir, 'favicon.svg'), 'utf8');

const SIZES = [192, 512];

const browser = await chromium.launch({
  executablePath: process.env['PLAYWRIGHT_CHROMIUM'] ?? '/opt/pw-browsers/chromium',
});

for (const size of SIZES) {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  await page.setContent(
    `<!doctype html><html><body style="margin:0;width:${size}px;height:${size}px">${svg.replace(
      '<svg ',
      `<svg width="${size}" height="${size}" `,
    )}</body></html>`,
  );
  const buf = await page.screenshot({ omitBackground: true });
  writeFileSync(resolve(publicDir, `icon-${size}.png`), buf);
  await page.close();
  console.log(`✓ icon-${size}.png`);
}

await browser.close();
