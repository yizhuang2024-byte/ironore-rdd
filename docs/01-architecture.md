# 架構

## 形態

pnpm workspaces monorepo，三個 package：

```
packages/shared/   零框架依賴的純 TypeScript
apps/api/          Fastify 5 + Prisma 7 + PostgreSQL 16
apps/web/          React 19 + Vite 8 + Tailwind 4（管理端與 PWA 同一個 app）
```

選 monorepo 的**唯一關鍵理由**：排班衝突檢核引擎必須前後端共用同一份實作。若拆成兩個 repo，兩邊的規則遲早會漂移，而漂移的症狀是「前端說可以排、後端拒絕」這種對督導完全無法解釋的行為。

不加 Turborepo/Nx —— 三個 package 的建置時間不值得多一層設定與快取語意。

## 為什麼管理端與 PWA 是同一個 app

分成兩個 Vite app 會造成：session cookie 跨 origin、部署變兩份、共用元件還要再抽一個 package。

實際做法是同一個 SPA、依角色分流路由：

- 照服員（只有 `ATTENDANT` 角色）→ 強制導向 `/m/*`，手動輸入 admin 網址也會被導回
- 其他角色 → admin 路由

admin 頁面全部 `lazy()` 載入，手機端不會下載到它們。建置產物中 `RecipientDetail` 約 13 KB、`Today`（行動端今日行程）約 2 KB，各自獨立 chunk。

## 技術選型與理由

| 用途 | 選擇 | 理由 |
|---|---|---|
| 後端框架 | Fastify 5 | TS 支援佳、plugin 封裝天然模組化、比 NestJS 少一整層 DI 概念負擔 |
| 路由驗證 | `fastify-type-provider-zod` | 一份 zod schema 同時當驗證、TS 型別與 OpenAPI 來源 |
| ORM | Prisma 7 | schema 即文件、migration 檔案化，且能用手寫 SQL migration 加上 Prisma 表達不了的約束 |
| 密碼雜湊 | `@node-rs/argon2` | Argon2id 為目前建議；Rust binding 無 native build 痛點 |
| 前端資料層 | TanStack Query 5 | 排班畫面大量 refetch 與樂觀更新 |
| 虛擬捲動 | TanStack Virtual 3 | 300 列排班網格的關鍵 |
| 樣式 | Tailwind 4 + `@tailwindcss/vite` | v4 用 Vite plugin，免 postcss 設定 |
| PWA | `vite-plugin-pwa` | manifest 與 Workbox service worker |

### 時間處理：不用 Luxon 或 moment

台灣自 1980 年起未實施日光節約時間，`Asia/Taipei` 恆為 UTC+8。這消除了「不存在的時刻」與「重複的時刻」等時區地雷，固定偏移的算法是安全的，因此 `packages/shared/src/domain/time.ts` 自行實作即可，不需拉進一個日期函式庫。

**但仍不在 DB 存 naive local time** —— 所有時刻欄位用 `timestamptz` 存 UTC，僅在顯示層轉台北時間。若未來政策變更或出現跨境需求，資料本身仍是正確的。

## 版本相容性（M0 實測結果）

專案採用的工具鏈版本較新，以下三項在動工前已實測確認，無需啟用任何備案：

| 組合 | 結果 |
|---|---|
| `typescript-eslint` 8.65 × ESLint 10 | ✅ peer 為 `^8.57.0 \|\| ^9.0.0 \|\| ^10.0.0` |
| `vite-plugin-pwa` 1.3 × Vite 8 | ✅ peer 含 `^8.0.0` |
| `fastify-type-provider-zod` 7.0 × zod 4 | ✅ 要求 `zod >=4.1.5` |

另有兩處實作時才發現的新版差異，已處理：

- **Prisma 7** 改用 driver adapter（`@prisma/adapter-pg`），連線字串於執行期傳入而非寫在 schema；`prisma.config.ts` 承載 datasource 與 migrations 設定
- **Vite 8 / Rolldown** 不再支援 `manualChunks` 的物件形式，改用函式
- **Tailwind 4** 的 `@apply` 不能引用同層自訂類別

## 分層與依賴方向

```
apps/web ──┐
           ├──> packages/shared （純函式，零依賴）
apps/api ──┘
           └──> Prisma Client ──> PostgreSQL
```

`packages/shared` **不依賴 `@prisma/client`**。前端也要用這些型別，而前端不該把 Prisma runtime 拖進 bundle。API 層負責兩者的對應（`src/lib/conflict-context.ts`）。

## 請求生命週期

```
請求
 └─ onRequest    解析 session cookie → req.user
 └─ preHandler   建立 AsyncLocalStorage 稽核上下文
                 requirePermission() 檢查權限
 └─ handler      業務邏輯
                 └─ Prisma extension 自動寫 AuditLog（create/update/delete）
 └─ errorHandler 統一錯誤信封，PostgreSQL 錯誤碼轉譯
```

稽核上下文用 `AsyncLocalStorage` 而非逐層傳參：若每個 repository 方法都要多帶一個 actor 參數，只要有人忘了傳，那條寫入就沒有稽核軌跡。個資法要求的軌跡不能靠自律。

## 安全性

詳見 `docs/02-data-model.md` 的個資章節。要點：

- **認證**：DB-backed opaque session cookie，非無狀態 JWT —— 手機遺失時督導必須能即時撤銷
- **CSRF**：`SameSite=Lax` + 所有 non-GET 要求自訂標頭 `X-Requested-With: ltc`
- **個資**：AES-256-GCM 應用層加密 + HMAC blind index；金鑰不進 DB、不進 SQL log
- **權限**：`unitScope()` 產生 Prisma where 片段統一注入，而非每個 handler 手寫判斷
- **稽核**：`AuditLog` 在 migration 中已 `REVOKE UPDATE, DELETE`

## 測試策略

| 層 | 位置 | 重點 |
|---|---|---|
| 單元 | `packages/shared/src/**/*.test.ts` | 176 個。衝突引擎每條規則 ≥3 案例，覆蓋率門檻 90% |
| 整合 | `apps/api/test/*.test.ts` | 29 個。打真實 PostgreSQL，用 `app.inject()` 不需開 port |
| E2E | `e2e/*.spec.ts` | Playwright，涵蓋登入→排班→衝突擋下→行動端 |

整合測試共用一個資料庫，故 `fileParallelism: false`。

## 本機開發不使用 Docker

容器環境中 Docker daemon 未必可用，而 PostgreSQL 16 通常已安裝於系統。開發用 `./scripts/dev-db.sh` 啟動系統的 PostgreSQL；`docker-compose.yml` 僅供正式部署。

CI 則使用 GitHub Actions 的 `services: postgres:16`。
