import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 部署方式為「GitHub Pages 直接服務 repo 根目錄」，所以建置產物（index.html +
// assets/）就是 repo 根目錄的那幾個檔案。
//
// 原本的入口 index.html 曾被建置產物覆蓋（script src 指向 ./assets/index-*.js），
// 導致 vite 把舊的 bundle 當成入口再打包一次 — 不論 src/ 怎麼改，輸出都不會變。
// 因此把「原始碼入口」移到 src/index.html，根目錄的 index.html 純粹是產物。
export default defineConfig({
  plugins: [react()],
  base: './',
  root: 'src',
  publicDir: '../public',
  build: {
    outDir: '..',
    emptyOutDir: false, // 根目錄還有 README、原始碼等，不能整個清掉
    assetsDir: 'assets',
  },
})
