# 每日多平台內容自動化流程規劃書

> 目標：以 opencode 作為 Agent，每日自動生成 IG / Threads / YouTube / Podcast / Meta(Facebook) 所需的圖文、影片、音檔，經人工審核通過後自動發布到各平台。未來擴充 TikTok / 抖音。

---

## 0. 關鍵前提：NotebookLM 沒有公開 API

這是整個架構最重要的一個現實限制：

- **NotebookLM（consumer 版）目前沒有官方公開 API**，無法用程式直接呼叫它生成語音摘要（Audio Overview）或內容。
- 若硬要自動化 NotebookLM，只能用瀏覽器自動化（Playwright 模擬點擊），但這種做法**脆弱（UI 一改就壞）、可能違反 Google 服務條款、無法穩定跑每日排程**，不建議作為正式管線。
- **官方替代方案**：NotebookLM 底層就是 Gemini。用 **Gemini API** 生成內容 + **Gemini TTS（多講者語音）** 就能做出與 NotebookLM「雙人對談 Podcast」幾乎相同的效果，而且完全可程式化、可排程。

> 結論：**「NotebookLM 的效果」用 Gemini API 重現，而不是自動化 NotebookLM 本身。** NotebookLM 可保留作為你手動研究、確認內容品質的輔助工具。

---

## 1. 整體架構

```
┌──────────────────────────────────────────────────────────────┐
│  ① 每日觸發 (Cron)                                            │
│     GitHub Actions schedule / n8n cron / VPS crontab          │
└──────────────┬───────────────────────────────────────────────┘
               ▼
┌──────────────────────────────────────────────────────────────┐
│  ② 內容生成層 — opencode agent (opencode run 非互動模式)      │
│                                                              │
│   素材來源 → LLM 生成：                                       │
│   ├─ 文字腳本/貼文文案  : Gemini API 或 Claude API            │
│   ├─ 圖片 (IG/FB 圖卡)  : Imagen API / 模板 + Satori/Canvas   │
│   ├─ 音檔 (Podcast)     : Gemini TTS 多講者（NotebookLM 效果）│
│   └─ 影片 (YT/Reels)    : Remotion 或 FFmpeg（音檔+字幕+視覺）│
│                                                              │
│   輸出 → content/YYYY-MM-DD/ 目錄，開一個 GitHub PR           │
└──────────────┬───────────────────────────────────────────────┘
               ▼
┌──────────────────────────────────────────────────────────────┐
│  ③ 人工審核層（Human-in-the-loop）                            │
│     方案 A：GitHub PR — 你在手機/電腦上看 PR 預覽，合併=通過   │
│     方案 B：n8n 送 Telegram/LINE 預覽 + 「核准/退回」按鈕      │
└──────────────┬───────────────────────────────────────────────┘
               ▼ (核准後)
┌──────────────────────────────────────────────────────────────┐
│  ④ 發布層 — 各平台官方 API                                    │
│   ├─ Instagram : Instagram Graph API（圖片、Reels）           │
│   ├─ Threads   : Threads API（文字、圖、影片）                │
│   ├─ Facebook  : Meta Pages API                               │
│   ├─ YouTube   : YouTube Data API v3 (videos.insert)          │
│   ├─ Podcast   : 託管商 API (Transistor/Firstory) → RSS       │
│   │              → Spotify / Apple Podcasts 自動抓取           │
│   └─ (未來) TikTok : Content Posting API；抖音: 抖音開放平台   │
└──────────────┬───────────────────────────────────────────────┘
               ▼
┌──────────────────────────────────────────────────────────────┐
│  ⑤ 記錄與通知：發布結果寫回 repo / 通知你成功或失敗            │
└──────────────────────────────────────────────────────────────┘
```

---

## 2. 各環節詳細設計

### 2.1 觸發（每日排程）

| 選項 | 適合情境 | 備註 |
|------|---------|------|
| **GitHub Actions `schedule`** | 你已用 GitHub，零成本起步 | cron 語法，免費額度夠每日跑 |
| n8n（自架或雲端） | 想要視覺化流程 + 審核按鈕 | 自架免費，雲端約 US$20/月起 |
| VPS crontab | 已有主機 | 最簡單但要自己管 |

**建議起步：GitHub Actions**，因為 opencode 可直接在 Actions runner 裡以 `opencode run "指令"` 非互動執行，生成結果直接 commit 成 PR，審核流程也天然內建（PR review）。

### 2.2 內容生成（opencode agent）

opencode 支援：

- `opencode run "<prompt>"`：非互動模式，適合 CI/cron 呼叫
- 自訂 agent（`.opencode/agent/*.md`）與指令（`.opencode/command/*.md`）
- MCP servers：可掛上自訂工具（例如「發布到 IG」的 MCP tool）

建議在 repo 建立以下結構：

```
.opencode/
  agent/
    content-writer.md      # 文案 agent：產各平台版本的貼文
    script-writer.md       # Podcast/影片腳本 agent（雙人對談格式）
  command/
    daily-content.md       # /daily-content：跑完整生成流程
pipeline/
  generate/
    text.ts                # 呼叫 LLM 產文案（每平台一版）
    image.ts               # 圖卡生成（模板渲染或 Imagen）
    audio.ts               # Gemini TTS 多講者 → mp3
    video.ts               # Remotion/FFmpeg 合成影片
  publish/
    instagram.ts           # IG Graph API
    threads.ts             # Threads API
    facebook.ts            # Pages API
    youtube.ts             # YouTube Data API
    podcast.ts             # 託管商 API 上傳
content/
  2026-07-10/
    topic.md               # 當日主題與素材來源
    ig-caption.txt
    threads-post.txt
    fb-post.txt
    yt-title-desc.md
    podcast-script.md
    podcast.mp3
    video.mp4
    card-01.png
    manifest.json          # 各平台發布設定（排程時間、hashtags）
```

#### 各媒材的生成方式

| 媒材 | 推薦做法 | 替代方案 |
|------|---------|---------|
| **貼文文案** | Gemini / Claude API，一次生成各平台調性版本（IG 短+hashtag、Threads 口語、FB 較長、YT 標題+描述） | — |
| **圖卡** | HTML/CSS 模板 + [Satori](https://github.com/vercel/satori) 或 Playwright 截圖 → 品牌一致、零成本 | Imagen / gpt-image 生成插圖 |
| **Podcast 音檔** | **Gemini 2.5 TTS multi-speaker**：把雙人對談腳本直接轉成兩個聲音的對話，效果即 NotebookLM Audio Overview | ElevenLabs（音質更好、較貴）；NotebookLM 手動生成後下載（半自動） |
| **影片** | **Remotion**（React 寫影片，跟你現有 React 技術棧相同）：音檔 + 動態字幕 + 圖卡 → YT 影片與 IG Reels 直式版 | FFmpeg 拼接（簡單波形影片）；HeyGen/Creatomate（付費 SaaS） |

> 💡 一魚多吃策略：每天只生成「一份核心內容」（一篇腳本），再由 agent 衍生成各平台格式 —— Podcast 音檔 → 加字幕變 YT 影片 → 剪 60 秒精華變 Reels/Threads 影片 → 金句變 IG 圖卡。這樣成本與審核負擔都最低。

### 2.3 人工審核（關鍵環節）

**方案 A：GitHub PR 審核（推薦起步）**

1. 每日 Action 跑完，開一個 PR：`content: 2026-07-10 每日內容`
2. PR 描述內嵌圖片預覽、文案全文、音檔/影片連結（artifact）
3. 你在 GitHub App（手機也行）看過 → **Merge = 核准**
4. merge 觸發第二個 workflow：讀 `manifest.json` 依序發布
5. 退回：直接在 PR 留言修改意見 → opencode agent 讀留言重新生成（可用 GitHub Actions + `opencode run` 實現「留言即修稿」）

**方案 B：n8n + Telegram/LINE 按鈕**

1. n8n 生成後把預覽傳到 Telegram
2. 訊息帶「✅ 發布 / ❌ 退回 / ✏️ 修改」按鈕
3. 按下 ✅ → n8n 繼續執行發布節點

方案 A 的好處：版本控制、修改留痕、與 opencode 天然整合；方案 B 的好處：手機體驗更順。兩者可並存（n8n 只做通知，核准仍走 PR merge）。

### 2.4 發布層 — 各平台 API 現況

| 平台 | API | 前置條件 | 注意事項 |
|------|-----|---------|---------|
| **Instagram** | Instagram Graph API（Content Publishing） | IG 帳號須為**商業帳號或創作者帳號**，並連結一個 Facebook 粉專；建 Meta 開發者 App | 支援單圖、輪播、Reels；每帳號 24 小時內 API 發文上限 ~50 則（遠夠用）；圖片/影片須先放在公開 URL |
| **Threads** | Threads API（2024 起官方開放） | Meta 開發者 App + Threads 帳號授權 | 支援文字、圖片、影片、輪播；流程同 IG（先建 container 再 publish） |
| **Facebook** | Pages API | 粉絲專頁 + Page access token | 個人檔案不能 API 發文，**只能發到粉專** |
| **YouTube** | YouTube Data API v3 `videos.insert` | Google Cloud 專案 + OAuth | ⚠️ 兩個大坑：① 未通過 Google 稽核（audit）的 App，API 上傳的影片會被鎖成**私人**；② 每次上傳耗 1600 quota units，預設每日 10,000 units ≈ 6 支/天。個人自用可申請稽核，通過後即正常 |
| **Podcast** | 不直接對 Spotify/Apple 發布，而是：**上傳到託管商 → 託管商產 RSS → 各平台自動抓** | 選一家有 API 的託管商 | 推薦：**Firstory**（台灣、中文介面、免費方案、有 API）、Transistor（API 完善、US$19/月）、Buzzsprout（有 API）。Spotify/Apple 只需一次性提交 RSS，之後全自動 |
| **TikTok（國際版）** | Content Posting API | TikTok 開發者 App，**須通過審核**才能直接公開發布（未審核只能存草稿） | 審核需展示完整產品，個人專案可先用「上傳到收件匣（草稿）」模式 |
| **抖音（中國版）** | 抖音開放平台（字節跳動） | 需中國主體/企業認證，門檻高 | 與 TikTok 完全分開的體系；若無中國公司主體，實務上多用半自動（生成後手動發） |

#### Meta 系（IG/Threads/FB）共同前置作業

1. 到 [developers.facebook.com](https://developers.facebook.com) 建立一個 App
2. IG 轉為商業/創作者帳號，綁定粉專
3. 申請權限：`instagram_content_publish`、`pages_manage_posts`、Threads 相關 scope
4. 用 Graph API Explorer 取得長效 token（60 天），寫個小 script 定期自動換發（refresh），token 存 GitHub Secrets

### 2.5 Podcast 頻道設立（你還沒有的部分）

一次性設定，約 1 小時：

1. 註冊託管商（建議 **Firstory** 或 **Transistor**，兩者都有 API）
2. 上傳頻道封面（3000×3000）、頻道描述、選分類
3. 取得 RSS feed URL
4. 到 Spotify for Creators、Apple Podcasts Connect、YouTube Music 各提交一次 RSS
5. 之後管線只要呼叫託管商 API 上傳 mp3，所有平台自動更新

---

## 3. 分階段實作路線圖

不要一次做完，每一階段都能獨立產生價值：

### Phase 1 — 文字 + 圖卡（1~2 週）✦ 建議先做
- GitHub Actions 每日排程 → opencode 生成文案 + 圖卡 → 開 PR
- 審核：PR merge
- 發布：Threads API + IG Graph API + FB Pages API
- **這階段就能驗證整條「生成 → 審核 → 發布」骨幹**

### Phase 2 — Podcast（1~2 週）
- 設立 Podcast 頻道（託管商 + RSS 提交）
- Gemini TTS 多講者生成對談音檔
- 發布：託管商 API

### Phase 3 — 影片（2~3 週）
- Remotion 模板：音檔 + 字幕 + 品牌視覺 → 橫式（YT）+ 直式（Reels）
- YouTube API 接入（先申請 audit）、IG Reels 發布

### Phase 4 — TikTok 與優化
- TikTok Content Posting API 申請
- 數據回收（各平台 insights API）→ 讓 agent 依表現調整選題

---

## 4. 成本估算（每日一集規模）

| 項目 | 月成本（估） |
|------|------------|
| Gemini API（文案+腳本） | ~US$1–5（量小） |
| Gemini TTS 音檔（每日 10 分鐘） | ~US$5–15 |
| 圖卡（模板渲染） | $0 |
| Remotion 渲染（GitHub Actions 免費額度內） | $0–5 |
| Podcast 託管 | $0（Firstory 免費方案）~ US$19（Transistor） |
| GitHub Actions | 免費額度通常夠 |
| n8n（若選用，自架） | $0 + VPS 約 US$5 |
| **合計** | **約 US$10–50/月** |

（若改用 ElevenLabs 語音或 HeyGen 影片，成本會顯著上升。）

---

## 5. 安全與維運注意事項

- **所有 token 存 GitHub Secrets**（或 n8n credentials），絕不進 repo
- Meta 長效 token 60 天過期 → 排程自動 refresh + 過期前通知
- 每個平台的發布 script 要**冪等**（記錄已發布 ID，避免重跑重複發文）
- 發布失敗要通知（Telegram/email），不要靜默失敗
- 各平台 API 條款都禁止 spam；保持「每日一組、經人工審核」的頻率是安全的
- 保留「手動發布」逃生門：任何平台 API 掛掉時，審核過的素材都在 `content/` 目錄裡，可直接拿去手動發

---

## 6. 下一步

若要開始 Phase 1，具體待辦：

- [ ] Meta 開發者 App 建立 + IG 轉商業帳號 + 權限申請
- [ ] 建立 `pipeline/` 目錄與第一版生成 script（文案 + 圖卡）
- [ ] 建立 `.github/workflows/daily-generate.yml`（排程 → opencode run → 開 PR）
- [ ] 建立 `.github/workflows/publish-on-merge.yml`（merge → 發布）
- [ ] 決定每日內容的素材來源（RSS？網站數據？固定主題清單？）
