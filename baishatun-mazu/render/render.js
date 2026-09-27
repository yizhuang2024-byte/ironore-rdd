// Frame renderer: drives index.html in headless Chromium, one fully painted frame at a time.
// usage: node render.js frames <out_dir> <f1,f2,...>      -> PNG stills
//        node render.js video <out.mp4> <from> <to>        -> encoded segment [from, to)
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const FF = process.env.FFMPEG;

async function open() {
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--disable-gpu', '--font-render-hinting=none'] });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(__dirname, 'index.html'));
  await page.evaluate(() => ready());
  return { browser, page };
}
async function shot(page, f) {
  // render, then wait two animation frames so layout + paint are complete before capture
  await page.evaluate(async fr => { render(fr); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); }, f);
  return page.screenshot({ type: 'png', animations: 'disabled', caret: 'initial' });
}
(async () => {
  const [mode, out, a, b] = process.argv.slice(2);
  const { browser, page } = await open();
  if (mode === 'frames') {
    fs.mkdirSync(out, { recursive: true });
    for (const f of a.split(',').map(Number)) fs.writeFileSync(path.join(out, `f${String(f).padStart(5, '0')}.png`), await shot(page, f));
  } else {
    const from = +a, to = +b;
    const ff = spawn(FF, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'png', '-i', '-',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', '30', out], { stdio: ['pipe', 'inherit', 'inherit'] });
    const t0 = Date.now();
    for (let f = from; f < to; f++) {
      const buf = await shot(page, f);
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if ((f - from) % 150 === 0) console.log(`[${path.basename(out)}] ${f - from}/${to - from} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    ff.stdin.end();
    await new Promise(r => ff.on('close', r));
  }
  await browser.close();
})();
