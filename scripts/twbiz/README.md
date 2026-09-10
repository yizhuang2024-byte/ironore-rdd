# 台灣中小企業黃頁搜尋（客戶名單產生器）

從經濟部「商工登記公示資料開放平臺」擷取工商登記資料，**只留下仍在營業的公司／行號**，
輸出成可直接開啟的 CSV 與 Excel（.xlsx）客戶名單。純 Node.js，無第三方套件。

## 快速開始

```bash
# 1. 先確認資料集與網路可用（會印出該資料集的實際欄位）
npm run customers -- --probe

# 2. 關鍵字搜尋（最常用）
npm run customers -- --keyword 鋼鐵,金屬,廢鐵 --limit 1000

# 3. 全台掃描：以 22 縣市所在地逐一擷取，不限資本額
npm run customers -- --all-cities --limit 2000 --out data/全台客戶名單

# 4. 加條件：只要中南部、資本額 500 萬以上
npm run customers -- --all-cities --city 臺中市,彰化縣,臺南市,高雄市 --min-capital 5000000
```

輸出預設放在 `data/customers-<日期>.csv` 與 `.xlsx`（`data/` 已加入 .gitignore，名單含個資不入版控）。

## 「還在營業」怎麼判定

以登記狀態欄位為準，兩層把關（`normalize.js`）：

1. 狀態文字含「解散、撤銷、廢止、歇業、停業、註銷、清算、破產、合併」→ 一律排除。
2. 狀態碼為 `01` 或狀態文字含「核准設立／營業中／核准登記」→ 視為仍在營業。

擷取時同時在 API 端下 `Company_Status eq 01`，本機再過濾一次，避免平臺回傳未過濾的資料。
加 `--all-status` 可保留全部狀態（例如想比對哪些客戶已歇業）。

> 注意：登記狀態只代表「登記未終止」，不等於實際有營運。名單仍建議用資本額、
> 最後核准變更日期（`--setup-after`、欄位「最後核准變更日期」）再篩一輪，長年未異動者通常是空殼。

## 參數

執行 `npm run customers -- --help` 可看完整清單。常用的幾個：

| 參數 | 說明 |
| --- | --- |
| `--keyword 鋼鐵,金屬` | 名稱關鍵字，逗號分隔可多組，逐組擷取後合併去重 |
| `--all-cities` | 改用「依所在地」資料集，對 22 縣市逐一擷取（全台掃描） |
| `--dataset` | `companyByName`（預設）/ `companyByLocation` / `companyByItem` / `businessByName`（行號） |
| `--city 台中市,高雄市` | 本機依地址篩縣市；「台」「臺」通用 |
| `--min-capital` / `--max-capital` | 資本額區間（元） |
| `--include` / `--exclude` | 名稱＋營業項目＋地址的關鍵字白／黑名單 |
| `--setup-after` / `--setup-before` | 核准設立日期區間（YYYY-MM-DD） |
| `--limit` | 每組關鍵字最多擷取筆數，預設 1000 |
| `--input 檔案.csv` | 離線模式，改讀本機批次檔（見下） |
| `--format csv,xlsx,json` | 輸出格式，預設 csv,xlsx |

## 離線模式（建議用於全台大量名單）

平臺 API 有流量限制，要一次拿全國資料，直接下載政府資料開放平臺的公司登記／商業登記
批次檔（CSV 或 JSON），再用同一套篩選邏輯處理：

```bash
npm run customers -- --input downloads/company.csv --city 臺中市 --min-capital 1000000
```

離線模式不呼叫 API，欄位名稱自動對應公司登記與商業登記兩種格式。

## 資料集 ID

`config.js` 內的 dataset id 以平臺公告為準。若平臺調整導致 `--probe` 失敗，
不必改程式碼，改用覆寫即可：

```bash
npm run customers -- --dataset companyByName --dataset-id <新的UUID> --probe
# 或
TWBIZ_DATASET_COMPANYBYNAME=<新的UUID> npm run customers -- --keyword 鋼鐵
```

平臺 API 清單：<https://data.gcis.nat.gov.tw/main/api>

## 檔案結構

| 檔案 | 用途 |
| --- | --- |
| `search.js` | CLI 入口：參數解析、流程串接、統計輸出 |
| `gcis.js` | API 用戶端：分頁、重試（2/4/8/16 秒退避）、節流 |
| `normalize.js` | 欄位正規化（民國轉西元、地址抽縣市）、營業中判定、篩選、去重 |
| `export.js` | CSV（含 BOM）、XLSX（自組 OOXML）、JSON 輸出與 CSV 解析 |
| `config.js` | 資料集、狀態碼、縣市對照等設定 |

## 合規提醒

資料為政府公開的商工登記公示資料，可作商業使用；但名單含負責人姓名與營業地址，
屬個資法規範範圍。用於行銷聯繫時請遵守個資法與《個人資料保護法》第 20 條的
特定目的外利用限制，並在對方表示拒絕時停止聯繫。
