import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: '長照居家服務排班系統',
        short_name: '長照排班',
        description: '居家服務照服員班表查詢與請假申請',
        theme_color: '#0f766e',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/m',
        scope: '/',
        lang: 'zh-Hant-TW',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        runtimeCaching: [
          {
            // 班表以 stale-while-revalidate 快取，讓外勤在收訊不良時仍看得到今日行程。
            // ⚠️ 快取內容含個案姓名與電話 —— 登出時必須清空（見 lib/auth.tsx）
            urlPattern: /\/api\/v1\/m\/(visits|profile|workload)/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'ltc-mobile-data',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 3 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // 把框架與資料層拆出獨立 chunk，讓手機端不必因 admin 頁面改動而重新下載
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router)[\\/]/.test(id)) return 'vendor';
          if (id.includes('@tanstack')) return 'query';
          return undefined;
        },
      },
    },
  },
});
