/** 临时巡检：点一次联网核实，确认结果面板与“链接核对”入口的真实 DOM。 */
import { createRequire } from 'node:module'

const requireRef = createRequire('file:///S:/Sarah/ASUS/baoyan-demo/package.json')
const { chromium } = requireRef('playwright')

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173'
const EVENT_ID = process.env.EVENT_ID
if (!EVENT_ID) throw new Error('need EVENT_ID')

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:\\Users\\stellarz\\AppData\\Local\\ms-playwright\\chromium-1254\\chrome-win64\\chrome.exe',
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })
await page.goto(`${BASE}/events/${EVENT_ID}`, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(2000)

const btn = page.getByRole('button', { name: '联网核实' }).first()
console.log('click verify:', await btn.count())
await btn.click()

const t0 = Date.now()
let result = 'timeout'
try {
  await Promise.race([
    page.getByText('未找到明确适用的官方依据').first().waitFor({ state: 'visible', timeout: 120000 }).then(() => (result = 'not_found')),
    page.getByText('找到可对照的官方内容').first().waitFor({ state: 'visible', timeout: 120000 }).then(() => (result = 'found')),
    page.getByText('核实结果与当前记录存在冲突').first().waitFor({ state: 'visible', timeout: 120000 }).then(() => (result = 'conflict')),
  ])
} catch {
  result = 'timeout'
}
console.log('result:', result, 'elapsed:', ((Date.now() - t0) / 1000).toFixed(1) + 's')

await page.waitForTimeout(800)
const info = await page.evaluate(() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim()
  return {
    text: clean(document.body.innerText).slice(-5000),
    inputs: [...document.querySelectorAll('input, textarea')].map((el) => ({
      type: el.getAttribute('type'),
      placeholder: el.getAttribute('placeholder'),
      aria: el.getAttribute('aria-label'),
      value: el.value,
    })),
    buttons: [...document.querySelectorAll('button, a.btn, a.text-btn')].map((el) => clean(el.innerText)).filter(Boolean),
  }
})
console.log(JSON.stringify(info, null, 2))
await browser.close()
