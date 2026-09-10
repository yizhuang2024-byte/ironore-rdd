// 前端邏輯：連結解析、下載排程、SSE 進度、資料夾選擇、外觀設定
const $ = (id) => document.getElementById(id)
const api = async (path, options) => {
  const res = await fetch(path, {
    headers: options?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `請求失敗（${res.status}）`)
  return data
}

let state = { config: null, platforms: [], jobs: new Map() }

/* ── 平台判斷（與後端同一份規則） ────────────────────────── */
const PLATFORM_HOSTS = {
  youtube: /(?:^|\.)(?:youtube\.com|youtu\.be|youtube-nocookie\.com)$/i,
  instagram: /(?:^|\.)instagram\.com$/i,
  twitter: /(?:^|\.)(?:twitter\.com|x\.com)$/i,
  bilibili: /(?:^|\.)(?:bilibili\.com|b23\.tv)$/i,
  tiktok: /(?:^|\.)(?:tiktok\.com|douyin\.com)$/i,
  threads: /(?:^|\.)(?:threads\.net|threads\.com)$/i,
}

function detectIds(text) {
  const found = new Set()
  for (const line of text.split(/[\s\n]+/)) {
    if (!line.trim()) continue
    try {
      const host = new URL(line.trim()).hostname
      for (const [id, re] of Object.entries(PLATFORM_HOSTS)) if (re.test(host)) found.add(id)
    } catch {
      /* 忽略還沒打完的文字 */
    }
  }
  return found
}

function renderPlatforms() {
  const active = detectIds($('urlInput').value)
  $('platformRow').innerHTML = state.platforms
    .map((p) => `<span class="plat${active.has(p.id) ? ' active' : ''}">${p.name}</span>`)
    .join('')
}

/* ── 下載工作卡片 ─────────────────────────────────────────── */
const STATE_TEXT = {
  running: '下載中',
  merging: '合併影音中',
  done: '完成',
  error: '失敗',
  cancelled: '已取消',
}

function jobCard(job) {
  const el = document.createElement('div')
  el.className = 'job'
  el.id = `job-${job.id}`
  el.innerHTML = `
    <div class="job-head">
      <div>
        <div class="job-title" data-title>${escapeHtml(job.title || '讀取影片資訊中…')}</div>
        <div class="job-meta" data-meta></div>
      </div>
      <div class="job-state" data-state></div>
    </div>
    <div class="bar"><i data-bar></i></div>
    <div class="job-actions" data-actions></div>`
  return el
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

function paintJob(job) {
  let el = $(`job-${job.id}`)
  if (!el) {
    el = jobCard(job)
    const list = $('jobList')
    if (list.querySelector('.empty')) list.innerHTML = ''
    list.prepend(el)
  }
  el.querySelector('[data-title]').textContent = job.title || job.url
  el.querySelector('[data-bar]').style.width = `${job.percent || 0}%`

  const clean = (v) => (v && v !== 'NA' && !/^-+$/.test(v) ? v.trim() : '')
  const speed = clean(job.speed)
  const eta = clean(job.eta)
  const stateEl = el.querySelector('[data-state]')
  stateEl.className = `job-state state-${job.status}`
  stateEl.textContent =
    job.status === 'running'
      ? `${(job.percent || 0).toFixed(1)}%${speed ? ` · ${speed}` : ''}${eta ? ` · 剩 ${eta}` : ''}`
      : STATE_TEXT[job.status] || job.status

  const meta = [`${job.platform || ''} · ${job.quality}P`]
  if (job.file) meta.push(job.file)
  else if (job.error) meta.push(`錯誤：${job.error}`)
  else meta.push(job.url)
  el.querySelector('[data-meta]').textContent = meta.filter(Boolean).join('　|　')

  const actions = el.querySelector('[data-actions]')
  actions.innerHTML = ''
  if (job.status === 'running' || job.status === 'merging') {
    const btn = document.createElement('button')
    btn.className = 'btn'
    btn.textContent = '取消'
    btn.onclick = () => api(`/api/cancel/${job.id}`, { method: 'POST' }).catch(alertErr)
    actions.append(btn)
  } else if (job.status === 'done') {
    const btn = document.createElement('button')
    btn.className = 'btn'
    btn.textContent = '開啟資料夾'
    btn.onclick = () => api('/api/open-folder', { method: 'POST' }).catch(alertErr)
    actions.append(btn)
  } else if (job.status === 'error') {
    const btn = document.createElement('button')
    btn.className = 'btn'
    btn.textContent = '重試'
    btn.onclick = () => submit(job.url, job.quality)
    actions.append(btn)
  }
}

function follow(job) {
  state.jobs.set(job.id, job)
  paintJob(job)
  if (job.status !== 'running' && job.status !== 'merging') return

  const es = new EventSource(`/api/events/${job.id}`)
  es.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    const current = state.jobs.get(job.id)
    if (!current) return
    if (msg.type === 'progress') Object.assign(current, msg, { status: current.status === 'merging' ? 'merging' : 'running' })
    else if (msg.type === 'title') current.title = msg.title
    else if (msg.type === 'file') current.file = msg.file
    else if (msg.type === 'status') current.status = msg.status
    else if (msg.type === 'snapshot') Object.assign(current, msg.job)
    else if (msg.type === 'done') {
      Object.assign(current, msg.job)
      es.close()
    }
    paintJob(current)
  }
  es.onerror = () => es.close()
}

const alertErr = (e) => alert(e.message || String(e))

/* ── 動作 ─────────────────────────────────────────────────── */
async function submit(url, quality) {
  const btn = $('downloadBtn')
  btn.disabled = true
  try {
    const { jobs } = await api('/api/download', {
      method: 'POST',
      body: JSON.stringify({ url, quality }),
    })
    jobs.forEach(follow)
  } catch (e) {
    alertErr(e)
  } finally {
    btn.disabled = false
  }
}

async function saveConfig(patch) {
  state.config = await api('/api/config', { method: 'POST', body: JSON.stringify(patch) })
  return state.config
}

function renderRecent() {
  $('recentDirs').innerHTML = (state.config.recentDirs || [])
    .map((d) => `<button type="button" data-dir="${escapeHtml(d)}">${escapeHtml(d)}</button>`)
    .join('')
}

/* ── 資料夾選擇器 ─────────────────────────────────────────── */
let browsePath = ''

async function openBrowser(start) {
  try {
    const data = await api(`/api/browse?path=${encodeURIComponent(start || $('dirInput').value || '')}`)
    browsePath = data.path
    $('browserPath').textContent = data.path
    $('browserUp').disabled = !data.parent
    $('browserUp').dataset.parent = data.parent || ''
    $('browserHome').dataset.home = data.home
    $('browserList').innerHTML = data.entries.length
      ? data.entries.map((e) => `<button type="button" data-path="${escapeHtml(e.path)}">📁 ${escapeHtml(e.name)}</button>`).join('')
      : '<p class="hint" style="padding:12px">這個資料夾底下沒有子資料夾。</p>'
    $('browser').hidden = false
  } catch (e) {
    alertErr(e)
  }
}

/* ── 角色底圖 ─────────────────────────────────────────────── */
const FALLBACK_MOTIFS = [
  // 原創大正風剪影：市松羽織
  `<svg viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="#2a72b0" stroke-width="2.2" stroke-linejoin="round"><circle cx="50" cy="28" r="16"/><path d="M50 44 L22 62 L14 120 L86 120 L78 62 Z"/><path d="M50 44 L50 120"/></g><g fill="#3b8fd4" opacity="0.45"><rect x="24" y="70" width="13" height="13"/><rect x="37" y="83" width="13" height="13"/><rect x="63" y="70" width="13" height="13"/><rect x="50" y="83" width="13" height="13"/></g></svg>`,
  // 炎紋羽織
  `<svg viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="#2a72b0" stroke-width="2.2" stroke-linejoin="round"><circle cx="50" cy="28" r="16"/><path d="M50 44 L22 62 L14 120 L86 120 L78 62 Z"/></g><path d="M22 118 q8-26 14-10 q5-24 14-6 q6-20 14-2 q7-16 14 18 z" fill="#3b8fd4" opacity="0.4"/></svg>`,
  // 麻葉紋羽織
  `<svg viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="#2a72b0" stroke-width="2.2" stroke-linejoin="round"><circle cx="50" cy="28" r="16"/><path d="M50 44 L22 62 L14 120 L86 120 L78 62 Z"/></g><g fill="none" stroke="#3b8fd4" stroke-width="1.6" opacity="0.55"><path d="M50 66 L70 78 L70 102 L50 114 L30 102 L30 78 Z"/><path d="M50 66 L50 114 M30 78 L70 102 M70 78 L30 102"/></g></svg>`,
  // 水波紋羽織
  `<svg viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="#2a72b0" stroke-width="2.2" stroke-linejoin="round"><circle cx="50" cy="28" r="16"/><path d="M50 44 L22 62 L14 120 L86 120 L78 62 Z"/></g><g fill="none" stroke="#3b8fd4" stroke-width="1.8" opacity="0.5"><path d="M20 82 q15-12 30 0 t30 0"/><path d="M20 96 q15-12 30 0 t30 0"/><path d="M20 110 q15-12 30 0 t30 0"/></g></svg>`,
  // 日輪紋
  `<svg viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="#2a72b0" stroke-width="2" opacity="0.8"><circle cx="50" cy="70" r="26"/><circle cx="50" cy="70" r="38" stroke-dasharray="5 9"/></g><path d="M50 44 v52 M24 70 h52" stroke="#3b8fd4" stroke-width="1.6" opacity="0.5"/></svg>`,
  // 蝶紋
  `<svg viewBox="0 0 100 140" xmlns="http://www.w3.org/2000/svg"><g fill="#3b8fd4" opacity="0.4"><path d="M50 70 q-26-30-34-6 q-6 22 34 16z"/><path d="M50 70 q26-30 34-6 q6 22-34 16z"/></g><g fill="none" stroke="#2a72b0" stroke-width="2"><path d="M50 56 v34"/><path d="M50 56 q-6-10-12-12 M50 56 q6-10 12-12"/></g></svg>`,
]

async function renderCharacters() {
  const layer = $('charLayer')
  const enabled = state.config.characterEnabled !== false
  layer.classList.toggle('off', !enabled)
  document.documentElement.style.setProperty('--char-opacity', state.config.characterOpacity ?? 0.5)
  if (!enabled) return

  let files = []
  try {
    files = (await api('/api/characters')).files
  } catch {
    files = []
  }

  // 依視窗大小算出要鋪幾格，讓底圖填滿整個畫面
  const cell = window.innerWidth < 520 ? 128 : 188
  const count = Math.ceil(window.innerWidth / cell) * Math.ceil(window.innerHeight / cell)
  const source = files.length ? files : FALLBACK_MOTIFS
  layer.innerHTML = Array.from({ length: count }, (_, i) => {
    const item = source[i % source.length]
    return files.length ? `<img src="${item}" alt="" loading="lazy" />` : item
  }).join('')
}

/* ── 初始化 ───────────────────────────────────────────────── */
async function init() {
  const status = await api('/api/status')
  state.config = status.config
  state.platforms = status.platforms

  $('toolStatus').innerHTML = [
    status.tools.ytdlp.ok
      ? `<span class="pill pill-ok">yt-dlp ${escapeHtml(status.tools.ytdlp.version)}</span>`
      : '<span class="pill pill-bad">未安裝 yt-dlp</span>',
    status.tools.ffmpeg.ok
      ? '<span class="pill pill-ok">ffmpeg 就緒</span>'
      : '<span class="pill pill-bad">未安裝 ffmpeg（1080P 需要）</span>',
  ].join('')

  $('dirInput').value = state.config.downloadDir
  document.querySelector(`input[name="quality"][value="${state.config.quality}"]`)?.click()
  $('cookieSelect').value = state.config.cookiesFromBrowser || ''
  $('charToggle').checked = state.config.characterEnabled !== false
  const op = Math.round((state.config.characterOpacity ?? 0.5) * 100)
  $('opacityRange').value = op
  $('opacityValue').textContent = `${op}%`

  renderPlatforms()
  renderRecent()
  renderCharacters()

  const { jobs } = await api('/api/jobs')
  jobs.forEach(follow)
}

/* ── 事件綁定 ─────────────────────────────────────────────── */
$('urlInput').addEventListener('input', renderPlatforms)

$('downloadBtn').addEventListener('click', () => {
  const url = $('urlInput').value.trim()
  if (!url) return alert('請先貼上影片連結')
  const quality = document.querySelector('input[name="quality"]:checked').value
  submit(url, quality)
})

document.querySelectorAll('input[name="quality"]').forEach((el) =>
  el.addEventListener('change', () => saveConfig({ quality: el.value }).catch(alertErr))
)

$('saveDirBtn').addEventListener('click', async () => {
  try {
    await saveConfig({ downloadDir: $('dirInput').value })
    $('dirInput').value = state.config.downloadDir
    renderRecent()
    $('saveDirBtn').textContent = '已儲存 ✓'
    setTimeout(() => ($('saveDirBtn').textContent = '儲存位置'), 1600)
  } catch (e) {
    alertErr(e)
  }
})

$('openDirBtn').addEventListener('click', () => api('/api/open-folder', { method: 'POST' }).catch(alertErr))
$('browseBtn').addEventListener('click', () => openBrowser())
$('browserClose').addEventListener('click', () => ($('browser').hidden = true))
$('browser').addEventListener('click', (e) => {
  if (e.target.id === 'browser') $('browser').hidden = true
})
$('browserUp').addEventListener('click', (e) => e.currentTarget.dataset.parent && openBrowser(e.currentTarget.dataset.parent))
$('browserHome').addEventListener('click', (e) => openBrowser(e.currentTarget.dataset.home))
$('browserList').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-path]')
  if (btn) openBrowser(btn.dataset.path)
})
$('browserPick').addEventListener('click', async () => {
  try {
    await saveConfig({ downloadDir: browsePath })
    $('dirInput').value = state.config.downloadDir
    renderRecent()
    $('browser').hidden = true
  } catch (e) {
    alertErr(e)
  }
})

$('recentDirs').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-dir]')
  if (!btn) return
  try {
    await saveConfig({ downloadDir: btn.dataset.dir })
    $('dirInput').value = state.config.downloadDir
    renderRecent()
  } catch (err) {
    alertErr(err)
  }
})

$('clearBtn').addEventListener('click', async () => {
  await api('/api/clear-finished', { method: 'POST' }).catch(alertErr)
  state.jobs.forEach((job, id) => {
    if (job.status !== 'running' && job.status !== 'merging') {
      $(`job-${id}`)?.remove()
      state.jobs.delete(id)
    }
  })
  if (!$('jobList').children.length) $('jobList').innerHTML = '<p class="empty">還沒有下載工作。</p>'
})

$('charToggle').addEventListener('change', async (e) => {
  await saveConfig({ characterEnabled: e.target.checked }).catch(alertErr)
  renderCharacters()
})

$('opacityRange').addEventListener('input', (e) => {
  const v = Number(e.target.value)
  $('opacityValue').textContent = `${v}%`
  document.documentElement.style.setProperty('--char-opacity', v / 100)
})
$('opacityRange').addEventListener('change', (e) =>
  saveConfig({ characterOpacity: Number(e.target.value) / 100 }).catch(alertErr)
)

$('cookieSelect').addEventListener('change', (e) => saveConfig({ cookiesFromBrowser: e.target.value }).catch(alertErr))

let resizeTimer
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(renderCharacters, 250)
})

init().catch((e) => {
  document.body.insertAdjacentHTML('afterbegin', `<p style="padding:16px;color:#c9483f">初始化失敗：${escapeHtml(e.message)}</p>`)
})
