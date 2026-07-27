import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: { NODE_ENV: 'test' },
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // 整合測試共用一個資料庫，平行執行會互相污染
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
