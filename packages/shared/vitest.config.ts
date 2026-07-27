import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // v8 reporter 預設會隱藏 100% 覆蓋的檔案，導致報表看起來像漏測。
      // 明確關閉，讓每個受門檻管制的檔案都出現在表格中。
      skipFull: false,
      include: ['src/scheduling/**', 'src/payment/**', 'src/domain/**'],
      thresholds: {
        // 衝突檢核引擎是系統心臟 — 覆蓋率門檻由 CI 強制
        'src/scheduling/**': { lines: 90, functions: 90, statements: 90 },
        'src/payment/**': { lines: 90, functions: 90, statements: 90 },
      },
    },
  },
});
