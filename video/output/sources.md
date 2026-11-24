# 《紅土上的鋼鐵脈動》資料來源與查證紀錄

影片主題：鐵礦石的歷史、澳洲產地（皮爾巴拉）、2013–2026 價格波動與熱帶氣旋影響。
整理日期：2026-11-24。所有旁白數字皆有出處；凡是「估計」「示意」都在畫面與本文件中標明。

---

## 一、逐句旁白 ↔ 來源對照

| # | 旁白（字幕版） | 來源編號 |
|---|---|---|
| 1 | 西澳皮爾巴拉，紅土山脈一路綿延到印度洋。 | 描述性（地理），S12 |
| 2 | 這裡的鐵礦石，撐起了全世界的鋼鐵。 | S2（澳洲為全球最大產國） |
| 3 | 約西元前3200年，埃及人用隕鐵打成珠子。 | S5 |
| 4 | 約西元前1200年，冶鐵擴散，鐵器時代展開。 | S6 |
| 5 | 1856年，貝塞麥煉鋼法讓鋼材首次能大量生產。 | S7 |
| 6 | 1952年，漢考克自述在飛機上發現皮爾巴拉鐵礦。 | S8、S9（此為漢考克本人說法，故用「自述」） |
| 7 | 1960年，澳洲部分解除1938年起的出口禁令。 | S8 |
| 8 | 美國地質調查局估計，2025年澳洲產量約9.8億噸。 | S2（980,000 千公噸，2025e，可用礦石） |
| 9 | 居全球第一，約占全球26億噸的三成八。 | S2（980 ÷ 2,600 ≈ 37.7%，為本片自行計算） |
| 10 | 黑德蘭港一年吞吐約5.78億噸，98.5%是鐵礦。 | S10（2024-25 年度 577.7 Mt） |
| 11 | 最大買家在中國，2024年中國粗鋼產量逾10億噸。 | S11（1,005.1 Mt） |
| 12 | 世界銀行數據：2013年鐵礦石年均價約135美元。 | S1（2013 年 12 個月平均 135.37） |
| 13 | 中國需求放緩、供給大增，2015年底跌到40.5美元。 | S1（2015M12 = 40.5）、S13（原因） |
| 14 | 2019年巴西淡水河谷尾礦壩潰決，供給吃緊，價格回升。 | S14；S1（2019M01 76.2 → 2019M07 120.2） |
| 15 | 2021年6月，月均價衝上214.4美元。 | S1（2021M06 = 214.4，2013–2026 期間最高月均價）、S15 |
| 16 | 到了2026年10月，回落到每噸90.8美元。 | S1（2026M10 = 90.8，Pink Sheet 2026-11-03 更新） |
| 17 | 皮爾巴拉海岸，是澳洲最常遭熱帶氣旋侵襲的地方。 | S16、S17 |
| 18 | 2019年氣旋韋羅妮卡，力拓估計減產約1,400萬噸。 | S18 |
| 19 | 2023年氣旋伊爾莎，黑德蘭港暫停裝船約兩天。 | S20 |
| 20 | 2025年第一季，四個氣旋讓力拓損失約1,300萬噸。 | S21 |
| 21 | 2026年第一季，氣旋米契爾與娜瑞兒再影響約800萬噸。 | S22、S23 |
| 22 | 幾內亞西芒杜礦已出貨，規劃年產能1.2億噸。 | S24 |
| 23 | 澳洲政府預估，2031年實質價格約降至64美元。 | S3、S4 |
| 24 | 綠色煉鋼常需含鐵67%以上的礦，皮爾巴拉正尋求升級。 | S25 |
| 25 | 從一顆隕鐵珠到萬噸巨輪，鐵礦石始終伴著人類前行。 | 結語（無數據） |

---

## 二、來源清單

### 價格與產量（核心數據）
- **S1** World Bank, *Commodity Price Data (The Pink Sheet)* — CMO Historical Data Monthly，"Iron ore, cfr spot ($/dmt)"，2026-11-03 更新。
  https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Monthly.xlsx
  （本片價格曲線 2013-01 ～ 2026-10 全部 166 個月逐月取自此檔；原始數據另存於 `data/worldbank_pinksheet_iron_ore_monthly_2013_2026.csv`）
  交叉比對：IMF Global price of Iron Ore（FRED: PIORECRUSDM）https://fred.stlouisfed.org/series/PIORECRUSDM
- **S2** U.S. Geological Survey, *Mineral Commodity Summaries 2026 — Iron Ore*（2026 年 2 月；v1.1 2026 年 3 月）
  https://pubs.usgs.gov/periodicals/mcs2026/mcs2026-iron-ore.pdf
  2025e 可用礦石產量（千公噸）：澳洲 980,000；巴西 420,000；印度 310,000；中國 290,000；全球（四捨五入）2,600,000。
- **S3** 澳洲工業科學資源部 DISR, *Resources and Energy Quarterly: September 2026*（2026-10-02）
  https://www.industry.gov.au/publications/resources-and-energy-quarterly-september-2026
  官方新聞稿：https://www.industry.gov.au/news/australias-resources-and-energy-export-earnings-set-remain-high
- **S4** Kallanish, "Iron ore prices expected to soften through outlook"（引述 REQ：2031 年實質價格約 US$64/t）
  https://www.kallanish.com/en/news/steel/market-reports/article-details/iron-ore-prices-expected-to-soften-through-outlook-0726/
- **S10** Pilbara Ports, *Port of Port Hedland fact sheet*；WA Government media statement (2025-07-24)
  https://www.pilbaraports.com.au/about-pilbara-ports/publications/forms-and-publications/forms-and-publications/other/2024/november/port-of-port-hedland-fact-sheet
  https://www.wa.gov.au/government/media-statements/Cook%20Labor%20Government/Pilbara-Ports-achieves-record-throughput-for-sixth-consecutive-year--20250724
- **S11** worldsteel, *World Steel in Figures 2025*（中國 2024 年粗鋼 1,005.1 Mt）
  https://worldsteel.org/wp-content/uploads/World-Steel-in-Figures-2025.pdf

### 歷史
- **S5** UCL News (2013), "Earliest known iron artefacts come from outer space"；Rehren et al., *Journal of Archaeological Science* (2013)
  https://www.ucl.ac.uk/news/2013/aug/earliest-known-iron-artefacts-come-outer-space
- **S6** Erb-Satullo (2019), "The Innovation and Adoption of Iron in the Ancient Near East", *Journal of Archaeological Research*；Iron Age 條目
  https://link.springer.com/article/10.1007/s10814-019-09129-6 ・ https://en.wikipedia.org/wiki/Iron_Age
- **S7** Encyclopaedia Britannica, "Bessemer process" https://www.britannica.com/technology/Bessemer-process
- **S8** National Museum of Australia, *Defining Moments: Iron ore exports*（1938 禁令、1960-11-24 部分解除）
  https://www.nma.gov.au/defining-moments/resources/iron-ore-exports
- **S9** State Library of Western Australia, "Lang Hancock"；Australian Dictionary of Biography
  https://exhibitions.slwa.wa.gov.au/s/mewa/page/LangHancock ・ https://adb.anu.edu.au/biography/hancock-langley-frederick-lang-17492
- **S12** Britannica, "Pilbara" https://www.britannica.com/place/Pilbara

### 價格驅動因素
- **S13** UNCTAD (2016), "Demand for iron ore levelled in 2015…"；Mining.com, "'Inexorable decline': Iron ore price hits new low"
  https://unctad.org/press-material/demand-iron-ore-levelled-2015-reflecting-weak-growth-world-steel-production-unctad
  https://www.mining.com/inexorable-decline-iron-ore-price-hits-new-low-90175/
- **S14** Mining.com (Reuters), "Brazil's Vale slashes iron ore sales estimate after dam burst"；Mining.com, "Brumadinho dam disaster shrinks Vale iron ore output 34%"
  https://www.mining.com/web/brazils-vale-slashes-iron-ore-sales-estimate-dam-burst/
  https://www.mining.com/brumadinho-dam-disaster-keeps-hurting-vale-iron-ore-output-falls-34/
- **S15** S&P Global Commodity Insights (2021-04-27), "Steel margin expansions send seaborne iron ore prices to all-time high"
  https://www.spglobal.com/commodity-insights/en/news-research/latest-news/metals/042721-steel-margin-expansions-send-seaborne-iron-ore-prices-to-all-time-high

### 熱帶氣旋
- **S16** Town of Port Hedland, *Cyclone Book 2024*（「黑德蘭港至埃克斯茅斯灣的皮爾巴拉海岸是澳洲最易受氣旋侵襲的區域」；氣旋季 11/1–4/30）
  https://www.porthedland.wa.gov.au/Profiles/porthedland/Assets/ClientData/TOPH_Cyclone_Book_2024_SCREEN_FINAL_PAGES.pdf
- **S17** WA DFES, "Cyclone"；Bureau of Meteorology, "Tropical Cyclones Affecting Pilbara"
  https://dfes.wa.gov.au/hazard-information/cyclone ・ https://www.bom.gov.au/cyclone/history/wa/pilbara.shtml
- **S18** Rio Tinto (2019-04-01), "Update on Tropical Cyclone Veronica" https://www.riotinto.com/en/news/releases/2019/tropical-cyclone-veronica-update
- **S19** BHP (2019-04), "Tropical Cyclone Veronica – Western Australia Iron Ore update"
  https://www.bhp.com/media-and-insights/news-releases/2019/04/tropical-cyclone-veronica---western-australia-iron-ore-update
- **S20** Argus, "Australian iron ore port Hedland reopens after cyclone"（2023-04-14）
  https://www.argusmedia.com/en/news/2439225-australian-iron-ore-port-hedland-reopens-after-cyclone
- **S21** Rio Tinto Q1 2025 Operations Review（Business Wire, 2025-04-15）；Mining.com 報導
  https://www.businesswire.com/news/home/20250415416644/en
  https://mining.com/web/rio-tinto-iron-ore-shipments-fall-as-cyclones-hit-pilbara-operations
- **S22** Rio Tinto, "First quarter 2026 production results"（2026-04-21）
  https://www.riotinto.com/en/news/releases/2026/rio-tinto-releases-first-quarter-2026-production-results
- **S23** Mining Weekly (2026-02-09), "Port Hedland resumes operations after Tropical Cyclone Mitchell"；Kitco/Reuters (2026-03-30), "Rio Tinto resumes Pilbara port operations after cyclone Narelle"
  https://www.miningweekly.com/article/port-hedland-resumes-operations-after-tropical-cyclone-mitchell-2026-02-09
  https://www.kitco.com/news/off-the-wire/2026-03-30/rio-tinto-resumes-pilbara-port-operations-after-cyclone-narelle

### 未來展望
- **S24** S&P Global (2026-01-19), "Simandou's first shipment with 200,000 mt high-grade iron ore arrives in China"；Caixin (2025-12-03)
  https://www.spglobal.com/energy/en/news-research/latest-news/metals/011926-simandous-first-shipment-with-200000-mt-high-grade-iron-ore-arrives-in-china
  https://www.caixinglobal.com/2025-12-03/simandou-iron-ore-mine-ships-first-cargo-to-china-102389356.html
- **S25** CSIRO (2026-03), "Green metals"（DRI 通常需 >67% Fe，排除多數皮爾巴拉礦）；IEEFA (2022), *Iron Ore Quality a Potential Headwind to Green Steelmaking*（皮爾巴拉商業礦床多為 56–62% Fe）
  https://www.csiro.au/en/news/All/Articles/2026/March/Green-metals
  https://ieefa.org/resources/australias-path-green-iron

---

## 三、熱帶氣旋對皮爾巴拉鐵礦生產／港口的影響（研究整理）

> 說明：「有數字」欄為公司或港口官方／權威媒體公布的數字；「事件」欄表示有確實影響但**未公布可量化損失**，僅作為事件描述，不自行推算。

| 年份 | 氣旋 | 影響情形 | 數字 | 類型 | 來源 |
|---|---|---|---|---|---|
| 2013/12 | Christine | 黑德蘭港錨地關閉 66 小時、港口 64 小時；丹皮爾關閉 48 小時；港口僅輕微損壞 | 停港時數 | 有數字（時數） | Maritime Executive / Reuters：https://maritime-executive.com/article/Australia-Cyclone-Batters-Iron-Ore-Ports-2013-12-30 |
| 2019/03 | Veronica | 力拓宣布不可抗力，估計減產約 14 Mt；Q1 皮爾巴拉出貨年減 14% 至 69.1 Mt；全年指引下修為 333–343 Mt。BHP 估計減產 6–8 Mt | 14 Mt；6–8 Mt | 有數字 | S18、S19 |
| 2020/02 | Damien | 丹皮爾港 2/7 關閉；力拓 2020 出貨指引由 330–343 Mt 下修為 324–334 Mt；Pilbara 網路基礎設施受損 | 指引下修 | 有數字（指引） | https://www.businesswire.com/news/home/20200217005139/en/Rio-Tinto-Update-on-Tropical-Cyclone-Damien |
| 2023/04 | Ilsa（5 級） | 黑德蘭港 4/12 清港，4/14 11:00 重開，無損壞；WA 當週出口降至 10.28 百萬 dwt | 約 2 天停止裝船 | 有數字（天數） | S20 |
| 2025/01 | Sean | 創紀錄降雨導致力拓鐵路中斷，預警 Q1 出貨受影響；力拓一座港口設施受損 | — | 事件（併入 Q1 合計） | https://mining.com/web/rio-tinto-sees-q1-shipment-disruptions-after-cyclone-induced-rail-operations-woes |
| 2025/02 | Zelia（5 級） | 黑德蘭港、丹皮爾港關閉；BHP 暫停作業；未見重大損害，力拓維持全年指引 323–338 Mt | — | 事件 | https://www.miningweekly.com/article/australias-iron-ore-hub-reopens-rio-mines-resume-after-cyclone-2025-02-17 |
| 2025 Q1 | 四個氣旋合計 | 力拓估計損失約 13 Mt；Q1 皮爾巴拉出貨 70.7 Mt（年減 9%），為 2019 年以來最低 Q1；復原計畫約 A$150M | 13 Mt | 有數字 | S21 |
| 2026/02 | Mitchell（3 級） | 黑德蘭港、Ashburton、Cape Preston West、丹皮爾、Varanus Island 清港關閉；黑德蘭港 2/8 中午重開 | — | 事件（併入 Q1 合計） | S23 |
| 2026/03 | Narelle | 力拓三座港口碼頭作業中斷後恢復 | — | 事件（併入 Q1 合計） | S23 |
| 2026 Q1 | Mitchell + Narelle | 力拓公布熱帶氣旋影響皮爾巴拉出貨約 8 Mt；維持全年指引 323–338 Mt | 約 8 Mt | 有數字 | S22 |

**觀察（僅描述，不做因果推論）：** 世界銀行月均價在上述事件月份並未出現一致方向的變動（例如 2019 年 3–7 月因 Veronica 與 Vale 潰壩同時發生而上漲；2023 年 4 月 Ilsa 期間則因中國需求轉弱而下跌）。氣旋屬於**短期供給衝擊**，價格方向仍主要由中國鋼鐵需求、巴西等其他供給、港口庫存等因素主導。

---

## 四、查證限制（誠實揭露）

1. **REQ 2026 年 9 月號 PDF**：industry.gov.au 伺服器拒絕本環境的自動下載，因此「2031 年實質約 US$64/t」是透過 Kallanish 與多個轉述來源交叉確認，而非直接讀取 PDF 表格。轉述來源對 2026 年平均價（US$88 或 US$91）說法不一，**本片因此不引用 2026 年預測值**，只用各來源一致的 2031 年數字。
2. **氣旋路徑**：動畫中的氣旋移動路徑為**示意**（畫面已標註），並非 BoM 最佳路徑資料。
3. **1952 年發現**：此為 Lang Hancock 本人的說法，故旁白使用「自述」。
4. **百分比**：「約三成八」為 USGS 兩個估計值相除（980/2,600），由本片計算。
5. **原有 repo 的 `src/App.jsx` 數據**未標示來源，且部分數值（如 2026 年月價）與世界銀行數據不符，本片**完全未使用**。

---

## 五、製作資訊

- 旁白：Microsoft Edge 神經語音「中文（台灣）曉臻 HsiaoChen」（台灣女聲），逐句生成後實測秒數排時間軸。
- 配樂、音效：Python 程式原創合成（Karplus-Strong 撥弦吉他、長笛、鋪底和聲、刷鼓；風、雨、雷、鳥鳴、火車、汽笛等），旁白出現時音樂自動壓低約 8 dB。整體響度 -15.0 LUFS（整合），真峰值 -1.2 dBTP。
- 畫面：SVG 程式繪製（無 AI 生圖），Chromium 逐格渲染，1920×1080、30 fps。
