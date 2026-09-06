// 建置前清掉上一版的 hash 檔名產物，避免 assets/ 無限累積舊 bundle。
import { readdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = new URL('../assets/', import.meta.url).pathname;
if (existsSync(dir)) {
  for (const f of readdirSync(dir)) {
    if (/^index-.*\.(js|css)$/.test(f) || /^favicon-.*\.svg$/.test(f)) {
      rmSync(join(dir, f));
      console.log('removed stale build asset:', f);
    }
  }
}
