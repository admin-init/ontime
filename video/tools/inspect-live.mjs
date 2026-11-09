/** 临时巡检：打开真实前端，打印页面上的按钮、链接、输入框与关键文本。 */
import { createRequire } from 'node:module'

const requireRef = createRequire('file:///S:/Sarah/ASUS/baoyan-demo/package.json')
const { chromium } = requireRef('playwright')

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173'
const EVENT_ID = process.env.EVENT_ID || ''

const browser = await chromium.launch({
  headless: true,
  executablePath: 'C:\\Users\\stellarz\\AppData\\Local\\ms-playwright\\chromium-1254\\chrome-win64\\chrome.exe',
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' })

async function dump(path, label) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  const info = await page.evaluate(() => {
    const clean = (s) => (s || '').replace(/\s+/g, ' ').trim()
    return {
      title: document.title,
      text: clean(document.body.innerText).slice(0, 4000),
      buttons: [...document.querySelectorAll('button, a.btn, a.text-btn')].map((el) => clean(el.innerText)).filter(Boolean),
      links: [...document.querySelectorAll('a')].map((el) => clean(el.innerText)).filter(Boolean).slice(0, 40),
      inputs: [...document.querySelectorAll('input, textarea')].map((el) => ({
        tag: el.tagName.toLowerCase(),
        type: el.getAttribute('type'),
        placeholder: el.getAttribute('placeholder'),
        aria: el.getAttribute('aria-label'),
      })),
    }
  })
  console.log(`\n===== ${label} ${path} =====`)
  console.log(JSON.stringify(info, null, 2))
}

await dump('/', '行动台')
await dump('/settings', '设置')
await dump('/capture', '收录')
await dump('/inbox', '收件箱')
if (EVENT_ID) await dump(`/events/${EVENT_ID}`, '事件详情')

await browser.close()
