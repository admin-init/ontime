/**
 * 录制一段页面（默认：录制自检页），转成 H.264 30fps，并输出参数报告。
 *
 * 用法：
 *   node video/tools/record-page.mjs
 *   $env:CAPTURE_URL="http://127.0.0.1:5173/"; $env:CAPTURE_SECONDS="15"; node video/tools/record-page.mjs
 *   $env:CAPTURE_URL="http://127.0.0.1:5173/events/xxx"; $env:CAPTURE_NAME="event-detail"; node video/tools/record-page.mjs
 *
 * 输出：
 *   recordings/_selftest/<name>.mp4
 *   recordings/_selftest/<name>.report.json
 *
 * 说明：
 * - 优先使用 video/ 本地安装的 playwright；没有则复用参考工程 S:\Sarah\ASUS\baoyan-demo\node_modules。
 * - Playwright 自带的录屏是 webm（通常 25fps），这里统一转 30fps CFR。
 * - 如果要真实 30fps 桌面捕获，用 FFMPEG.md 里的 gdigrab 命令。
 */

import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const ROOT = path.resolve(HERE, '..', '..')
const OUT_DIR = path.join(ROOT, 'recordings', '_selftest')
const RAW_DIR = path.join(OUT_DIR, 'raw')

const SECONDS = Number(process.env.CAPTURE_SECONDS || 12)
const WARMUP = Number(process.env.CAPTURE_WARMUP || 1.5)
const NAME = process.env.CAPTURE_NAME || 'selftest'
const URL_TO_OPEN =
  process.env.CAPTURE_URL || pathToFileURL(path.join(HERE, 'test-page.html')).href
const CHROME =
  process.env.CHROME_PATH ||
  'C:\\Users\\stellarz\\AppData\\Local\\ms-playwright\\chromium-1254\\chrome-win64\\chrome.exe'

const requireLocal = createRequire(import.meta.url)
let chromium
try {
  ;({ chromium } = requireLocal('playwright'))
} catch {
  const requireRef = createRequire('file:///S:/Sarah/ASUS/baoyan-demo/package.json')
  ;({ chromium } = requireRef('playwright'))
}

function run(bin, args, opts = {}) {
  return execFileSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts })
}

function probe(file) {
  const raw = run('ffprobe', [
    '-v', 'error',
    '-count_frames',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,width,height,r_frame_rate,avg_frame_rate,nb_frames,nb_read_frames,duration:format=duration,size',
    '-of', 'json',
    file,
  ])
  const data = JSON.parse(raw)
  const s = data.streams?.[0] || {}
  const f = data.format || {}
  return {
    codec: s.codec_name || null,
    width: s.width || null,
    height: s.height || null,
    r_frame_rate: s.r_frame_rate || null,
    avg_frame_rate: s.avg_frame_rate || null,
    nb_frames: s.nb_frames ? Number(s.nb_frames) : null,
    nb_read_frames: s.nb_read_frames ? Number(s.nb_read_frames) : null,
    duration: f.duration ? Number(f.duration) : null,
    size: f.size ? Number(f.size) : null,
  }
}

function newestWebm(dir) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.webm'))
    .map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
  return files.length ? path.join(dir, files[0].f) : null
}

fs.mkdirSync(RAW_DIR, { recursive: true })

console.log(`▶ 录制 ${URL_TO_OPEN}`)
console.log(`  视口 1440×900 · ${SECONDS}s · 输出 ${NAME}.mp4`)

const browser = await chromium.launch({
  headless: true,
  executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
  args: ['--force-device-scale-factor=1', '--hide-scrollbars'],
})

const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
  recordVideo: { dir: RAW_DIR, size: { width: 1440, height: 900 } },
})

const page = await context.newPage()
const video = page.video()

try {
  await page.goto(URL_TO_OPEN, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForTimeout(WARMUP * 1000)
  await page.waitForTimeout(SECONDS * 1000)
} finally {
  await context.close()
  await browser.close()
}

let webm
try {
  webm = video ? await video.path() : null
} catch {
  webm = null
}
if (!webm || !fs.existsSync(webm)) webm = newestWebm(RAW_DIR)
if (!webm) throw new Error('没有找到 Playwright 录制的 webm')

const mp4 = path.join(OUT_DIR, `${NAME}.mp4`)
execFileSync(
  'ffmpeg',
  [
    '-y',
    '-i', webm,
    '-vf', 'fps=30,format=yuv420p',
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '18',
    '-movflags', '+faststart',
    mp4,
  ],
  { stdio: 'ignore' },
)

const src = probe(webm)
const out = probe(mp4)
const expected = out.duration ? Math.round(out.duration * 30) : null
const report = {
  capturedAt: new Date().toISOString(),
  url: URL_TO_OPEN,
  viewport: '1440x900',
  requestedSeconds: SECONDS,
  source: { file: webm, ...src },
  output: { file: mp4, ...out },
  expectedFrames30: expected,
  frameDelta: expected && out.nb_read_frames ? out.nb_read_frames - expected : null,
}

fs.writeFileSync(
  path.join(OUT_DIR, `${NAME}.report.json`),
  JSON.stringify(report, null, 2),
)

console.log('')
console.log('✓ 完成')
console.log(`  源文件   ${path.relative(ROOT, webm)}`)
console.log(`  成片     ${path.relative(ROOT, mp4)}`)
console.log(`  分辨率   ${out.width}×${out.height}`)
console.log(`  帧率     ${out.r_frame_rate}（源 ${src.r_frame_rate}）`)
console.log(`  时长     ${out.duration?.toFixed(3)}s`)
console.log(`  帧数     ${out.nb_read_frames}（30fps 期望 ${expected}，差 ${report.frameDelta}）`)
console.log(`  体积     ${(out.size / 1024 / 1024).toFixed(2)} MB`)
console.log(`  报告     ${path.relative(ROOT, path.join(OUT_DIR, `${NAME}.report.json`))}`)
