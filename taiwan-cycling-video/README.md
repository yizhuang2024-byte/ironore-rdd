# 轉動的島嶼：台灣自由車發展史（動畫）

- `台灣自由車發展史.mp4`：1920×1080、30fps，約 4 分鐘，台灣女聲旁白（zh-TW 曉臻）＋繁體中文字幕（燒錄在畫面上）
- `台灣自由車發展史.srt`：獨立字幕檔（繁體中文）

## 重新產生

```bash
pip install sherpa-onnx soundfile pillow
# 下載語音模型（Kokoro 多語模型，含中文女聲）
curl -LO https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/kokoro-multi-lang-v1_0.tar.bz2
tar xjf kokoro-multi-lang-v1_0.tar.bz2

python3 make_audio.py edge build                     # 台灣女聲（pip install edge-tts；需連線 speech.platform.bing.com）
# 或離線：python3 make_audio.py kokoro-multi-lang-v1_0 build
python3 render.py build 台灣自由車發展史.mp4          # 繪製動畫並合成影片＋SRT
```

- 修改旁白／字幕：編輯 `script.py`（每行為「字幕文字, 朗讀文字」）。
- 換聲音：修改 `make_audio.py` 的 `EDGE_VOICE`（例如 `zh-TW-HsiaoYuNeural`）。

## 資料來源
見 `script.py` 的 `SOURCES`（影片片尾亦有列出）。
