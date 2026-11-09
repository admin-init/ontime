/**
 * 补录：事件详情页点击「导出日历」→ 出现「已导出日历」。
 *
 * 前置：5173（含已导出反馈修复的真实 App）+ 8000 已启动，演示事件已确认。
 * 用法：node video/tools/record-export-ics.mjs
 *
 * 产物：recordings/_export-ics/export-ics.mp4（1440x900 / 30fps）
 *      recordings/_export-ics/report.json
 */

import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const requireRef = createRequire('file:///S:/Sarah/ASUS/baoyan-demo/package.json')
const { chromium } = requireRef('playwright')

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const ROOT = path.resolve(HERE, '..', '..')
const OUT = path.join(ROOT, 'recordings', '_export-ics')
const RAW = path.join(OUT, 'raw')
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173'
const EVENT_ID =
  process.env.EVENT_ID || '770ecd672a974ec2812c84d7fd6dd06d'
const CHROME =
  process.env.CHROME_PATH ||
  'C:\\Users\\stellarz\\AppData\\Local\\ms-playwright\\chromium-1254\\chrome-win64\\chrome.exe'

fs.mkdirSync(RAW, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function probe(file) {
  const raw = execFileSync(
    'ffprobe',
    [
      '-v', 'error',
      '-count_frames',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name,width,height,r_frame_rate,nb_read_frames,duration:format=duration,size',
      '-of', 'json',
      file,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const d = JSON.parse(raw)
  const s = d.streams?.[0] || {}
  const f = d.format || {}
  return {
    width: s.width,
    height: s.height,
    fps: s.r_frame_rate,
    frames: s.nb_read_frames ? Number(s.nb_read_frames) : null,
    duration: f.duration ? Number(f.duration) : null,
    size: f.size ? Number(f.size) : null,
  }
}

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
  acceptDownloads: true,
  recordVideo: { dir: RAW, size: { width: 1440, height: 900 } },
})
const page = await context.newPage()
const video = page.video()
const t0 = Date.now()
const marks = []
const mark = (label) => {
  const at = Number(((Date.now() - t0) / 1000).toFixed(2))
  marks.push({ label, atSec: at })
  console.log(`${String(at).padStart(6)}s  ${label}`)
}

try {
  await page.goto(`${BASE}/events/${EVENT_ID}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.getByRole('link', { name: '导出日历' }).waitFor({ state: 'visible' })
  await page.waitForTimeout(900)
  mark('停在事件详情顶部')

  const dlPromise = page.waitForEvent('download', { timeout: 15000 }).catch(() => null)
  await page.getByRole('link', { name: '导出日历' }).click()
  mark('点击导出日历')
  const download = await dlPromise
  if (download) {
    const file = path.join(OUT, download.suggestedFilename())
    await download.saveAs(file)
    mark(`浏览器下载 ${download.suggestedFilename()}`)
  } else {
    mark('未捕获下载事件')
  }

  await page.locator('.export-feedback').waitFor({ state: 'visible', timeout: 5000 })
  mark('出现「已导出日历」')
  const feedback = await page.locator('.export-feedback').innerText()
  const box = await page.locator('.export-feedback').boundingBox()
  const btnBox = await page.getByRole('link', { name: '导出日历' }).boundingBox()
  console.log(`  feedback=${feedback} box=${JSON.stringify(box)} button=${JSON.stringify(btnBox)}`)
  await page.screenshot({ path: path.join(OUT, 'toast.png') })
  await page.waitForTimeout(2400)
  mark('反馈结束，停留')
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
if (!webm || !fs.existsSync(webm)) {
  const files = fs
    .readdirSync(RAW)
    .filter((f) => f.endsWith('.webm'))
    .map((f) => ({ f, t: fs.statSync(path.join(RAW, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)
  webm = files.length ? path.join(RAW, files[0].f) : null
}
if (!webm) throw new Error('没有找到 Playwright 录制的 webm')

const mp4 = path.join(OUT, 'export-ics.mp4')
execFileSync(
  'ffmpeg',
  ['-y', '-loglevel', 'error', '-i', webm, '-vf', 'fps=30,format=yuv420p', '-an',
   '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-movflags', '+faststart', mp4],
  { stdio: 'ignore' },
)

const report = {
  capturedAt: new Date().toISOString(),
  base: BASE,
  eventId: EVENT_ID,
  source: { file: path.relative(ROOT, webm), ...probe(webm) },
  output: { file: path.relative(ROOT, mp4), ...probe(mp4) },
  marks,
}
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2))
console.log('\n✓', path.relative(ROOT, mp4))
console.log(JSON.stringify(report.output))
