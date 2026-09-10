# 影片下載器（多平台 · MP4 · 720P–1080P）

貼上連結就能下載的本機網頁工具，支援 **YouTube / Instagram / X (Twitter) / Bilibili / TikTok / Threads**（其他 yt-dlp 支援的網站也能用）。
淡藍色大正風介面，背景可鋪滿你自備的角色圖並調整透明度（預設 50%）。

## 一、安裝需要的兩個工具

| 工具 | 用途 | 安裝方式 |
| --- | --- | --- |
| **yt-dlp** | 實際抓取影片 | macOS：`brew install yt-dlp`　Windows：`winget install yt-dlp.yt-dlp`　通用：`pipx install yt-dlp` |
| **ffmpeg** | 合併 1080P 的影音軌 | macOS：`brew install ffmpeg`　Windows：`winget install Gyan.FFmpeg`　Ubuntu：`sudo apt install ffmpeg` |

另外需要 **Node.js 18 以上**（本工具零外部套件，不必 `npm install`）。

## 二、啟動

```bash
cd video-downloader
node server.mjs
```

看到 `http://127.0.0.1:8787` 後，用瀏覽器打開即可。要換連接埠：`PORT=9000 node server.mjs`。

> 伺服器只綁定 `127.0.0.1`，僅本機可存取，不會對外開放你的檔案系統。

## 三、使用方式

1. **貼上連結** — 一行一個可一次排入多部（單次上限 20 個），上方會亮起對應平台。
2. **選畫質** — `1080P`（上限）或 `720P`。畫質下限為 720P；若原片根本沒有 720P 以上，會自動退回該片可用的最佳畫質，而不是直接失敗。輸出一律為 MP4。
3. **設定儲存位置** — 直接輸入路徑後按「儲存位置」，或按「瀏覽資料夾…」用點選的方式挑；最近用過的位置會列成快捷鍵。設定寫在 `video-downloader/config.json`，下次啟動仍然有效。
4. **開始下載** — 每個工作有即時進度、速度、剩餘時間，可隨時取消；完成後按「開啟資料夾」直接跳到檔案位置。

### 需要登入才看得到的內容

Instagram、Threads、部分 X 貼文需要登入。到「外觀與進階設定 → 登入用 Cookie 來源瀏覽器」選一個**你已登入該網站**的瀏覽器，yt-dlp 會借用該瀏覽器的 cookie（`--cookies-from-browser`）。

## 四、換成自己的角色圖

把圖片放進 `video-downloader/public/characters/`（png / jpg / webp / svg…），重新整理網頁即會滿版鋪排。
透明度與開關在「外觀與進階設定」中調整。**未放圖時**使用內建的原創大正風紋樣（市松格、炎紋、麻葉紋、水波紋、日輪、蝶紋）。

本專案不內含任何有版權的官方動漫角色美術，請自行確認放入圖片的使用權。

## 五、注意事項

- 請只下載你擁有版權、已獲授權，或授權條款允許下載的內容，並遵守各平台服務條款。
- 下載失敗多半是 yt-dlp 版本過舊（平台常改介面），先執行 `yt-dlp -U` 或重新安裝最新版。
- 缺少 ffmpeg 時，1080P 的影音軌無法合併，畫質會被迫降級。

## 檔案結構

```
video-downloader/
├── server.mjs              本機伺服器（零相依）：設定、下載排程、SSE 進度、資料夾瀏覽
├── config.json             執行後自動產生的設定檔（已被 .gitignore 忽略）
└── public/
    ├── index.html          介面
    ├── styles.css          淡藍色主題與滿版底圖樣式
    ├── app.js              前端邏輯
    ├── favicon.svg
    └── characters/         放你自己的角色圖
```
