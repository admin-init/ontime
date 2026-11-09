/**
 * 完整试片录制：按主控给出的 9 步流程，分段录真实界面。
 *
 * 前置：5173 + 8000 已启动，模型可用，UNNC 素材存在。
 * 用法：node video/tools/record-trial.mjs
 *
 * 产物：recordings/_trial/01-....mp4 ... 09-....mp4
 *      recordings/_trial/report.json
 *      recordings/_trial/state.json
 */

import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const requireRef = createRequire('file:///S:/Sarah/ASUS/baoyan-demo/package.json')
const { chromium } = requireRef('playwright')

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const ROOT = path.resolve(HERE, '..', '..')
const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173'
const OUT = path.join(ROOT, 'recordings', '_trial')
const RAW = path.join(OUT, 'raw')
const DOWNLOADS = path.join(OUT, 'downloads')
const NOTICE = path.join(ROOT, 'fixtures', 'demo', 'unnc_notice.png')
const CHAT = path.join(ROOT, 'fixtures', 'demo', 'unnc_chat.png')
const OFFICIAL_URL =
  'https://www.nottingham.edu.cn/cn/events/event-details.aspx?id=04a1e20c-c3a3-4971-a962-4b4f7fde9123&language=zh'

const CHROME =
  process.env.CHROME_PATH ||
  'C:\\Users\\stellarz\\AppData\\Local\\ms-playwright\\chromium-1254\\chrome-win64\\chrome.exe'

fs.mkdirSync(RAW, { recursive: true })
fs.mkdirSync(DOWNLOADS, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const now = () => Date.now()

async function waitText(page, texts, timeout = 180000) {
  const start = now()
  while (now() - start < timeout) {
    for (const t of texts) {
      const loc = page.getByText(t, { exact: false }).first()
      if (await loc.isVisible().catch(() => false)) return t
    }
    await sleep(400)
  }
  throw new Error(`等待文本超时：${texts.join(' / ')}`)
}

function probe(file) {
  const raw = execFileSync(
    'ffprobe',
    [
      '-v', 'error',
      '-count_frames',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=codec_name,width,height,r_frame_rate,avg_frame_rate,nb_frames,nb_read_frames,duration:format=duration,size',
      '-of', 'json',
      file,
    ],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const d = JSON.parse(raw)
  const s = d.streams?.[0] || {}
  const f = d.format || {}
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

function convert(webm, mp4) {
  execFileSync(
    'ffmpeg',
    [
      '-y', '-i', webm,
      '-vf', 'fps=30,format=yuv420p',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '18',
      '-movflags', '+faststart',
      mp4,
    ],
    { stdio: 'ignore' },
  )
}

const browser = await chromium.launch({
  headless: true,
  executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
  args: ['--force-device-scale-factor=1', '--hide-scrollbars'],
})

const results = []
const state = { base: BASE, startedAt: new Date().toISOString(), eventId: null, segments: [] }

async function segment(id, title, fn) {
  const dir = path.join(RAW, id)
  fs.mkdirSync(dir, { recursive: true })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    acceptDownloads: true,
    recordVideo: { dir, size: { width: 1440, height: 900 } },
  })
  const page = await context.newPage()
  const video = page.video()
  const t0 = now()
  const marks = []
  const mark = (label, extra = {}) => {
    const atSec = Number(((now() - t0) / 1000).toFixed(2))
    marks.push({ label, atSec, ...extra })
    console.log(`    ${String(atSec).padStart(6)}s  ${label}`)
  }

  console.log(`\n▶ ${id} · ${title}`)
  let failure = null
  try {
    await fn(page, mark)
  } catch (e) {
    failure = e
    mark(`ERROR: ${e.message}`)
    console.error(`  ✗ ${e.message}`)
  } finally {
    await context.close()
  }

  let webm = null
  try {
    webm = video ? await video.path() : null
  } catch {
    webm = null
  }
  if (!webm || !fs.existsSync(webm)) webm = newestWebm(dir)
  if (!webm) throw new Error(`${id}: 没有找到 webm`)

  const mp4 = path.join(OUT, `${id}.mp4`)
  convert(webm, mp4)
  const src = probe(webm)
  const out = probe(mp4)
  const result = {
    id,
    title,
    file: path.relative(ROOT, mp4),
    source: path.relative(ROOT, webm),
    elapsedSec: Number(((now() - t0) / 1000).toFixed(2)),
    durationSec: out.duration,
    width: out.width,
    height: out.height,
    fps: out.r_frame_rate,
    frames: out.nb_read_frames,
    sourceFps: src.r_frame_rate,
    sizeMB: out.size ? Number((out.size / 1024 / 1024).toFixed(2)) : null,
    marks,
  }
  results.push(result)
  state.segments.push({ id, title, file: result.file, durationSec: result.durationSec, marks })
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ ...state, segments: results }, null, 2))
  console.log(`  ✓ ${result.file}  ${result.durationSec?.toFixed(1)}s  ${result.sizeMB} MB`)
  if (failure) throw failure
  return result
}

let eventId = null

try {
  await segment('01-reset', '设置 → 演示重置', async (page, mark) => {
    await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)
    mark('设置页')
    await page.getByRole('button', { name: '重置演示数据' }).click()
    mark('点重置')
    await page.getByRole('button', { name: '确认清空' }).click()
    mark('确认清空')
    await waitText(page, ['已重置，当前数据为空。'], 30000)
    mark('重置完成')
    await page.waitForTimeout(1000)
  })

  await segment('02-notice-ingest', '收录 unnc_notice.png', async (page, mark) => {
    await page.goto(`${BASE}/capture`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)
    mark('收录页')
    await page.locator('input[type=file]').setInputFiles(NOTICE)
    mark('选择通知截图')
    await waitText(page, ['正在处理'], 20000)
    mark('四步进度开始')
    const t = now()
    await page.waitForURL('**/inbox', { timeout: 240000 })
    mark('自动进入收件箱', { ingestSec: Number(((now() - t) / 1000).toFixed(1)) })
    await page.waitForTimeout(1500)
    await waitText(page, ['候选事件'], 15000)
    mark('候选卡可见')
    await page.locator('.candidate-item').first().scrollIntoViewIfNeeded()
    await page.waitForTimeout(1500)
  })

  await segment('03-confirm-detail', '确认事件 → 详情', async (page, mark) => {
    await page.goto(`${BASE}/inbox`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    await waitText(page, ['候选事件'], 15000)
    await page.getByRole('link', { name: '先看详情' }).first().click()
    mark('打开候选详情')
    await page.waitForURL(/\/events\//, { timeout: 30000 })
    eventId = new URL(page.url()).pathname.split('/').pop()
    state.eventId = eventId
    mark(`事件详情 ${eventId}`)
    await page.waitForTimeout(1000)
    const confirm = page.getByRole('button', { name: '确认事件' })
    if (await confirm.count()) {
      await confirm.click()
      mark('点确认事件')
      await page.waitForTimeout(1500)
    }
    await waitText(page, ['已确认'], 20000)
    mark('事件已确认')
    await page.locator('.detail-head').scrollIntoViewIfNeeded()
    await page.waitForTimeout(1200)
  })

  await segment('04-fields-source', '字段 / 截止 / 报名链接 / 来源', async (page, mark) => {
    await page.goto(`${BASE}/events/${eventId}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    mark('事件详情')
    const timeRow = page.locator('.field-row').filter({ hasText: '活动时间' }).first()
    await timeRow.locator('.field-head').click()
    mark('展开活动时间出处')
    await timeRow.scrollIntoViewIfNeeded()
    await page.waitForTimeout(1500)
    const locRow = page.locator('.field-row').filter({ hasText: '地点' }).first()
    await locRow.locator('.field-head').click()
    mark('展开地点出处')
    await locRow.scrollIntoViewIfNeeded()
    await page.waitForTimeout(1200)
    const task = page.locator('.task-item').filter({ hasText: '登录链接完成注册' }).first()
    if (await task.count()) {
      await task.scrollIntoViewIfNeeded()
      await task.getByRole('button', { name: '出处' }).click()
      mark('展开任务截止/报名链接出处')
      await page.waitForTimeout(1500)
    }
    await page.getByText('任务清单').first().scrollIntoViewIfNeeded()
    await page.waitForTimeout(1000)
  })

  await segment('05-chat-ingest', '收录 unnc_chat.png', async (page, mark) => {
    await page.goto(`${BASE}/capture`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1200)
    mark('收录页')
    await page.locator('input[type=file]').setInputFiles(CHAT)
    mark('选择群聊截图')
    await waitText(page, ['正在处理'], 20000)
    mark('四步进度开始')
    const t = now()
    await page.waitForURL('**/inbox', { timeout: 240000 })
    mark('自动进入收件箱', { ingestSec: Number(((now() - t) / 1000).toFixed(1)) })
    await page.waitForTimeout(1500)
    await waitText(page, ['合并建议'], 20000)
    mark('合并建议可见')
    await page.locator('.merge-item').first().scrollIntoViewIfNeeded()
    await page.waitForTimeout(1500)
  })

  await segment('06-merge-conflict', '合并建议 → 接受 → 地点冲突', async (page, mark) => {
    await page.goto(`${BASE}/inbox`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    await waitText(page, ['合并建议'], 20000)
    const merge = page.locator('.merge-item').first()
    await merge.scrollIntoViewIfNeeded()
    mark('合并建议与 diff')
    await page.waitForTimeout(1500)
    await page.getByRole('button', { name: '合并为同一事件' }).click()
    mark('接受合并')
    await page.waitForTimeout(1800)
    await page.goto(`${BASE}/events/${eventId}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    const firstOpen = page.locator('.field-row.is-open').first()
    if (await firstOpen.count()) {
      await firstOpen.locator('.field-head').click()
      await page.waitForTimeout(500)
    }
    const locRow = page.locator('.field-row').filter({ hasText: '地点' }).first()
    await locRow.scrollIntoViewIfNeeded()
    await locRow.locator('.field-head').click()
    mark('展开地点冲突')
    await page.waitForTimeout(1500)
    const keep = page.getByRole('button', { name: '保留', exact: true })
    if (await keep.count()) {
      await keep.scrollIntoViewIfNeeded()
      await keep.click()
      mark('保留两种说法')
      await page.waitForTimeout(1200)
    }
  })

  await segment('07-verify-search', '联网核实（搜索，真实 not_found）', async (page, mark) => {
    await page.goto(`${BASE}/events/${eventId}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    const section = page.locator('section.block').filter({ hasText: '联网核实' }).first()
    await section.scrollIntoViewIfNeeded()
    mark('滚动到联网核实')
    await page.getByRole('button', { name: '联网核实', exact: true }).first().click()
    mark('点联网核实')
    const t = now()
    const result = await waitText(
      page,
      ['未找到明确适用的官方依据', '找到可对照的官方内容', '核实结果与当前记录存在冲突'],
      180000,
    )
    mark(`核实结果：${result}`, { verifySec: Number(((now() - t) / 1000).toFixed(1)) })
    await page.waitForTimeout(1500)
    const pages = page.getByText('查看了这些页面').first()
    if (await pages.count()) await pages.scrollIntoViewIfNeeded()
    await page.waitForTimeout(1800)
  })

  await segment('08-link-verify-apply-export', '链接核对 → 补充写入 → 导出 ics', async (page, mark) => {
    await page.goto(`${BASE}/events/${eventId}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    const section = page.locator('section.block').filter({ hasText: '联网核实' }).first()
    await section.scrollIntoViewIfNeeded()
    await page.getByRole('button', { name: '联网核实', exact: true }).first().click()
    mark('先跑一次搜索')
    await waitText(
      page,
      ['未找到明确适用的官方依据', '找到可对照的官方内容', '核实结果与当前记录存在冲突'],
      180000,
    )
    mark('搜索结果出现')
    await page.waitForTimeout(1200)
    const urlInput = page.locator('input[type=url]').first()
    await urlInput.waitFor({ state: 'visible', timeout: 30000 })
    await urlInput.fill(OFFICIAL_URL)
    mark('粘贴官方链接')
    await page.getByRole('button', { name: '核对这个链接' }).click()
    mark('点核对链接')
    const t = now()
    const result = await waitText(
      page,
      ['找到可对照的官方内容', '核实结果与当前记录存在冲突', '未找到明确适用的官方依据'],
      180000,
    )
    mark(`链接核对结果：${result}`, { linkSec: Number(((now() - t) / 1000).toFixed(1)) })
    await page.waitForTimeout(1800)
    const findings = await page.locator('.finding').count()
    mark(`findings=${findings}`)
    const apply = page.getByRole('button', { name: '作为补充写入' }).first()
    if (await apply.count()) {
      await apply.scrollIntoViewIfNeeded()
      await apply.click()
      mark('作为补充写入')
      await page.waitForTimeout(2000)
    } else {
      mark('没有可写入的 finding')
    }
    const dl = page.waitForEvent('download', { timeout: 30000 }).catch(() => null)
    await page.getByRole('link', { name: '导出日历' }).click()
    const download = await dl
    if (download) {
      const file = path.join(DOWNLOADS, download.suggestedFilename())
      await download.saveAs(file)
      mark(`下载 ics：${path.basename(file)}`)
    } else {
      mark('没有捕获到下载事件')
    }
    await page.waitForTimeout(1200)
  })

  await segment('09-action-final', '行动台勾选 → 来源 / 历史', async (page, mark) => {
    await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1500)
    mark('行动台')
    const checkbox = page.locator('input[type=checkbox]').first()
    if (await checkbox.count()) {
      await checkbox.click()
      mark('勾选一项任务')
      await page.waitForTimeout(1200)
    }
    await page.locator('.event-row').first().click()
    await page.waitForTimeout(1500)
    mark('打开事件详情')
    const src = page.getByText('来源', { exact: true }).first()
    if (await src.count()) await src.scrollIntoViewIfNeeded()
    await page.waitForTimeout(1000)
    const hist = page.getByText('历史', { exact: true }).first()
    if (await hist.count()) await hist.scrollIntoViewIfNeeded()
    await page.waitForTimeout(1500)
  })
} finally {
  await browser.close()
  fs.writeFileSync(path.join(OUT, 'state.json'), JSON.stringify(state, null, 2))
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ ...state, segments: results }, null, 2))
  console.log('\n===== 试片汇总 =====')
  for (const r of results) {
    console.log(`${r.id}\t${r.durationSec?.toFixed(1)}s\t${r.sizeMB} MB\t${r.fps}\t${r.frames} frames\t${r.file}`)
    for (const m of r.marks) {
      if (m.ingestSec || m.verifySec || m.linkSec) {
        console.log(`  · ${m.label}${m.ingestSec ? ` (${m.ingestSec}s)` : ''}${m.verifySec ? ` (${m.verifySec}s)` : ''}${m.linkSec ? ` (${m.linkSec}s)` : ''}`)
      }
    }
  }
  console.log(`报告：${path.relative(ROOT, path.join(OUT, 'report.json'))}`)
}
