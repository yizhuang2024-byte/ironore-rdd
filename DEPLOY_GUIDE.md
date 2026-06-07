# 🌀 鐵礦石×颶風 RDD分析系統 — 部署指南

## 方法一：Netlify 拖放部署（最簡單，3分鐘完成）

### 步驟：
1. 開啟 https://app.netlify.com
2. 登入（可用 Google 帳號）
3. 找到「Sites」頁面
4. 直接把 `ironore-rdd-deploy.zip` 拖放到畫面中間
5. 等待約30秒自動部署
6. 取得網址（如：https://quirky-name-123.netlify.app）

✅ 完全免費，無需信用卡
✅ 自動HTTPS
✅ 可綁定自訂網域

---

## 方法二：Vercel 部署（稍複雜，但功能更強）

### 步驟：
1. 開啟 https://vercel.com
2. 登入（可用 GitHub 帳號）
3. 點擊「Add New Project」
4. 解壓縮 `ironore-rdd-source.zip`
5. 把資料夾上傳到 GitHub
6. 在 Vercel 連接 GitHub 倉庫
7. Framework 選「Vite」，自動部署

✅ 完全免費
✅ 每次推送 GitHub 自動重新部署

---

## 方法三：GitHub Pages（直接用dist檔案）

### 步驟：
1. 在 https://github.com 建立新的倉庫（Repository）
2. 解壓縮 `ironore-rdd-deploy.zip`
3. 把 `dist/` 資料夾內的所有檔案上傳到倉庫
4. 進入倉庫設定 → Pages → Branch 選 main → 儲存
5. 等待約1分鐘
6. 取得網址（如：https://你的帳號.github.io/倉庫名稱）

✅ 完全免費
✅ 直接上傳dist內容即可

---

## 部署後如何更新數據？

### 方式A：手動更新
1. 在系統的「新增數據」頁面輸入最新數據
2. 但注意：瀏覽器刷新後數據會重置

### 方式B：更新源碼重新部署（推薦）
1. 在 App.jsx 的 MONTHLY 陣列加入新的月度數據
2. 格式：["年-月", 價格, 颶風天數]
3. 重新 `npm run build`
4. 再次拖放 dist 資料夾到 Netlify

---

## 本地開發與測試

```bash
# 安裝依賴
npm install

# 啟動開發伺服器
npm run dev
# 開啟 http://localhost:5173

# 建置生產版本
npm run build
```
