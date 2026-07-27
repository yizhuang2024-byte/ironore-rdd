# 長照居家服務 排班暨個案管理系統

為長照日照單位打造的內部系統，管理 **300 位居家服務照服員**的排班、個案主檔與服務項目給付。

> **關於本 repo 的歷史**：此 repo 原本存放「鐵礦石×颶風 RDD 分析系統」，與長照業務無關。
> 原專案完整保留於 `main` 分支與 `legacy/ironore-rdd-v1` tag。

## 目前狀態：Phase 1

| 功能 | 狀態 |
|---|---|
| 個案與照服員主檔 | ✅ |
| 照顧計畫與長照支付基準（版本化） | ✅ |
| 排班與衝突檢核（R01–R22） | ✅ |
| 請假審核與代班 | ✅ |
| 照服員行動端 PWA（唯讀班表 + 請假） | ✅ |
| 稽核紀錄與個資保護 | ✅ |
| 服務打卡與紀錄回報 | Phase 2（資料表已備妥） |
| 政府申報檔匯出 | Phase 2（需先取得各縣市格式規格） |

## 快速開始

```bash
# 1. 啟動資料庫（本機 PostgreSQL 16，非 Docker）
./scripts/dev-db.sh start

# 2. 安裝與設定
pnpm install
cp .env.example .env
# 產生三把金鑰填入 .env：
#   openssl rand -base64 32   → PII_ENCRYPTION_KEY
#   openssl rand -base64 32   → PII_INDEX_KEY
#   openssl rand -base64 32   → SESSION_SECRET

# 3. 建立資料表與示範資料
pnpm db:migrate:deploy
pnpm db:seed                    # demo 規模：300 照服員 / 1,800 個案 / 約 8 萬筆班次（約 90 秒）
pnpm db:seed -- --scale=small   # 小規模：40 / 200 / 約 6 千筆（約 10 秒）

# 4. 啟動
pnpm dev        # API :3000（文件 /docs）、Web :5173
```

### 示範帳號

密碼一律 `Demo@1234`（**僅供開發環境**）

| 帳號 | 角色 | 可見範圍 |
|---|---|---|
| `admin` | 管理者 | 全機構 |
| `sup01`–`sup06` | 督導 | 所屬服務單位 |
| `staff01` | 行政 | 全單位讀寫，不可覆寫排班檢核 |
| `auditor01` | 稽核 | 全機構唯讀，**無個資明文** |
| `att0001`… | 照服員 | 僅自己的班表，行動端介面 |

## 專案結構

```
packages/shared/     零框架依賴的純 TS
  domain/            時間（Asia/Taipei）、地理、列舉
  scheduling/        ★ 排班衝突檢核引擎 R01–R22
  payment/           給付額度與部分負擔計算
apps/api/            Fastify 5 + Prisma 7 + PostgreSQL 16
apps/web/            React 19 + Vite 8 + Tailwind 4（管理端與 PWA 同一 app）
docs/                架構、資料模型、規則說明、支付基準來源
```

## 幾個關鍵設計決定

### 衝突檢核引擎前後端共用同一份實作

引擎是純函式，放在 `packages/shared`。前端拖曳時跑它做即時預覽，後端在寫入交易內重跑同一份程式碼強制執行。組裝輸入資料是呼叫端的責任（後端用 Prisma、前端用 React Query 快取），這讓引擎維持零依賴，也讓前後端的檢核結果不會漂移。

**前端結果永不被信任。**

### 班次是實體化的列，不是 recurrence rule

`ServiceVisit` 一列 = 一次實際服務。這讓 PostgreSQL 的 `EXCLUDE USING gist` 排他約束能在 DB 層保證同一照服員的班次絕不重疊 —— 這是唯一能擋住並行寫入 race condition 的手段，因為兩位督導同時排同一人時，應用層檢核會雙雙通過。

代價是資料量（一年約 100 萬列），但在適當索引下這對 PostgreSQL 不是問題。

### 支付基準依生效日期版本化，程式零寫死

系統中沒有任何支付代碼、價格、額度或比率的常數。理由與匯入方式見 [`docs/04-ltc-payment-codes.md`](docs/04-ltc-payment-codes.md)。

> ⚠️ **隨附的支付基準為範例資料，不可用於正式申報。**

### 認證用 DB-backed session 而非無狀態 JWT

照服員手機遺失時，督導必須能立即撤銷該裝置的存取權。這是個資法「設備遺失之應變措施」的實質要求，無狀態 JWT 做不到。

### 勞基法門檻全部是機構可調參數

系統不對勞基法在居家服務業的適用方式表示法律見解。特別是「趟與趟之間的空檔是否計入工時」這個長年爭議，引擎同時輸出三種算法供並陳。見 [`docs/03-conflict-rules.md`](docs/03-conflict-rules.md)。

## 上線前必辦事項

1. **匯入正式的長照支付基準** — 見 `docs/04-ltc-payment-codes.md`，需逐項校對簽核
2. **由人資或法務確認工時門檻** — 見 `docs/03-conflict-rules.md`
3. **變更所有示範帳號密碼**，並將應用程式的資料庫帳號改為**非 superuser**（否則 `AuditLog` 的 REVOKE 不生效）
4. **設定 HTTPS 與 HSTS**（session cookie 的 `secure` 旗標依 `NODE_ENV` 啟用）
5. **金鑰保管與輪替計畫** — schema 已預留 `nationalIdKeyVersion`，但輪替腳本為 Phase 2 待辦

## 常用指令

```bash
pnpm typecheck              # 全 workspace 型別檢查
pnpm lint
pnpm test                   # 單元測試
pnpm --filter @ltc/shared test -- --coverage   # 衝突引擎覆蓋率（門檻 90%）
pnpm build

./scripts/dev-db.sh start|stop|status|reset-test
pnpm db:migrate             # 開發用 migration
pnpm db:studio              # Prisma Studio
```

## 環境需求

- Node 22+
- pnpm 10+
- PostgreSQL 16+（需 `btree_gist` extension）

本機開發使用系統安裝的 PostgreSQL 而非 Docker（容器環境中 Docker daemon 未必可用）。正式部署可用根目錄的 `docker-compose.yml`。
