// ------------------------------------------------------------------
// 仅用于「后端未启动时看布局」的假数据服务。它不是产品能力：
// 所有识别、核实结果都是写死的演示数据，不能当作真实输出。
// 启动：node mock/server.mjs        （默认 http://127.0.0.1:8787）
// 前端：$env:VITE_API_TARGET="http://127.0.0.1:8787"; npm run dev
// ------------------------------------------------------------------
import http from 'node:http'

const PORT = Number(process.env.MOCK_PORT || 8787)
// MOCK_EMPTY=1 时返回空数据，专门检查空态布局。
const EMPTY = process.env.MOCK_EMPTY === '1'
const json = (res, status, body) => {
  const data = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(data),
  })
  res.end(data)
}

const DEMO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="520" viewBox="0 0 720 520">
<rect width="720" height="520" fill="#f5f5f4"/>
<rect x="48" y="40" width="624" height="440" rx="8" fill="#ffffff" stroke="#e7e5e4"/>
<text x="84" y="96" font-family="Microsoft YaHei, sans-serif" font-size="22" font-weight="bold" fill="#1c1917">关于开展 2026 年秋季招聘宣讲会的通知</text>
<text x="84" y="132" font-family="Microsoft YaHei, sans-serif" font-size="14" fill="#78716c">发布单位：示例学院学生工作办公室　发布时间：2026-11-06</text>
<line x1="84" y1="152" x2="636" y2="152" stroke="#e7e5e4"/>
<text x="84" y="188" font-family="Microsoft YaHei, sans-serif" font-size="15" fill="#1c1917">各年级同学：</text>
<text x="84" y="222" font-family="Microsoft YaHei, sans-serif" font-size="15" fill="#1c1917">学院定于 11 月 12 日（周四）下午 2 点在教学楼 A301 举办秋季招聘宣讲会。</text>
<text x="84" y="256" font-family="Microsoft YaHei, sans-serif" font-size="15" fill="#1c1917">请有意参加的同学于 11 月 10 日 23:59 前提交报名表，并携带学生证。</text>
<text x="84" y="290" font-family="Microsoft YaHei, sans-serif" font-size="15" fill="#1c1917">活动预计持续两小时，请提前十分钟到场。</text>
<text x="84" y="342" font-family="Microsoft YaHei, sans-serif" font-size="15" fill="#1c1917">逾期未提交报名表的，视为放弃参加资格。</text>
<text x="84" y="400" font-family="Microsoft YaHei, sans-serif" font-size="14" fill="#78716c">示例学院学生工作办公室</text>
<text x="84" y="424" font-family="Microsoft YaHei, sans-serif" font-size="14" fill="#78716c">2026 年 11 月 6 日</text>
</svg>`

const sourceShot = {
  id: 'src_shot',
  kind: 'screenshot',
  title: '通知截图',
  url: null,
  image_url: '/media/demo.svg',
  published_at: null,
}
const sourceWeb = {
  id: 'src_web',
  kind: 'web',
  title: '关于开展 2026 年秋季招聘宣讲会的通知',
  url: 'https://www.example.edu.cn/notice/1024',
  image_url: null,
  published_at: '2026-11-06T09:00:00+08:00',
}
const sourceText = {
  id: 'src_text',
  kind: 'text',
  title: '班级群补充说明',
  url: null,
  image_url: null,
  published_at: null,
}

let seq = 0
const cid = () => `clm_${++seq}`

function claim({ value, display, status = 'supported', origin = 'model', quote = null, source = sourceShot }) {
  return {
    id: cid(),
    value,
    display,
    status,
    origin,
    quote,
    quote_start: null,
    quote_end: null,
    source,
  }
}

function field(key, label, precision, claims) {
  return { key, label, precision, claims }
}

function resolve(f) {
  const rows = f.claims.filter((c) => c.status !== 'rejected')
  const confirmed = rows.filter((c) => c.status === 'user_confirmed')
  const supported = rows.filter((c) => c.status === 'supported')
  const pending = rows.filter((c) => ['needs_anchor', 'conflict', 'insufficient'].includes(c.status))
  const pool = confirmed.length ? confirmed : supported
  if (pool.length) {
    const winner = pool[pool.length - 1]
    const distinct = new Set(pool.map((c) => JSON.stringify(c.value)))
    const status = confirmed.length ? 'user_confirmed' : distinct.size > 1 ? 'conflict' : 'supported'
    return { value: winner.value, display: winner.display, status }
  }
  if (pending.length) {
    const last = pending[pending.length - 1]
    return { value: null, display: null, status: last.status }
  }
  return { value: null, display: null, status: 'unconfirmed' }
}

function fieldView(f) {
  const r = resolve(f)
  return {
    key: f.key,
    label: f.label,
    value: r.value,
    display: r.display,
    status: r.status,
    precision: f.precision,
    claims: f.claims.filter((c) => c.status !== 'rejected'),
  }
}

// ---------------------------------------------------------------- 主事件

const mainFields = [
  field('title', '标题', null, [
    claim({
      value: '2026 年秋季校园招聘宣讲会',
      display: '2026 年秋季校园招聘宣讲会',
      quote: '关于开展 2026 年秋季招聘宣讲会的通知',
    }),
  ]),
  field('start_at', '活动时间', 'datetime', [
    claim({
      value: { iso: '2026-11-12T14:00:00+08:00', precision: 'datetime' },
      display: '11月12日 周四 14:00',
      status: 'conflict',
      quote: '学院定于 11 月 12 日（周四）下午 2 点在教学楼 A301 举办',
    }),
    claim({
      value: { iso: '2026-11-12T15:30:00+08:00', precision: 'datetime' },
      display: '11月12日 周四 15:30',
      status: 'conflict',
      origin: 'rule',
      quote: '宣讲会调整至 11 月 12 日下午 3 点 30 分开始。',
      source: sourceWeb,
    }),
  ]),
  field('end_at', '结束时间', 'datetime', [
    claim({
      value: null,
      display: null,
      status: 'needs_anchor',
      quote: '活动预计持续两小时',
    }),
  ]),
  field('location', '地点', null, [
    claim({
      value: '教学楼 A301',
      display: '教学楼 A301',
      quote: '在教学楼 A301 举办秋季招聘宣讲会',
    }),
  ]),
  field('audience', '适用对象', null, [
    claim({
      value: '全院各年级学生',
      display: '全院各年级学生',
      status: 'insufficient',
      quote: '各年级同学',
    }),
  ]),
  field('org', '组织方', null, [
    claim({
      value: '示例学院学生工作办公室',
      display: '示例学院学生工作办公室',
      quote: '示例学院学生工作办公室',
    }),
  ]),
]

const tasks = [
  {
    id: 'task_1',
    action: '提交宣讲会报名表',
    state: 'open',
    due_at: '2026-11-10T23:59:00+08:00',
    due_display: '11月10日 周二 23:59',
    materials: ['报名表', '学生证复印件'],
    submit_channel: '学院办公室 302',
    fields: [
      field('action', '事项', null, [
        claim({ value: '提交宣讲会报名表', display: '提交宣讲会报名表', quote: '请有意参加的同学于 11 月 10 日 23:59 前提交报名表' }),
      ]),
      field('due_at', '截止时间', 'datetime', [
        claim({
          value: { iso: '2026-11-10T23:59:00+08:00', precision: 'datetime' },
          display: '11月10日 周二 23:59',
          quote: '于 11 月 10 日 23:59 前提交报名表',
        }),
      ]),
      field('materials', '所需材料', null, [
        claim({ value: ['报名表', '学生证复印件'], display: '报名表、学生证复印件', quote: '提交报名表，并携带学生证' }),
      ]),
      field('submit_channel', '提交方式', null, [
        claim({ value: '学院办公室 302', display: '学院办公室 302', quote: '交至学院办公室 302' }),
      ]),
      field('prerequisites', '前置条件', null, [
        claim({
          value: null,
          display: null,
          status: 'needs_anchor',
          quote: '提前十分钟到场',
        }),
      ]),
    ],
  },
  {
    id: 'task_2',
    action: '完成线上安全测试',
    state: 'open',
    due_at: '2026-11-09T18:00:00+08:00',
    due_display: '11月9日 周一 18:00',
    materials: ['校园网账号'],
    submit_channel: '线上系统',
    fields: [
      field('action', '事项', null, [
        claim({ value: '完成线上安全测试', display: '完成线上安全测试', quote: '参加前须完成线上安全测试' }),
      ]),
      field('due_at', '截止时间', 'datetime', [
        claim({
          value: { iso: '2026-11-09T18:00:00+08:00', precision: 'datetime' },
          display: '11月9日 周一 18:00',
          quote: '测试于 11 月 9 日 18:00 关闭',
        }),
      ]),
      field('materials', '所需材料', null, [
        claim({ value: ['校园网账号'], display: '校园网账号', quote: '使用校园网账号登录' }),
      ]),
    ],
  },
  {
    id: 'task_3',
    action: '打印并签署知情同意书',
    state: 'done',
    due_at: '2026-11-07T12:00:00+08:00',
    due_display: '11月7日 周六 12:00',
    materials: ['知情同意书'],
    submit_channel: null,
    fields: [
      field('action', '事项', null, [
        claim({ value: '打印并签署知情同意书', display: '打印并签署知情同意书', quote: '请打印并签署知情同意书' }),
      ]),
      field('due_at', '截止时间', 'datetime', [
        claim({
          value: { iso: '2026-11-07T12:00:00+08:00', precision: 'datetime' },
          display: '11月7日 周六 12:00',
          quote: '11 月 7 日 12:00 前交回',
          origin: 'user',
          status: 'user_confirmed',
        }),
      ]),
    ],
  },
  {
    id: 'task_4',
    action: '参加宣讲会',
    state: 'open',
    due_at: '2026-11-12T14:00:00+08:00',
    due_display: '11月12日 周四 14:00',
    materials: [],
    submit_channel: '教学楼 A301',
    fields: [
      field('action', '事项', null, [
        claim({ value: '参加宣讲会', display: '参加宣讲会', quote: '在教学楼 A301 举办秋季招聘宣讲会' }),
      ]),
      field('due_at', '截止时间', 'datetime', [
        claim({
          value: { iso: '2026-11-12T14:00:00+08:00', precision: 'datetime' },
          display: '11月12日 周四 14:00',
          quote: '11 月 12 日（周四）下午 2 点',
        }),
      ]),
    ],
  },
]

const rules = [
  {
    id: 'rule_1',
    text: '逾期未提交报名表的，视为放弃参加资格。',
    impact: 'high',
    state: 'supported',
    claims: [
      claim({
        value: '逾期未提交报名表的，视为放弃参加资格。',
        display: '逾期未提交报名表的，视为放弃参加资格。',
        quote: '逾期未提交报名表的，视为放弃参加资格。',
      }),
    ],
  },
  {
    id: 'rule_2',
    text: '现场需服从工作人员安排，违规者取消参会资格。',
    impact: 'high',
    state: 'unconfirmed',
    claims: [],
  },
  {
    id: 'rule_3',
    text: '宣讲会期间请将手机调至静音。',
    impact: 'normal',
    state: 'supported',
    claims: [
      claim({
        value: '宣讲会期间请将手机调至静音。',
        display: '宣讲会期间请将手机调至静音。',
        quote: '宣讲会期间请将手机调至静音。',
        source: sourceText,
      }),
    ],
  },
]

const history = [
  {
    at: '2026-11-06T10:12:00+08:00',
    field: 'title',
    label: '标题',
    display: '2026 年秋季校园招聘宣讲会',
    status: 'supported',
    origin: 'model',
    source: '通知截图',
    kind: 'screenshot',
  },
  {
    at: '2026-11-06T10:12:00+08:00',
    field: 'start_at',
    label: '活动时间',
    display: '11月12日 周四 14:00',
    status: 'supported',
    origin: 'model',
    source: '通知截图',
    kind: 'screenshot',
  },
  {
    at: '2026-11-07T09:30:00+08:00',
    field: 'start_at',
    label: '活动时间',
    display: '11月12日 周四 15:30',
    status: 'conflict',
    origin: 'rule',
    source: '关于开展 2026 年秋季招聘宣讲会的通知',
    kind: 'web',
  },
  {
    at: '2026-11-07T09:31:00+08:00',
    field: 'due_at',
    label: '截止时间',
    display: '11月7日 周六 12:00',
    status: 'user_confirmed',
    origin: 'user',
    source: '用户修改',
    kind: 'text',
  },
]

let eventState = 'confirmed'
let mergeState = 'pending'
let candidates = ['evt_cand_1', 'evt_cand_2']

function eventView(detail = false) {
  const fields = mainFields.map(fieldView)
  const taskViews = tasks.map((t) => {
    const tf = Object.fromEntries(t.fields.map((f) => [f.key, fieldView(f)]))
    return {
      id: t.id,
      action: tf.action?.display ?? t.action,
      state: t.state,
      due_at: tf.due_at?.value?.iso ?? null,
      due_display: tf.due_at?.display ?? null,
      precision: tf.due_at?.precision ?? null,
      materials: tf.materials?.value ?? t.materials,
      submit_channel: tf.submit_channel?.display ?? t.submit_channel,
      fields: t.fields.map(fieldView),
    }
  })
  const base = {
    id: 'evt_main',
    title: '2026 年秋季校园招聘宣讲会',
    state: eventState,
    org: '示例学院学生工作办公室',
    location: '教学楼 A301',
    start_at: '2026-11-12T14:00:00+08:00',
    start_display: fields.find((f) => f.key === 'start_at').display,
    fields,
    tasks: taskViews,
    task_count: taskViews.length,
    open_task_count: taskViews.filter((t) => t.state === 'open').length,
    conflict_count: fields.filter((f) => f.status === 'conflict').length,
    pending_count: fields.filter((f) => ['needs_anchor', 'unconfirmed'].includes(f.status)).length,
    created_at: '2026-11-06T10:12:00+08:00',
  }
  if (!detail) return base
  return {
    ...base,
    rules,
    sources: [
      {
        id: sourceShot.id,
        kind: 'screenshot',
        title: sourceShot.title,
        url: null,
        image_url: '/media/demo.svg',
        fetched_at: '2026-11-06T10:10:00+08:00',
        published_at: null,
        excerpt: '学院定于 11 月 12 日（周四）下午 2 点在教学楼 A301 举办秋季招聘宣讲会…',
      },
      {
        id: sourceWeb.id,
        kind: 'web',
        title: sourceWeb.title,
        url: sourceWeb.url,
        image_url: null,
        fetched_at: '2026-11-07T09:30:00+08:00',
        published_at: '2026-11-06T09:00:00+08:00',
        excerpt: '宣讲会调整至 11 月 12 日下午 3 点 30 分开始，请以本通知为准…',
      },
      {
        id: sourceText.id,
        kind: 'text',
        title: sourceText.title,
        url: null,
        image_url: null,
        fetched_at: '2026-11-07T20:00:00+08:00',
        published_at: null,
        excerpt: '补充：宣讲会期间请将手机调至静音。',
      },
    ],
    history,
    merge_id: mergeState === 'pending' ? 'merge_1' : null,
  }
}

function candidateView(id) {
  const first = id === 'evt_cand_1'
  const fields = [
    field('title', '标题', null, [
      claim({
        value: first ? '2026 年秋季校园招聘宣讲会' : '实验室安全培训报名',
        display: first ? '2026 年秋季校园招聘宣讲会' : '实验室安全培训报名',
        quote: first ? '秋季招聘宣讲会' : '实验室安全培训',
        source: first ? sourceShot : sourceText,
      }),
    ]),
    field('start_at', '活动时间', 'datetime', [
      claim({
        value: { iso: first ? '2026-11-12T14:00:00+08:00' : '2026-11-18T09:00:00+08:00', precision: 'datetime' },
        display: first ? '11月12日 周四 14:00' : '11月18日 周三 09:00',
        quote: first ? '11 月 12 日（周四）下午 2 点' : '11 月 18 日上午 9 点',
        source: first ? sourceShot : sourceText,
      }),
    ]),
    field('location', '地点', null, [
      claim({
        value: first ? '教学楼 A301' : '实验楼 B204',
        display: first ? '教学楼 A301' : '实验楼 B204',
        quote: first ? '教学楼 A301' : '实验楼 B204',
        source: first ? sourceShot : sourceText,
      }),
    ]),
  ].map(fieldView)
  const task = {
    id: first ? 'cand_task_1' : 'cand_task_2',
    action: first ? '提交报名表' : '填写安全培训登记',
    state: 'open',
    due_at: first ? '2026-11-10T23:59:00+08:00' : null,
    due_display: first ? '11月10日 周二 23:59' : null,
    materials: first ? ['报名表'] : [],
    submit_channel: null,
    fields: [],
  }
  return {
    id,
    title: first ? '2026 年秋季校园招聘宣讲会' : '实验室安全培训报名',
    state: 'candidate',
    org: '示例学院学生工作办公室',
    location: first ? '教学楼 A301' : '实验楼 B204',
    start_at: first ? '2026-11-12T14:00:00+08:00' : '2026-11-18T09:00:00+08:00',
    start_display: first ? '11月12日 周四 14:00' : '11月18日 周三 09:00',
    fields,
    tasks: [task],
    task_count: 1,
    open_task_count: 1,
    conflict_count: first ? 1 : 0,
    pending_count: first ? 1 : 0,
    created_at: first ? '2026-11-08T08:40:00+08:00' : '2026-11-08T09:10:00+08:00',
    summary: first
      ? '学院邀请参加秋季招聘宣讲会，需在 11 月 10 日前提交报名表。'
      : '实验室安全培训开始报名，原文未写截止时间。',
    questions: first
      ? ['截图与官网通知的开始时间不一致，以哪个为准？']
      : ['原文没有写报名截止时间，请补上。'],
    source: {
      id: first ? sourceShot.id : sourceText.id,
      kind: first ? 'screenshot' : 'text',
      title: first ? sourceShot.title : sourceText.title,
      image_url: first ? sourceShot.image_url : null,
    },
  }
}

const merge = {
  id: 'merge_1',
  score: 4.78,
  reasons: ['标题相似度 86%', '同一组织方', '时间相近'],
  state: 'pending',
  a: { id: 'evt_cand_1', title: '2026 年秋季校园招聘宣讲会', start_display: '11月12日 周四 14:00' },
  b: { id: 'evt_main', title: '2026 年秋季校园招聘宣讲会（补充）', start_display: '11月12日 周四 15:30' },
  diff: [
    { kind: 'change', field: 'start_at', label: '活动时间', old: '11月12日 周四 14:00', new: '11月12日 周四 15:30' },
    { kind: 'add', field: 'location', label: '地点', old: null, new: '教学楼 A301' },
    { kind: 'change', field: 'org', label: '组织方', old: '示例学院', new: '示例学院学生工作办公室' },
    { kind: 'task', field: 'task', label: '新增待办', old: null, new: '提交报名表（11月10日 23:59）' },
  ],
}

const verifyResult = {
  status: 'found',
  message: '找到官方原文，可作为补充依据。',
  query: ['2026 年秋季校园招聘宣讲会 示例大学', '2026 年秋季校园招聘宣讲会 site:example.edu.cn'],
  sources: [
    {
      id: 'src_web',
      title: '关于开展 2026 年秋季招聘宣讲会的通知',
      url: 'https://www.example.edu.cn/notice/1024',
      domain: 'www.example.edu.cn',
      official: true,
      chars: 2380,
    },
    {
      id: 'src_news',
      title: '秋季就业服务月活动安排',
      url: 'https://news.example.edu.cn/2026/1101',
      domain: 'news.example.edu.cn',
      official: true,
      chars: 1640,
    },
  ],
  findings: [
    {
      id: 'f1',
      field: 'start_at',
      label: '活动时间',
      value: { iso: '2026-11-12T15:30:00+08:00', precision: 'datetime' },
      display: '11月12日 周四 15:30',
      quote: '宣讲会调整至 11 月 12 日下午 3 点 30 分开始。',
      source_id: 'src_web',
      source_title: '关于开展 2026 年秋季招聘宣讲会的通知',
      source_url: 'https://www.example.edu.cn/notice/1024',
      official: true,
      state: 'conflict',
      impact: 'normal',
      note: '与当前记录不一致：11月12日 周四 14:00',
    },
    {
      id: 'f2',
      field: 'due_at',
      label: '截止时间',
      value: { iso: '2026-11-10T23:59:00+08:00', precision: 'datetime' },
      display: '11月10日 周二 23:59',
      quote: '请于 11 月 10 日 23:59 前完成报名。',
      source_id: 'src_web',
      source_title: '关于开展 2026 年秋季招聘宣讲会的通知',
      source_url: 'https://www.example.edu.cn/notice/1024',
      official: true,
      state: 'supported',
      impact: 'normal',
      note: '原文明确写出报名截止时间。',
    },
    {
      id: 'f3',
      field: 'rule',
      label: '高影响条款',
      value: '缺席将记入诚信记录。',
      display: '缺席将记入诚信记录。',
      quote: '缺席将记入诚信记录。',
      source_id: 'src_news',
      source_title: '秋季就业服务月活动安排',
      source_url: 'https://news.example.edu.cn/2026/1101',
      official: false,
      state: 'needs_review',
      impact: 'high',
      note: '来源不是本校官方页面，不能据此确认',
    },
  ],
  checked_at: '2026-11-08T13:20:00+08:00',
}

// ---------------------------------------------------------------- 任务轮询

const jobs = new Map()

function ingestStage(polls) {
  const steps = [
    { key: 'ocr', label: '识别截图', state: polls >= 2 ? 'done' : 'active' },
    { key: 'extract', label: '整理事项', state: polls >= 4 ? 'done' : polls >= 2 ? 'active' : 'todo' },
    { key: 'link', label: '查找关联事件', state: polls >= 6 ? 'done' : polls >= 4 ? 'active' : 'todo' },
    { key: 'done', label: '等待确认', state: polls >= 6 ? 'active' : 'todo' },
  ]
  const messages = ['正在识别截图中的文字…', '正在整理事件、截止时间与材料…', '正在查找同一事件的其他来源…', '识别完成，等待确认']
  const index = polls >= 6 ? 3 : polls >= 4 ? 2 : polls >= 2 ? 1 : 0
  return { stage: steps[index].key, steps, message: messages[index] }
}

function verifyStage(polls) {
  return {
    stage: polls >= 2 ? 'judge' : 'fetch',
    steps: [
      { key: 'search', label: '检索官方来源', state: 'done' },
      { key: 'fetch', label: '读取原文', state: polls >= 2 ? 'done' : 'active' },
      { key: 'judge', label: '核对适用性', state: polls >= 2 ? 'active' : 'todo' },
    ],
    message: polls >= 2 ? '正在核对 2 篇原文…' : '找到 2 条候选，正在读取原文…',
  }
}

function jobView(job) {
  job.polls += 1
  if (job.type === 'ingest') {
    const done = job.polls >= 7
    return {
      id: job.id,
      state: done ? 'done' : 'running',
      stage: ingestStage(job.polls),
      result: done ? { source_id: 'src_shot', event_id: 'evt_cand_1', merge_id: 'merge_1' } : null,
      error: null,
    }
  }
  const done = job.polls >= 3
  return {
    id: job.id,
    state: done ? 'done' : 'running',
    stage: done ? { ...verifyStage(2), steps: verifyStage(2).steps.map((s) => ({ ...s, state: 'done' })) } : verifyStage(job.polls),
    result: done ? verifyResult : null,
    error: null,
  }
}

// ---------------------------------------------------------------- 路由

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost')
  const path = url.pathname
  const method = req.method || 'GET'

  if (path === '/media/demo.svg') {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8' })
    res.end(DEMO_SVG)
    return
  }

  if (path === '/api/health') {
    return json(res, 200, {
      ok: true,
      db: 'mock',
      model: { ok: false, model: 'mock', error: '布局检查服务，未连接模型' },
      school: '示例大学',
      college: '示例学院',
    })
  }

  if (path === '/api/capabilities') {
    return json(res, 200, {
      items: [
        { key: 'screenshot', name: '截图识别与收录', level: 'live', note: '上传或粘贴截图，真实调用模型识别' },
        { key: 'paste', name: '电脑粘贴截图', level: 'live', note: 'Ctrl+V 直接粘贴' },
        { key: 'organize', name: '事件整理与字段级来源', level: 'live', note: '每个字段附带原文与出处' },
        { key: 'link', name: '跨来源关联与冲突提示', level: 'live', note: '提出合并建议，由你确认' },
        { key: 'verify', name: '联网核实', level: 'live', note: '真实检索并抓取原文' },
        { key: 'ics', name: '日历导出', level: 'live', note: '导出 .ics' },
        { key: 'crawl', name: '官网定时抓取', level: 'entry', note: '演示暂未接入，仅保留入口' },
        { key: 'imap', name: '邮箱自动连接与检索', level: 'entry', note: '演示暂未接入' },
        { key: 'push', name: '多渠道推送与后台提醒', level: 'entry', note: '演示暂未接入' },
      ],
    })
  }

  if (path === '/api/today') {
    if (EMPTY) return json(res, 200, { events: [], tasks: [], candidates: 0 })
    return json(res, 200, {
      events: [eventView()],
      tasks: tasks.map((t) => {
        const due = fieldView(t.fields.find((f) => f.key === 'due_at'))
        return {
          id: t.id,
          event_id: 'evt_main',
          event_title: '2026 年秋季校园招聘宣讲会',
          action: t.action,
          due_at: due.value?.iso ?? null,
          due_display: due.display,
          state: t.state,
        }
      }),
      candidates: candidates.length,
    })
  }

  if (path === '/api/inbox') {
    if (EMPTY) return json(res, 200, { candidates: [], merges: [], changes: [], counts: { candidates: 0, merges: 0, changes: 0 } })
    return json(res, 200, {
      candidates: candidates.map(candidateView),
      merges: mergeState === 'pending' ? [merge] : [],
      changes: [],
      counts: { candidates: candidates.length, merges: mergeState === 'pending' ? 1 : 0, changes: 0 },
    })
  }

  if (path === '/api/events') {
    if (EMPTY) return json(res, 200, { items: [] })
    return json(res, 200, { items: [eventView(), ...candidates.map(candidateView)] })
  }

  const eventMatch = path.match(/^\/api\/events\/([^/]+)$/)
  if (eventMatch && method === 'GET') {
    if (eventMatch[1] === 'evt_main') return json(res, 200, eventView(true))
    if (candidates.includes(eventMatch[1])) return json(res, 200, candidateView(eventMatch[1]))
    return json(res, 404, { detail: '事件不存在' })
  }

  if (eventMatch && method === 'PATCH') {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const patch = JSON.parse(body || '{}')
      const f = mainFields.find((x) => x.key === patch.field)
      if (f) {
        const isTime = ['start_at', 'end_at'].includes(f.key)
        f.claims.push(
          claim({
            value: isTime ? { iso: patch.value, precision: 'datetime' } : patch.value,
            display: isTime ? patch.value.replace('T', ' ') : patch.value,
            status: 'user_confirmed',
            origin: 'user',
            quote: patch.value,
            source: sourceText,
          }),
        )
      }
      json(res, 200, eventView(true))
    })
    return
  }

  const confirmMatch = path.match(/^\/api\/events\/([^/]+)\/confirm$/)
  if (confirmMatch && method === 'POST') {
    eventState = 'confirmed'
    return json(res, 200, eventView(true))
  }

  const icsMatch = path.match(/^\/api\/events\/([^/]+)\/ics$/)
  if (icsMatch) {
    res.writeHead(200, {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="ontime-demo.ics"',
    })
    res.end('BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//到点 mock//CN\r\nEND:VCALENDAR\r\n')
    return
  }

  const verifyMatch = path.match(/^\/api\/events\/([^/]+)\/verify$/)
  if (verifyMatch && method === 'POST') {
    const job = { id: `job_verify_${Date.now()}`, type: 'verify', polls: 0 }
    jobs.set(job.id, job)
    return json(res, 200, { job_id: job.id })
  }

  const jobMatch = path.match(/^\/api\/jobs\/([^/]+)$/)
  if (jobMatch && method === 'GET') {
    const job = jobs.get(jobMatch[1])
    if (!job) return json(res, 404, { detail: '任务不存在' })
    return json(res, 200, jobView(job))
  }

  if (path === '/api/ingest/screenshot' || path === '/api/ingest/text') {
    const job = { id: `job_ingest_${Date.now()}`, type: 'ingest', polls: 0 }
    jobs.set(job.id, job)
    return json(res, 200, { job_id: job.id, source_id: 'src_new' })
  }

  const claimMatch = path.match(/^\/api\/claims\/([^/]+)\/decide$/)
  if (claimMatch && method === 'POST') {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const { action } = JSON.parse(body || '{}')
      const all = [...mainFields, ...tasks.flatMap((t) => t.fields)]
      for (const f of all) {
        const c = f.claims.find((x) => x.id === claimMatch[1])
        if (!c) continue
        if (action === 'accept') {
          c.status = 'user_confirmed'
          for (const other of f.claims) {
            if (other.id !== c.id && ['supported', 'conflict'].includes(other.status)) other.status = 'rejected'
          }
        } else {
          c.status = 'rejected'
        }
        return json(res, 200, { ok: true, status: c.status })
      }
      json(res, 404, { detail: '依据不存在' })
    })
    return
  }

  const mergeMatch = path.match(/^\/api\/merge\/([^/]+)$/)
  if (mergeMatch && method === 'POST') {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const { action } = JSON.parse(body || '{}')
      mergeState = action === 'accept' ? 'accepted' : 'rejected'
      json(res, 200, { ok: true, state: mergeState, event_id: action === 'accept' ? 'evt_main' : undefined })
    })
    return
  }

  const taskMatch = path.match(/^\/api\/tasks\/([^/]+)\/toggle$/)
  if (taskMatch && method === 'POST') {
    const t = tasks.find((x) => x.id === taskMatch[1])
    if (!t) return json(res, 404, { detail: '任务不存在' })
    t.state = t.state === 'open' ? 'done' : 'open'
    return json(res, 200, { ok: true, state: t.state })
  }

  if (path === '/api/findings/apply' && method === 'POST') {
    return json(res, 200, eventView(true))
  }

  if (path === '/api/demo/reset' && method === 'POST') {
    candidates = []
    mergeState = 'rejected'
    eventState = 'candidate'
    return json(res, 200, { ok: true })
  }

  return json(res, 404, { detail: `mock 未实现：${method} ${path}` })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[ontime mock] 布局检查数据服务：http://127.0.0.1:${PORT}`)
  console.log('[ontime mock] 仅用于无后端时检查布局，不是真实识别/核实能力。')
})
