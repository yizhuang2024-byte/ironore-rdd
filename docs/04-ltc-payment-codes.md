# 長照給付及支付基準 — 資料來源與校對紀錄

## ⚠️ 上線前必辦事項

**目前系統中的支付代碼、價格、月給付額度與部分負擔比率皆為「範例資料」，不可用於正式申報。**

上線前必須：

1. 自衛生福利部長期照顧司取得最新公告之《長期照顧服務申請及給付辦法》**附表四（照顧組合表）**
2. 將其轉為 CSV（欄位格式見下）並匯入系統
3. 由機構申報人員**逐項校對**後在本文件的校對紀錄表簽核
4. 停用範例版本（設定 `effectiveTo`）

## 為什麼系統中沒有寫死任何金額

程式碼裡沒有任何支付代碼、價格、額度或比率的常數。全部由 CSV 匯入 DB，並依「服務日期」解析當時生效的版本。

這不是過度設計。已查證的事實：

- 《長期照顧服務申請及給付辦法》於 **民國 114 年 6 月 19 日**修正發布
- 其中 **BA08（足部照護）、BA09（到宅沐浴車服務）、BA09a** 等碼別 **自民國 115 年 1 月 1 日施行**
- 而該辦法的**最後施行日期為民國 115 年 7 月 1 日**

也就是說，**同一次修正中不同碼別的施行日期並不相同**。任何把碼表寫死在程式裡的做法，都會在改版時把歷史班次的申報金額算錯，而這種錯誤在申報被核刪之前不會被發現。

### 三層價格快照

| 層級 | 欄位 | 用途 |
|---|---|---|
| 照顧計畫 | `CarePlan.scheduleId` | 核定當下適用的支付基準版本 |
| 班次項目 | `VisitItem.unitPrice` | 排班當下的價格快照，申報依據 |
| 服務紀錄 | `ServiceRecord`（Phase 2） | 實際執行時數與項目 |

公告改版後，歷史班次的金額不會被追溯改動。

## 已查證與未查證的資料

### 已查證（來源見下方參考資料）

| 項目 | 數值 |
|---|---|
| BA01 基本身體清潔 | 260 元（自付：一般戶 41／中低收 13／低收 0） |
| BA02 基本日常照顧 | 195 元（自付：一般戶 31／中低收 9／低收 0） |
| BA08 足部照護 | 500 元；原民區或離島 600 元（115.01.01 施行） |
| 照顧及專業服務部分負擔比率 | 一般戶 16%、中低收入戶 5%、低收入戶 0% |
| CMS 2–8 級月給付額度區間 | 10,020 元 ～ 36,180 元 |
| 附表四含第二價格欄 | 「原民區或離島支付價格」 |

### 未查證（範例資料中為**佔位值**，必然與公告不符）

- BA01／BA02／BA08 以外所有代碼的名稱、價格、標準時長、次數上限
- CMS 3–7 級各級的確切月額度（僅知區間端點）
- 交通接送、輔具、喘息服務的部分負擔比率
- **夜間／假日／困難服務加計項目究竟是定額還是百分比加成** — schema 已同時預留 `price` 與 `addOnPercent` 兩種欄位，但實作前需向公告確認採用哪一種
- 金額進位方式（四捨五入／無條件捨去）— 目前為 `OrgPolicy.roundingMode` 可設定項

## CSV 格式

### 支付項目 `payment-codes.csv`

```csv
code,category,name,description,price,priceRemote,unitType,standardMinutes,maxPerDay,maxPerMonth,isAddOn,requiredCerts
BA01,CARE_PROFESSIONAL,基本身體清潔,協助沐浴洗頭等,260,312,PER_TIME,60,1,,false,CARE_ATTENDANT_TRAINING
```

| 欄位 | 說明 |
|---|---|
| `code` | 碼別，如 BA01 |
| `category` | `CARE_PROFESSIONAL`／`TRANSPORT`／`ASSISTIVE_DEVICE`／`RESPITE`。各類別額度池互不流用 |
| `price` | 給付價格（元，整數） |
| `priceRemote` | 原民區或離島支付價格。留空則偏遠地區個案沿用 `price` |
| `unitType` | `PER_TIME`／`PER_HOUR`／`PER_DAY`／`PER_ITEM` |
| `maxPerDay` | 同日次數上限。設為 1 表示同日不可重複 |
| `isAddOn` | `true` 表示加計項目，不可單獨排班（規則 R13） |
| `requiredCerts` | 提供此項目所需證照，多筆以 `;` 分隔（規則 R08） |

### CMS 額度 `cms-quota.csv`

```csv
cmsLevel,category,monthlyAmount
4,CARE_PROFESSIONAL,18580
```

### 部分負擔比率 `copay-rates.csv`

```csv
copayCategory,category,ratePermille
GENERAL,CARE_PROFESSIONAL,160
```

`ratePermille` 為**千分比整數**（160 = 16%），以整數運算避免浮點誤差。

> **部分負擔只適用於核定額度內的金額。超出額度的部分一律 100% 自費，低收入戶亦然。**
> 這是實務上最常算錯的地方，`packages/shared/src/payment/copay.test.ts` 有專屬測試案例。

## 匯入方式

### 管理端畫面

`/payment-codes` → 選擇或建立版本 → 匯入 CSV

### API

```bash
# 建立新版本
curl -X POST /api/v1/payment-schedules \
  -d '{"name":"長照給付及支付基準 115 年版","effectiveFrom":"2026-01-01","sourceRef":"衛部顧字第 XXXXXXXXX 號"}'

# 匯入項目（整批取代該版本所有項目）
curl -X PUT /api/v1/payment-schedules/<id>/items --data-binary @payment-codes.csv
curl -X PUT /api/v1/payment-schedules/<id>/quotas --data-binary @cms-quota.csv
curl -X PUT /api/v1/payment-schedules/<id>/copay-rates --data-binary @copay-rates.csv
```

## 校對簽核紀錄

| 版本名稱 | 公告文號 | 生效日 | 匯入日期 | 校對人 | 覆核人 | 備註 |
|---|---|---|---|---|---|---|
| 長照給付及支付基準（範例版） | — | 2020-01-01 | — | — | — | **開發測試用，不可申報** |
|  |  |  |  |  |  |  |

## 參考資料

- [長期照顧服務申請及給付辦法 — 全國法規資料庫](https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=L0070059)
- [長期照顧服務申請及給付辦法 — 臺北市法規查詢系統（含附件下載）](https://laws.gov.taipei/Law/LawSearch/LawFileList/FL098057)
- [衛生福利部](https://www.mohw.gov.tw/)
- 長照專線 **1966**

> 各縣市照管中心的**申報檔格式**（欄位、編碼、XML／CSV 規格）需另行索取技術文件。
> Phase 1 刻意不猜格式；但 `VisitItem.unitPrice` 快照與 `ServiceRecord` 的實際時間已齊備，
> 足以在 Phase 2 產出任何格式。
