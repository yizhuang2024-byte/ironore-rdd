import { defineConfig, devices } from '@playwright/test';

/**
 * E2E 測試設定。
 *
 * 需要 API（:3000）與 Web（:5173）皆已啟動，且資料庫已 seed。
 * 執行前：./scripts/dev-db.sh start && pnpm db:seed -- --scale=small && pnpm dev
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env['CI'] ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL: process.env['E2E_BASE_URL'] ?? 'http://localhost:5173',
    locale: 'zh-TW',
    timezoneId: 'Asia/Taipei',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      // 容器環境有預裝 Chromium；CI 則由 playwright install 提供，
      // 此時設 PLAYWRIGHT_CHROMIUM='' 即交還給 Playwright 自行解析路徑
      ...(process.env['PLAYWRIGHT_CHROMIUM'] || !process.env['CI']
        ? {
            executablePath:
              process.env['PLAYWRIGHT_CHROMIUM'] || '/opt/pw-browsers/chromium',
          }
        : {}),
      // CI 與容器環境多以 root 執行，Chromium 的 sandbox 在此情況下無法啟動
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    },
  },

  projects: [
    // 登入一次並保存工作階段 —— 每個測試各自登入會撞上登入節流
    { name: 'setup', testMatch: /auth\.setup\.ts/ },

    {
      name: 'admin',
      dependencies: ['setup'],
      testMatch: /admin\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      dependencies: ['setup'],
      testMatch: /mobile\.spec\.ts/,
      use: {
        ...devices['iPhone 13'],
        // devices['iPhone 13'] 預設 defaultBrowserType 為 webkit，
        // 但本環境只有 Chromium（executablePath 指向它），必須明確覆寫，
        // 否則會以 webkit 的方式啟動 Chromium 執行檔而失敗
        browserName: 'chromium',
        storageState: 'e2e/.auth/attendant.json',
      },
    },
  ],
});
