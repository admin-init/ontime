/** 补录：展开「报名」任务的出处，确认 `this Friday` / 待确认在真实界面里的样子。 */
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const requireRef = createRequire('file:///S:/Sarah/ASUS/baoyan-demo/package.json')
const { chromium } = requireRef('playwright')

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const ROOT = path.resolve(HERE, '..', '..')
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173'
const EVENT_ID = process.env.EVENT_ID || '61d54b6313fc4ae99885a16d30876be4'
const OUT = path.join(ROOT, 'recordings', '_trial')
const DIR = path.join(OUT, 'raw', '04b-task-pending')
fs.mkdirSync(DIR, { recursive: true })

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:\\Users\\stellarz\\AppData\\Local\\ms-playwright\\chromium-1254\\chrome-win64\\chrome.exe',
})
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  locale: 'zh-CN',
  timezoneId: 'Asia/Shanghai',
  recordVideo: { dir: DIR, size: { width: 1440, height: 900 } },
})
const page = await context.newPage()
const video = page.video()

await page.goto(`${BASE}/events/${EVENT_ID}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
const task = page.locator('.task-item').filter({ hasText: '报名' }).first()
await task.scrollIntoViewIfNeeded()
await task.getByRole('button', { name: '出处' }).click()
await page.waitForTimeout(1200)
const dueRow = task.locator('.field-row').filter({ hasText: '截止时间' }).first()
if (await dueRow.count()) {
  await dueRow.locator('.field-head').click()
  await page.waitForTimeout(1000)
}
await dueRow.scrollIntoViewIfNeeded()
await page.waitForTimeout(2500)
await context.close()
await browser.close()

const webm = await video.path()
const mp4 = path.join(OUT, '04b-task-pending.mp4')
execFileSync('ffmpeg', ['-y', '-i', webm, '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-movflags', '+faststart', mp4], { stdio: 'ignore' })
console.log(mp4)
