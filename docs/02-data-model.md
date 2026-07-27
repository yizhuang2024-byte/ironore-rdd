# 資料模型

Schema 位於 `apps/api/prisma/schema.prisma`，共 26 張表。

## 三個決定整體形狀的選擇

### 1. 班次是實體化的列，不是 recurrence rule

`ServiceVisit` 一列 = 一次實際服務。`RecurringPattern` 只是產生器，產完即與個別班次解耦（僅留 `sourcePatternId` 供追溯）。

理由：

1. **衝突檢核需要可索引的區間**。有實體列才能用 PostgreSQL `EXCLUDE USING gist` 在 DB 層保證同一照服員的班次絕不重疊。這是唯一能擋住並行寫入 race condition 的手段 —— 兩位督導同時排同一人時，應用層檢核會雙雙通過。RRULE 模型做不到。
2. **每趟服務有獨立生命週期**。請假代班、臨時取消、當日改時間、申報以「次」為單位。RRULE 必須另建 exception 表，複雜度最終超過直接實體化。
3. **申報需要可審計的歷史快照**。支付價格會改版；排班若只是規則，回溯歷史金額必須重算歷史規則。
4. **量級不是問題**。300 照服員規模下約 8 萬筆/3 個月、一年約 100 萬列，PostgreSQL 在適當索引下是微秒級查詢。

### 2. `serviceDate` 是刻意的冗餘欄位

月結、七休一、日工時全部以**台北日曆日**為單位。若每次都算 `(startAt AT TIME ZONE 'Asia/Taipei')::date`，索引會失效變成全表掃描。

有 `serviceDate` 加上 `@@index([attendantId, serviceDate])`，「這位照服員這週的所有班」就是 index scan。API 寫入時由 `startAt` 推導，DB 有 CHECK 約束與測試保證一致。

### 3. 支付基準依生效日期版本化

`PaymentSchedule` 為一個公告版本，所有金額查詢都以「服務日期」解析當時生效的版本。

**三層快照**確保公告改版後歷史金額不被追溯改動：

| 層級 | 欄位 |
|---|---|
| 照顧計畫核定當下的版本 | `CarePlan.scheduleId` |
| 排班當下的價格 | `VisitItem.unitPrice` |
| 實際執行（Phase 2） | `ServiceRecord` |

理由與資料來源見 [`04-ltc-payment-codes.md`](04-ltc-payment-codes.md)。

## 實體關係

```
Organization ─┬─ OrgPolicy (1:1)      勞基法門檻、路程參數、進位方式
              ├─ ServiceUnit          服務單位（督導組）
              └─ User ─┬─ UserRole    多角色，可綁單位
                       ├─ Session     DB-backed session
                       └─ Attendant (0:1)

Attendant ─┬─ AttendantServiceArea    可服務行政區
           ├─ AttendantAvailability   每週可服務時段
           ├─ Certification           證照，含到期日
           ├─ ServiceVisit
           └─ LeaveRequest

CareRecipient ─┬─ RecipientContact
               ├─ RecipientUnavailability
               ├─ CarePlan ─ CarePlanItem
               ├─ RecurringPattern
               └─ ServiceVisit ─┬─ VisitItem
                                └─ ServiceRecord (0:1, Phase 2)

PaymentSchedule ─┬─ PaymentItem       附表四照顧組合表
                 ├─ CmsQuota          CMS 等級 × 類別 → 月額度
                 └─ CopayRate         身分別 × 類別 → 部分負擔比率

AuditLog                              獨立表，不可竄改
```

## Prisma 表達不了的 DB 約束

位於 `prisma/migrations/20260727054500_visit_constraints/migration.sql`。

### 排他約束（本系統最重要的一行 SQL）

```sql
ALTER TABLE "ServiceVisit"
  ADD CONSTRAINT service_visit_attendant_no_overlap
  EXCLUDE USING gist (
    "attendantId" WITH =,
    tstzrange("startAt", "endAt", '[)') WITH &&
  ) WHERE ("attendantId" IS NOT NULL AND "status" NOT IN ('CANCELLED','NO_SHOW'));
```

行為（皆有整合測試覆蓋）：

| 情形 | 結果 |
|---|---|
| 同一照服員時段重疊 | ❌ `23P01` 拒絕 |
| 剛好相接（10:00 接 08:00–10:00） | ✅ 允許 —— 半開區間 `[)` |
| 已取消或未到的班次 | ✅ 不受限制 |
| 未指派（`attendantId` 為 NULL） | ✅ 不受限制 |

**兩個重要後果**：

1. 區間刻意不含路程緩衝。若把 travel buffer 加進 `tstzrange`，正常相鄰的班次會被 DB 拒絕。因此「路程來不及」（R07）永遠只能是應用層 WARN。
2. API 收到 `23P01` 必須轉譯成人類可讀訊息（`src/lib/errors.ts`），而非回 500。

### 其他約束

```sql
service_visit_time_order              endAt > startAt
care_recipient_cms_level_range        cmsLevel 介於 1–8
attendant_availability_minute_range   weekday 0–6、時段合法
copay_rate_permille_range             部分負擔 0–1000 千分比
REVOKE UPDATE, DELETE ON "AuditLog"   稽核紀錄不可竄改
```

> `REVOKE` 對 superuser 無效。**正式環境的應用程式資料庫帳號不得為 superuser**，否則這道防線形同虛設。

### 部分索引

```sql
service_visit_unassigned  -- 只索引未指派的少數列，供未排班佇列查詢
service_visit_range_gist  -- 區間查詢
```

## 個資保護

### 加密欄位

| 資料 | 欄位 | 方式 |
|---|---|---|
| 身分證字號 | `nationalIdEnc` + `nationalIdBidx` | AES-256-GCM + HMAC blind index |
| 地址 | `addressEnc` | AES-256-GCM |
| 病史／用藥（個資法 §6 特種個資） | `medicalNotesEnc` | AES-256-GCM |
| 照顧注意事項 | `careNotesEnc` | AES-256-GCM |
| 密碼 | `passwordHash` | Argon2id |

**為何用應用層加密而非 pgcrypto**：金鑰不進 DB、不進 SQL log，DBA 取得 dump 也無法解密。代價是無法 SQL 模糊搜尋 —— 由 blind index 解決精確查詢與唯一性檢查即可（實務上沒人需要模糊搜尋身分證字號）。

**為何 blind index 用 HMAC 而非純雜湊**：身分證字號的空間僅約 2 億組，純 SHA-256 可被暴力枚舉還原。加了金鑰才有意義。

### 遮罩在 DTO 層決定

`src/lib/dto.ts` 提供三種序列化：

| 函式 | 用途 | 內容 |
|---|---|---|
| `toRecipientDto` | 列表與詳情 | 遮罩姓名 `王○明`、身分證 `A12****789`、地址到路名 |
| `toRecipientPiiDto` | 明文 | 需 `pii:reveal` 權限，每次呼叫寫稽核 |
| `toMobileRecipientDto` | 照服員行動端 | 遮罩姓名 + 完整地址 + 電話 + 照顧注意事項，**絕無身分證與病史** |

行動端是**獨立的 serializer**，不是把管理端 DTO 拿來刪欄位 —— 後者遲早會在某次改動中漏掉一個欄位。整合測試以正規表示式驗證行動端回應不含 `nationalId`。

### 稽核軌跡

**寫入**由 Prisma Client Extension 自動攔截 `create/update/delete`。敏感欄位只記欄位名標為 `[REDACTED]`，不記值 —— 否則稽核表會變成一份未加密的個資副本。

**讀取**不全記（會爆量），只記三類：

1. 個案詳情頁開啟
2. PII 解密（`reveal-pii`）
3. 資料匯出

`AUDITOR` 角色可讀全機構資料但**刻意不具 `pii:reveal` 權限** —— 稽核工作不需要看個資明文。

### 已知債務

金鑰輪替流程尚未設計。schema 已預留 `nationalIdKeyVersion` 欄位，但輪替腳本為 Phase 2 待辦。若在此之前需要輪替，必須停機重寫全表。

## 保存年限

長照服務紀錄有法定保存期（依《長期照顧服務機構設立標準》與個資法安全維護要求，實務常見 7 年）。**確切年限需法務確認**。

Phase 1 不做自動清除；離職照服員與結案個案採狀態標記而非實刪。

## 效能備註

`AuditLog` 在 300 人規模下一年約數十萬列，Phase 1 用單表即可。migration 中已註明：若超過 500 萬列，改為 `PARTITION BY RANGE ("createdAt")` 月分割。
