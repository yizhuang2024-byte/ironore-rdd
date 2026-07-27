-- 手寫 migration：Prisma schema 語法無法表達的 DB 層約束
--
-- 這裡的 EXCLUDE 約束是本系統唯一能擋住並行寫入 race condition 的手段。
-- 應用層的衝突檢核在「兩位督導同時把同一位照服員排進重疊時段」時會雙雙通過，
-- 只有 DB 層的排他約束能保證最終一致。

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ─────────────────────────────────────────────────────────────
-- 同一照服員的有效班次時間區間不得重疊
-- ─────────────────────────────────────────────────────────────
-- ⚠️ 重要：區間刻意「不含」路程緩衝時間。
--    若把 travel buffer 加進 tstzrange，正常相鄰的班次會被 DB 直接拒絕。
--    因此「路程來不及」(R07) 永遠只能是應用層 WARN，不可能是 BLOCK。
-- ⚠️ API 收到 PostgreSQL error code 23P01 時必須轉譯成人類可讀的
--    「時間重疊」錯誤，而非回傳 500。
ALTER TABLE "ServiceVisit"
  ADD CONSTRAINT service_visit_attendant_no_overlap
  EXCLUDE USING gist (
    "attendantId" WITH =,
    tstzrange("startAt", "endAt", '[)') WITH &&
  ) WHERE ("attendantId" IS NOT NULL AND "status" NOT IN ('CANCELLED', 'NO_SHOW'));

-- 區間查詢用的 GiST 索引
CREATE INDEX service_visit_range_gist
  ON "ServiceVisit" USING gist (tstzrange("startAt", "endAt", '[)'));

-- 未排班佇列 —— 部分索引，只索引少數列
CREATE INDEX service_visit_unassigned
  ON "ServiceVisit" ("orgId", "serviceDate")
  WHERE "attendantId" IS NULL AND "status" <> 'CANCELLED';

-- ─────────────────────────────────────────────────────────────
-- 資料完整性檢查
-- ─────────────────────────────────────────────────────────────
ALTER TABLE "ServiceVisit"
  ADD CONSTRAINT service_visit_time_order CHECK ("endAt" > "startAt");

ALTER TABLE "CareRecipient"
  ADD CONSTRAINT care_recipient_cms_level_range CHECK ("cmsLevel" BETWEEN 1 AND 8);

ALTER TABLE "AttendantAvailability"
  ADD CONSTRAINT attendant_availability_minute_range
  CHECK ("weekday" BETWEEN 0 AND 6 AND "startMinute" >= 0 AND "endMinute" <= 1440 AND "endMinute" > "startMinute");

-- 部分負擔比率為千分比整數（160 = 16%），不得超出 0–1000
ALTER TABLE "CopayRate"
  ADD CONSTRAINT copay_rate_permille_range CHECK ("ratePermille" BETWEEN 0 AND 1000);

-- ─────────────────────────────────────────────────────────────
-- 稽核紀錄不可竄改（個資法安全維護要求）
-- ─────────────────────────────────────────────────────────────
-- 應用程式帳號只能 INSERT 與 SELECT。即使應用層被攻破也無法抹除軌跡。
-- 注意：superuser 不受此限，正式環境的應用程式帳號不得為 superuser。
REVOKE UPDATE, DELETE, TRUNCATE ON "AuditLog" FROM PUBLIC;

-- 效能備註：本表在 300 人規模下每年約數十萬列，Phase 1 用單表即可。
-- 若超過 500 萬列，改為 PARTITION BY RANGE ("createdAt") 月分割。
