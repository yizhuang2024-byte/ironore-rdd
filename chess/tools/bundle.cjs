/*
 * bundle.cjs — 把整個網站打包成單一 HTML 檔
 *
 *   node chess/tools/bundle.cjs            → 產生 chess/standalone.html（完整網頁）
 *   node chess/tools/bundle.cjs --body     → 只輸出 <body> 內容到 stdout
 *
 * 產物不依賴任何外部檔案，可以直接用瀏覽器開啟、用 email 寄送，
 * 或貼到任何只吃單一檔案的托管服務。
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let html = read('index.html');

// 內嵌樣式表
html = html.replace(
  /<link rel="stylesheet" href="([^"]+)">/,
  (_, href) => '<style>\n' + read(href) + '</style>'
);

// 內嵌腳本（依原本的順序）
html = html.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
  // 腳本內容裡若出現 </script 會提早結束標籤，先做逃脫
  const code = read(src).replace(/<\/script/gi, '<\\/script');
  return '<script>\n' + code + '</script>';
});

if (html.includes('<link rel="stylesheet"') || /<script src=/.test(html)) {
  console.error('仍有未內嵌的外部資源');
  process.exit(1);
}

if (process.argv.includes('--body')) {
  // 取出 <body> 內容，並保留 <title> 與 <style>
  const title = /<title>([^<]*)<\/title>/.exec(html)[1];
  const style = /<style>[\s\S]*?<\/style>/.exec(html)[0];
  const body = /<body>([\s\S]*)<\/body>/.exec(html)[1];
  process.stdout.write(`<title>${title}</title>\n${style}\n${body.trim()}\n`);
} else {
  const out = path.join(ROOT, 'standalone.html');
  fs.writeFileSync(out, html);
  const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
  console.log(`已產生 ${path.relative(process.cwd(), out)}（${kb} KB，單一檔案、無外部相依）`);
}
