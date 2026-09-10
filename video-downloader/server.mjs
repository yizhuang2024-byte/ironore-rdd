#!/usr/bin/env node
// 多平台影片下載器 — 本機伺服器（零外部相依，只需 Node.js 18+）
// 實際下載工作交給 yt-dlp，合併 1080p 影音需要 ffmpeg。

import http from 'node:http'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawn, execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.join(__dirname, 'public')
const CHARACTER_DIR = path.join(PUBLIC_DIR, 'characters')
const CONFIG_FILE = path.join(__dirname, 'config.json')
const PORT = Number(process.env.PORT) || 8787
const HOST = '127.0.0.1' // 只在本機開放，不對外曝露檔案系統

// ---------------------------------------------------------------- 設定檔

const DEFAULT_CONFIG = {
  downloadDir: path.join(os.homedir(), 'Downloads', 'VideoDownloader'),
  recentDirs: [],
  quality: '1080',
  cookiesFromBrowser: '',
  characterOpacity: 0.5,
  characterEnabled: true,
}

function loadConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2))
}

let config = loadConfig()

// ---------------------------------------------------------------- 平台判定

const PLATFORMS = [
  { id: 'youtube', name: 'YouTube', test: /(?:^|\.)(?:youtube\.com|youtu\.be|youtube-nocookie\.com)$/i },
  { id: 'instagram', name: 'Instagram', test: /(?:^|\.)instagram\.com$/i },
  { id: 'twitter', name: 'X / Twitter', test: /(?:^|\.)(?:twitter\.com|x\.com)$/i },
  { id: 'bilibili', name: 'Bilibili', test: /(?:^|\.)(?:bilibili\.com|b23\.tv)$/i },
  { id: 'tiktok', name: 'TikTok', test: /(?:^|\.)(?:tiktok\.com|douyin\.com)$/i },
  { id: 'threads', name: 'Threads', test: /(?:^|\.)(?:threads\.net|threads\.com)$/i },
]

function detectPlatform(rawUrl) {
  let host
  try {
    const u = new URL(rawUrl.trim())
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
    host = u.hostname
  } catch {
    return null
  }
  return PLATFORMS.find((p) => p.test.test(host)) || { id: 'other', name: '其他網站' }
}

// ---------------------------------------------------------------- 工具偵測

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 15000 }, (err, stdout) => {
      resolve(err ? null : String(stdout).trim())
    })
  })
}

async function toolStatus() {
  const [ytdlp, ffmpeg] = await Promise.all([run('yt-dlp', ['--version']), run('ffmpeg', ['-version'])])
  return {
    ytdlp: ytdlp ? { ok: true, version: ytdlp } : { ok: false },
    ffmpeg: ffmpeg ? { ok: true, version: ffmpeg.split('\n')[0] } : { ok: false },
  }
}

// ---------------------------------------------------------------- 下載工作

/** jobId -> { id, url, platform, quality, status, percent, speed, eta, title, file, error, log[], proc, subs:Set } */
const jobs = new Map()

function formatArgs(quality) {
  // 上限 1080p、下限 720p：先要 720–1080 之間的最佳畫質，
  // 若該影片根本沒有 720p 以上，再退回可取得的最佳畫質，避免直接失敗。
  const cap = quality === '720' ? 720 : 1080
  return [
    '-S',
    `res:${cap},ext:mp4:m4a`,
    '-f',
    `bv*[height<=${cap}][height>=720]+ba/b[height<=${cap}][height>=720]/bv*[height<=${cap}]+ba/b[height<=${cap}]/bv*+ba/b`,
    '--merge-output-format',
    'mp4',
  ]
}

function emit(job, event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`
  for (const res of job.subs) res.write(payload)
}

function snapshot(job) {
  const { proc, subs, log, ...rest } = job
  return { ...rest, log: log.slice(-40) }
}

async function startJob({ url, quality }) {
  const platform = detectPlatform(url)
  if (!platform) throw new Error('不是有效的 http/https 連結')

  await fsp.mkdir(config.downloadDir, { recursive: true })

  const job = {
    id: randomUUID(),
    url: url.trim(),
    platform: platform.name,
    platformId: platform.id,
    quality,
    dir: config.downloadDir,
    status: 'running',
    percent: 0,
    speed: '',
    eta: '',
    title: '',
    file: '',
    error: '',
    startedAt: Date.now(),
    log: [],
    subs: new Set(),
  }

  const args = [
    ...formatArgs(quality),
    '--newline',
    '--no-playlist',
    '--restrict-filenames',
    '--no-warnings',
    '--progress',
    '--progress-template',
    'download:@@PROG@@%(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s',
    '--print',
    'before_dl:@@TITLE@@%(title)s',
    '--print',
    'after_move:@@FILE@@%(filepath)s',
    '-o',
    path.join(config.downloadDir, '%(title).120s [%(id)s].%(ext)s'),
  ]
  if (config.cookiesFromBrowser) args.push('--cookies-from-browser', config.cookiesFromBrowser)
  args.push('--', job.url)

  let proc
  try {
    proc = spawn('yt-dlp', args)
  } catch {
    job.status = 'error'
    job.error = '找不到 yt-dlp，請先安裝（見 README）'
    jobs.set(job.id, job)
    return job
  }
  job.proc = proc
  jobs.set(job.id, job)

  const handleLine = (line) => {
    const text = line.trimEnd()
    if (!text) return

    if (text.startsWith('@@PROG@@')) {
      const [pct, speed, eta] = text.slice(8).split('|')
      const num = parseFloat(String(pct).replace('%', '').trim())
      if (!Number.isNaN(num)) job.percent = num
      job.speed = (speed || '').trim()
      job.eta = (eta || '').trim()
      emit(job, { type: 'progress', percent: job.percent, speed: job.speed, eta: job.eta })
      return
    }
    if (text.startsWith('@@TITLE@@')) {
      job.title = text.slice(9).trim()
      emit(job, { type: 'title', title: job.title })
      return
    }
    if (text.startsWith('@@FILE@@')) {
      job.file = text.slice(8).trim()
      emit(job, { type: 'file', file: job.file })
      return
    }
    if (/^\[Merger\]|^\[ffmpeg\]/.test(text)) {
      job.status = 'merging'
      emit(job, { type: 'status', status: 'merging' })
    }
    job.log.push(text)
    if (job.log.length > 200) job.log.shift()
    emit(job, { type: 'log', line: text })
  }

  const attach = (stream) => {
    let buf = ''
    stream.setEncoding('utf8')
    stream.on('data', (chunk) => {
      buf += chunk
      const parts = buf.split(/\r?\n/)
      buf = parts.pop() ?? ''
      parts.forEach(handleLine)
    })
    stream.on('end', () => buf && handleLine(buf))
  }
  attach(proc.stdout)
  attach(proc.stderr)

  proc.on('error', () => {
    job.status = 'error'
    job.error = '無法執行 yt-dlp，請確認已安裝並在 PATH 中'
    emit(job, { type: 'done', job: snapshot(job) })
    job.subs.forEach((r) => r.end())
    job.subs.clear()
  })

  proc.on('close', (code) => {
    if (job.status === 'cancelled' || job.status === 'error') {
      // 保留取消 / 啟動失敗（spawn error）時已寫入的狀態與訊息
    } else if (code === 0) {
      job.status = 'done'
      job.percent = 100
    } else {
      job.status = 'error'
      const tail = job.log.filter((l) => /error/i.test(l)).slice(-1)[0]
      job.error = tail || `yt-dlp 結束碼 ${code}`
    }
    job.finishedAt = Date.now()
    job.proc = null
    emit(job, { type: 'done', job: snapshot(job) })
    job.subs.forEach((r) => r.end())
    job.subs.clear()
  })

  return job
}

// ---------------------------------------------------------------- HTTP 小工具

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
}

function sendJson(res, code, data) {
  const body = JSON.stringify(data)
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (c) => {
      raw += c
      if (raw.length > 1e6) reject(new Error('body too large'))
    })
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        reject(new Error('JSON 格式錯誤'))
      }
    })
  })
}

async function serveStatic(req, res, urlPath) {
  const rel = urlPath === '/' ? 'index.html' : decodeURIComponent(urlPath).replace(/^\/+/, '')
  const target = path.join(PUBLIC_DIR, rel)
  if (!target.startsWith(PUBLIC_DIR + path.sep) && target !== path.join(PUBLIC_DIR, 'index.html')) {
    res.writeHead(403).end('Forbidden')
    return
  }
  try {
    const stat = await fsp.stat(target)
    if (!stat.isFile()) throw new Error('not a file')
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    })
    fs.createReadStream(target).pipe(res)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 Not Found')
  }
}

function openInFileManager(dir) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open'
  try {
    spawn(cmd, [dir], { detached: true, stdio: 'ignore' }).unref()
    return true
  } catch {
    return false
  }
}

// ---------------------------------------------------------------- 路由

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${HOST}:${PORT}`)
  const p = url.pathname

  try {
    if (req.method === 'GET' && p === '/api/status') {
      return sendJson(res, 200, {
        tools: await toolStatus(),
        platforms: PLATFORMS.map(({ id, name }) => ({ id, name })),
        config,
      })
    }

    if (req.method === 'GET' && p === '/api/config') return sendJson(res, 200, config)

    if (req.method === 'POST' && p === '/api/config') {
      const body = await readBody(req)
      const next = { ...config }

      if (typeof body.downloadDir === 'string' && body.downloadDir.trim()) {
        let dir = body.downloadDir.trim()
        if (dir.startsWith('~')) dir = path.join(os.homedir(), dir.slice(1))
        dir = path.resolve(dir)
        try {
          await fsp.mkdir(dir, { recursive: true })
          await fsp.access(dir, fs.constants.W_OK)
        } catch {
          return sendJson(res, 400, { error: `無法建立或寫入資料夾：${dir}` })
        }
        next.downloadDir = dir
        next.recentDirs = [dir, ...config.recentDirs.filter((d) => d !== dir)].slice(0, 6)
      }
      if (body.quality === '1080' || body.quality === '720') next.quality = body.quality
      if (typeof body.cookiesFromBrowser === 'string') next.cookiesFromBrowser = body.cookiesFromBrowser
      if (typeof body.characterOpacity === 'number') {
        next.characterOpacity = Math.min(1, Math.max(0, body.characterOpacity))
      }
      if (typeof body.characterEnabled === 'boolean') next.characterEnabled = body.characterEnabled

      config = next
      saveConfig(config)
      return sendJson(res, 200, config)
    }

    // 簡易資料夾瀏覽器：列出某路徑下的子資料夾，讓使用者用點的選存放位置
    if (req.method === 'GET' && p === '/api/browse') {
      let dir = url.searchParams.get('path') || config.downloadDir
      if (dir.startsWith('~')) dir = path.join(os.homedir(), dir.slice(1))
      dir = path.resolve(dir)
      let entries = []
      try {
        entries = (await fsp.readdir(dir, { withFileTypes: true }))
          .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
          .map((e) => ({ name: e.name, path: path.join(dir, e.name) }))
          .sort((a, b) => a.name.localeCompare(b.name))
          .slice(0, 300)
      } catch {
        return sendJson(res, 400, { error: `無法讀取資料夾：${dir}` })
      }
      const parent = path.dirname(dir)
      return sendJson(res, 200, { path: dir, parent: parent === dir ? null : parent, home: os.homedir(), entries })
    }

    if (req.method === 'POST' && p === '/api/open-folder') {
      const ok = openInFileManager(config.downloadDir)
      return sendJson(res, ok ? 200 : 500, ok ? { ok: true } : { error: '無法開啟檔案總管' })
    }

    // 角色底圖：列出使用者自行放入 public/characters/ 的圖片
    if (req.method === 'GET' && p === '/api/characters') {
      let files = []
      try {
        files = (await fsp.readdir(CHARACTER_DIR))
          .filter((f) => /\.(png|jpe?g|webp|gif|svg|avif)$/i.test(f))
          .map((f) => `./characters/${encodeURIComponent(f)}`)
      } catch {
        files = []
      }
      return sendJson(res, 200, { files })
    }

    if (req.method === 'POST' && p === '/api/download') {
      const body = await readBody(req)
      const urls = String(body.url || '')
        .split(/[\n\s]+/)
        .map((s) => s.trim())
        .filter(Boolean)
      if (!urls.length) return sendJson(res, 400, { error: '請先貼上影片連結' })
      const quality = body.quality === '720' ? '720' : '1080'

      const created = []
      for (const one of urls.slice(0, 20)) {
        try {
          created.push(snapshot(await startJob({ url: one, quality })))
        } catch (e) {
          created.push({ id: randomUUID(), url: one, status: 'error', error: e.message, percent: 0, log: [] })
        }
      }
      return sendJson(res, 200, { jobs: created })
    }

    if (req.method === 'GET' && p === '/api/jobs') {
      return sendJson(res, 200, { jobs: [...jobs.values()].map(snapshot).sort((a, b) => b.startedAt - a.startedAt) })
    }

    if (req.method === 'GET' && p.startsWith('/api/events/')) {
      const job = jobs.get(p.slice('/api/events/'.length))
      if (!job) return sendJson(res, 404, { error: 'job not found' })
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })
      res.write(`data: ${JSON.stringify({ type: 'snapshot', job: snapshot(job) })}\n\n`)
      if (job.status === 'done' || job.status === 'error' || job.status === 'cancelled') return res.end()
      job.subs.add(res)
      req.on('close', () => job.subs.delete(res))
      return undefined
    }

    if (req.method === 'POST' && p.startsWith('/api/cancel/')) {
      const job = jobs.get(p.slice('/api/cancel/'.length))
      if (!job) return sendJson(res, 404, { error: 'job not found' })
      if (job.proc) {
        job.status = 'cancelled'
        job.proc.kill('SIGTERM')
      }
      return sendJson(res, 200, snapshot(job))
    }

    if (req.method === 'POST' && p === '/api/clear-finished') {
      for (const [id, job] of jobs) if (!job.proc) jobs.delete(id)
      return sendJson(res, 200, { ok: true })
    }

    if (req.method === 'GET') return serveStatic(req, res, p)
    return sendJson(res, 404, { error: 'not found' })
  } catch (e) {
    return sendJson(res, 500, { error: e.message || '伺服器錯誤' })
  }
})

server.listen(PORT, HOST, async () => {
  const tools = await toolStatus()
  console.log(`\n  ▸ 影片下載器已啟動： http://${HOST}:${PORT}`)
  console.log(`  ▸ 儲存位置：${config.downloadDir}`)
  console.log(`  ▸ yt-dlp：${tools.ytdlp.ok ? tools.ytdlp.version : '未安裝 ✗'}   ffmpeg：${tools.ffmpeg.ok ? '已安裝' : '未安裝 ✗'}`)
  if (!tools.ytdlp.ok || !tools.ffmpeg.ok) console.log('  ▸ 缺少工具時請先依 README 安裝，否則無法下載或合併 1080p。\n')
})
