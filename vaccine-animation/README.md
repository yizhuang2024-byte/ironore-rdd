# 疫苗怎麼作用？ How Do Vaccines Work?

一支約 97 秒、10 個章節的中英雙語科普動畫（觀眾：一般大眾）。
所有插圖、動態與背景音樂都由程式原創生成，沒有使用任何有版權的角色或素材。

| 產出 | 檔案 |
| --- | --- |
| 互動網頁（播放、字幕切換、章節跳轉、角色卡片、旁白腳本） | `index.html` |
| 可下載影片（1920×1080、30fps、H.264 + AAC、字幕燒錄） | `dist/vaccine-how-it-works-1080p.mp4` |
| 中文旁白腳本 + 英文翻譯 | `script.json`（時間碼版本在 `timeline.json`） |
| 旁白 / 音樂 / 混音 | `audio/narration.mp3`、`audio/music.mp3`、`audio/mix.mp3` |
| QA 截圖（每章 3 張） | `shots/` |

## 本機播放互動網頁

```bash
cd vaccine-animation
npx http-server -p 8000   # 然後開 http://localhost:8000
```
（網頁用 `fetch` 讀 `timeline.json`，所以需要透過 http 開啟，不能直接雙擊檔案。
請用支援 Range 請求的伺服器（如 http-server、GitHub Pages）；Python 內建的 `http.server` 不支援，拖動進度或跳章節時聲音會回到開頭。）

## 製作流程（可重跑）

```bash
pip install sherpa-onnx soundfile numpy imageio-ffmpeg playwright pillow
python3 build/tts.py --speed 1.2        # 1. 逐句合成旁白 → audio/narration.wav + timeline.json
python3 build/music.py                  # 2. 原創配樂 + 旁白時自動閃避（ducking）→ audio/mix.*
python3 build/shots.py                  # 3. 每章截圖檢查 → shots/
python3 build/render_video.py           # 4. 逐格渲染 MP4 → dist/
```

- **字幕對齊**：每一句字幕單獨合成語音，再以固定停頓串接（子句 0.24 秒、句末 0.42 秒、章節間約 0.9 秒），
  所以字幕切換點剛好落在旁白的停頓上。
- **配樂**：A 小調、96 BPM（pad、琶音、低音、輕鼓），全部由 numpy 合成。旁白出現時音樂降到約 25%
  （0.12 秒壓下、0.6 秒回復），句子間短於 0.6 秒的空檔不回升，避免忽大忽小。
- **畫面**：`anim.js` 是純函數式的 canvas 渲染器，`render(ctx, t)` 只依賴時間 t，
  所以網頁播放與 MP4 逐格輸出的畫面完全相同。

## 關於 TTS 聲音

需求指定 Gemini TTS 或 Voai（台灣口音女聲、說故事語氣）。這次的製作環境沒有這兩個服務的 API 金鑰，
而且網路代理擋掉了其他雲端 TTS，所以目前的旁白是用**離線的 Kokoro 模型（sherpa-onnx）中文女聲**合成的。
它是標準國語口音，不是台灣口音。

換成 Gemini TTS 只要設定金鑰後重跑，時間軸、字幕、配樂、影片都會自動跟著新的旁白長度更新：

```bash
export GEMINI_API_KEY=...
python3 build/tts.py --engine gemini --voice Leda   # 提示詞已要求台灣口音、溫柔說故事語氣
python3 build/music.py && python3 build/render_video.py
```

Voai 的接口需要依照它的 API 文件，在 `build/tts.py` 裡加一個 engine class（輸入文字、回傳 24 kHz float 陣列即可）。

## 內容正確性說明

- 疫苗種類只舉減毒、不活化、蛋白質次單位、mRNA 四類，並以「一般不會引發疾病」措辭（減毒活疫苗對免疫力低下者仍有風險）。
- 第 8 章的反應曲線標示為「示意圖」，只表達「第二次反應更快、更強」的定性關係，沒有數值。
- 副作用只描述常見、輕微、通常幾天內消退的反應；片尾提醒「不是百分之百保證」並建議請教醫師或藥師。
