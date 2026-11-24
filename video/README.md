# 鐵礦石動畫短片《紅土上的鋼鐵脈動》

手繪線稿風格動畫（SVG 程式繪製），主題：鐵礦石的歷史、澳洲皮爾巴拉產地、2013–2026 價格波動、熱帶氣旋對產區與港口的影響、未來展望。

## 成品（`output/`）
| 檔案 | 說明 |
|---|---|
| `ironore_story.mp4` | 1920×1080、30 fps、H.264 + AAC，約 2 分 46 秒；中英雙語字幕已燒入 |
| `ironore_story.srt` | 中英雙語字幕檔（中文在上、英文在下） |
| `sources.md` | 逐句旁白對應來源、完整網址、氣旋事件整理表、查證限制 |
| `screenshots/` | 各場景抽幀截圖與 QA 總覽 |

## 製作流程（全部可重現）
```bash
cd video
npm install                       # 字型：霞鶩文楷 TC（@fontsource/lxgw-wenkai-tc）
pip install edge-tts numpy scipy soundfile pyloudnorm openpyxl playwright
python3 tts.py                    # 1. 逐句生成旁白（zh-TW-HsiaoChenNeural，台灣女聲）並量測秒數
python3 timeline.py               # 2. 依實測秒數排出每個場景長度 → build/timeline.json + .srt
python3 make_data.py              # 3. 把時間軸與世界銀行月價寫進 anim/data.js
python3 render.py video 4         # 4. Chromium 逐格渲染（每格字型就緒＋兩次繪製後才擷取）
python3 audio.py                  # 5. 原創配樂＋音效＋旁白混音，自動壓低音樂，-15 LUFS
# 6. 合併影音 → output/ironore_story.mp4
python3 qa.py                     # 7. 逐格檢查（空白／破圖／異常跳動）並輸出各場景截圖
```

## 檔案結構
- `script.json` — 25 句旁白（中文、字幕版、英文、來源編號）
- `anim/` — `lib.js`（手繪抖動、邊畫邊出現的線條）、`components.js`（火車、船、卡車、高爐、氣旋、地圖等可重用元件）、`scenes.js`（10 個場景）、`main.js`（紙張紋理、轉場、字幕）
- `data/worldbank_pinksheet_iron_ore_monthly_2013_2026.csv` — 價格曲線原始數據
