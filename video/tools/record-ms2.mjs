/**
 * Re-record the email import with a correct subject, then inbox/reminder,
 * and the Agent research with the real 5-entry result + write button.
 */
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const requireRef = createRequire('file:///S:/Sarah/ASUS/baoyan-demo/package.json');
const {chromium} = requireRef('playwright');
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(HERE, '..', '..');
const OUT = path.join(ROOT, 'recordings', '_multisource');
const RAW = path.join(OUT, 'raw');
const EML = path.join(ROOT, 'video', 'fixtures', 'unnc-lecture-reminder2.eml');
const CHROME =
  'C:\\Users\\stellarz\\AppData\\Local\\ms-playwright\\chromium-1254\\chrome-win64\\chrome.exe';
fs.mkdirSync(RAW, {recursive: true});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now();

function probe(file) {
  const raw = execFileSync('ffprobe', [
    '-v', 'error', '-count_frames', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height,r_frame_rate,nb_read_frames:format=duration,size',
    '-of', 'json', file,
  ], {encoding: 'utf8'});
  const d = JSON.parse(raw);
  const s = d.streams?.[0] || {};
  const f = d.format || {};
  return {width: s.width, height: s.height, fps: s.r_frame_rate, frames: s.nb_read_frames ? Number(s.nb_read_frames) : null, duration: f.duration ? Number(f.duration) : null, size: f.size ? Number(f.size) : null};
}
function newestWebm(dir) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.webm'))
    .map((f) => ({f, t: fs.statSync(path.join(dir, f)).mtimeMs}))
    .sort((a, b) => b.t - a.t);
  return files.length ? path.join(dir, files[0].f) : null;
}
function convert(webm, mp4) {
  execFileSync('ffmpeg', ['-y', '-i', webm, '-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-movflags', '+faststart', mp4], {stdio: 'ignore'});
}

const browser = await chromium.launch({
  headless: true,
  executablePath: fs.existsSync(CHROME) ? CHROME : undefined,
  args: ['--force-device-scale-factor=1', '--hide-scrollbars'],
});
const results = [];

async function segment(id, title, fn) {
  const dir = path.join(RAW, id);
  fs.mkdirSync(dir, {recursive: true});
  const context = await browser.newContext({
    viewport: {width: 1440, height: 900}, deviceScaleFactor: 1, locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai', recordVideo: {dir, size: {width: 1440, height: 900}},
  });
  const page = await context.newPage();
  const video = page.video();
  const t0 = now();
  const marks = [];
  const mark = (label, extra = {}) => {
    const atSec = Number(((now() - t0) / 1000).toFixed(2));
    marks.push({label, atSec, ...extra});
    console.log(`    ${String(atSec).padStart(6)}s  ${label}`);
  };
  console.log(`\n▶ ${id} — ${title}`);
  let failure = null;
  try {
    await fn(page, mark);
  } catch (e) {
    failure = e;
    mark(`ERROR: ${e.message}`);
    console.error(`  ✗ ${e.message}`);
  } finally {
    await context.close();
  }
  let webm = null;
  try { webm = video ? await video.path() : null; } catch { webm = null; }
  if (!webm || !fs.existsSync(webm)) webm = newestWebm(dir);
  const mp4 = path.join(OUT, `${id}.mp4`);
  convert(webm, mp4);
  const out = probe(mp4);
  const result = {id, title, file: path.relative(ROOT, mp4), durationSec: out.duration, width: out.width, height: out.height, fps: out.fps, frames: out.frames, sizeMB: out.size ? Number((out.size / 1024 / 1024).toFixed(2)) : null, marks, failure: failure ? failure.message : null};
  results.push(result);
  fs.writeFileSync(path.join(OUT, 'report2.json'), JSON.stringify({segments: results}, null, 2));
  console.log(`  ✓ ${result.file}  ${result.durationSec?.toFixed(1)}s  ${result.sizeMB} MB`);
}

const emailStart = now();
await segment('ms-email2-start', '设置 → 邮箱 → 导入正确主题 .eml', async (page, mark) => {
  await page.goto('http://127.0.0.1:5173/settings', {waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(1800);
  await page.getByText('拖入 .eml', {exact: false}).first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  mark('邮箱导入区');
  await page.locator('input[type=file]').first().setInputFiles(EML);
  mark('选择 .eml');
  await page.getByText('处理中', {exact: false}).first().waitFor({timeout: 30000});
  mark('处理中');
  await page.waitForTimeout(3200);
});

let emailWaitSec = null;
let emailDone = false;
{
  const context = await browser.newContext({viewport: {width: 1440, height: 900}, locale: 'zh-CN'});
  const page = await context.newPage();
  const t0 = now();
  for (let i = 0; i < 90; i++) {
    await page.goto('http://127.0.0.1:5173/settings', {waitUntil: 'domcontentloaded'}).catch(() => {});
    await page.waitForTimeout(1200);
    const row = page.locator('li').filter({hasText: '11月12日截止'}).first();
    const text = (await row.count()) ? (await row.innerText().catch(() => '')).replace(/\s+/g, ' ') : '';
    const done = text.includes('已处理');
    if (i % 2 === 0) console.log(`    email2 poll ${((now() - t0) / 1000).toFixed(0)}s`, text ? (done ? 'done' : 'processing') : 'no row');
    if (done) {
      emailDone = true;
      emailWaitSec = Number(((now() - emailStart) / 1000).toFixed(1));
      console.log(`    email2 done after ${emailWaitSec}s`);
      break;
    }
    await sleep(4000);
  }
  await context.close();
}
if (!emailDone) emailWaitSec = Number(((now() - emailStart) / 1000).toFixed(1));

await segment('ms-email2-done', '设置 → 正确邮件行 → 已处理', async (page, mark) => {
  await page.goto('http://127.0.0.1:5173/settings', {waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(1800);
  const row = page.locator('li').filter({hasText: '11月12日截止'}).first();
  await row.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);
  mark('已处理', {row: (await row.innerText()).replace(/\s+/g, ' ')});
  await page.waitForTimeout(2600);
});

await segment('ms-inbox2', '收件箱 → 新邮件候选', async (page, mark) => {
  await page.goto('http://127.0.0.1:5173/inbox', {waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(2500);
  mark('收件箱', {text: (await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))).slice(0, 1500)});
  const candidate = page.getByText('候选事件', {exact: false}).first();
  if (await candidate.count()) await candidate.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1600);
  mark('候选卡');
  await page.waitForTimeout(2800);
});

await segment('ms-reminder2', '行动台 → 顶部提醒', async (page, mark) => {
  await page.goto('http://127.0.0.1:5173/', {waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
  mark('顶部提醒', {text: (await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))).slice(0, 1500)});
  await page.waitForTimeout(3200);
});

let agentSec = null;
await segment('ms-agent3', '设置 → 用 Agent 调研 → 5 条结果', async (page, mark) => {
  await page.goto('http://127.0.0.1:5173/settings', {waitUntil: 'domcontentloaded'});
  await page.waitForTimeout(2000);
  const urlInput = page.getByPlaceholder('站点 / 页面地址，https://…');
  await urlInput.scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);
  await urlInput.fill('https://www.nottingham.edu.cn/cn/events/event-listing.aspx');
  await page.getByPlaceholder('任务描述（可选，如：找出这个栏目里最近的通知）').fill(
    '找出最近的活动条目，保留标题、日期、地点和原文片段',
  );
  mark('填入 UNNC 活动列表页');
  await page.waitForTimeout(700);
  await page.getByRole('button', {name: '开始调研'}).click();
  const t0 = now();
  mark('开始调研');
  const resultText = page.getByText('候选条目', {exact: false}).first();
  await resultText.waitFor({state: 'visible', timeout: 300000});
  agentSec = Number(((now() - t0) / 1000).toFixed(1));
  mark('5 条候选出现', {agentSec});
  await resultText.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -120));
  await page.waitForTimeout(1000);
  mark('候选条目');
  await page.waitForTimeout(2600);
  const writeBtn = page.getByRole('button', {name: '写入并替换当前规则'});
  if (await writeBtn.count()) {
    await writeBtn.first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    mark('写入并替换当前规则');
    await page.waitForTimeout(2600);
  }
  const panel = await page.locator('.research-panel').innerText().catch(() => '');
  mark('结果保持', {text: panel.slice(0, 3000)});
});

fs.writeFileSync(
  path.join(OUT, 'report2.json'),
  JSON.stringify({emailWaitSec, agentSec, segments: results}, null, 2),
);
console.log(`\nemailWaitSec=${emailWaitSec} agentSec=${agentSec}`);
await browser.close();
