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
const sourceMail = {
  id: 'src_mail_c',
  kind: 'mail',
  title: '讲座邮件：大模型时代的科研范式',
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
let candidates = ['evt_cand_1', 'evt_cand_2', 'evt_cand_3', 'evt_cand_4']

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

const CAND_SPECS = {
  evt_cand_1: {
    title: '2026 年秋季校园招聘宣讲会',
    summary: '学院邀请参加秋季招聘宣讲会，需在 11 月 10 日前提交报名表。',
    question: '截图与官网通知的开始时间不一致，以哪个为准？',
    start_at: '2026-11-12T14:00:00+08:00',
    start_display: '11月12日 周四 14:00',
    location: '教学楼 A301',
    task_action: '提交报名表',
    task_due_at: '2026-11-10T23:59:00+08:00',
    task_due_display: '11月10日 周二 23:59',
    materials: ['报名表'],
    source: sourceShot,
    source_title: sourceShot.title,
    image_url: sourceShot.image_url,
    quote: '秋季招聘宣讲会',
    created_at: '2026-11-08T08:40:00+08:00',
    conflict_count: 1,
    pending_count: 1,
  },
  evt_cand_2: {
    title: '实验室安全培训报名',
    summary: '实验室安全培训开始报名，原文未写截止时间。',
    question: '原文没有写报名截止时间，请补上。',
    start_at: '2026-11-18T09:00:00+08:00',
    start_display: '11月18日 周三 09:00',
    location: '实验楼 B204',
    task_action: '填写安全培训登记',
    task_due_at: null,
    task_due_display: null,
    materials: [],
    source: sourceText,
    source_title: sourceText.title,
    image_url: null,
    quote: '实验室安全培训',
    created_at: '2026-11-08T09:10:00+08:00',
    conflict_count: 0,
    pending_count: 1,
  },
  evt_cand_3: {
    title: '关于举办 2026 年新生编程竞赛的通知',
    summary: '官网新发布的竞赛通知：11 月 21 日比赛，11 月 15 日前组队报名。',
    question: null,
    start_at: '2026-11-21T09:00:00+08:00',
    start_display: '11月21日 周六 09:00',
    location: '计算中心机房',
    task_action: '提交组队报名表',
    task_due_at: '2026-11-15T17:00:00+08:00',
    task_due_display: '11月15日 周日 17:00',
    materials: ['组队表'],
    source: sourceWeb,
    source_title: sourceWeb.title,
    image_url: null,
    quote: '关于举办 2026 年新生编程竞赛的通知',
    created_at: '2026-11-09T08:10:00+08:00',
    conflict_count: 0,
    pending_count: 0,
  },
  evt_cand_4: {
    title: '讲座：大模型时代的科研范式',
    summary: '邮件邀请参加 11 月 20 日下午的讲座，地点在图书馆报告厅。',
    question: null,
    start_at: '2026-11-20T14:00:00+08:00',
    start_display: '11月20日 周五 14:00',
    location: '图书馆报告厅',
    task_action: '回复邮件确认参加',
    task_due_at: '2026-11-12T18:00:00+08:00',
    task_due_display: '11月12日 周四 18:00',
    materials: [],
    source: sourceMail,
    source_title: sourceMail.title,
    image_url: null,
    quote: '诚邀参加 11 月 20 日「大模型时代的科研范式」讲座',
    created_at: '2026-11-08T20:35:00+08:00',
    conflict_count: 0,
    pending_count: 0,
  },
}

function candidateView(id) {
  const s = CAND_SPECS[id] ?? CAND_SPECS.evt_cand_1
  const fields = [
    field('title', '标题', null, [
      claim({
        value: s.title,
        display: s.title,
        quote: s.quote,
        source: s.source,
      }),
    ]),
    field('start_at', '活动时间', 'datetime', [
      claim({
        value: { iso: s.start_at, precision: 'datetime' },
        display: s.start_display,
        quote: s.quote,
        source: s.source,
      }),
    ]),
    field('location', '地点', null, [
      claim({
        value: s.location,
        display: s.location,
        quote: s.location,
        source: s.source,
      }),
    ]),
  ].map(fieldView)
  const task = {
    id: `cand_task_${id}`,
    action: s.task_action,
    state: 'open',
    due_at: s.task_due_at,
    due_display: s.task_due_display,
    materials: s.materials,
    submit_channel: null,
    fields: [],
  }
  return {
    id,
    title: s.title,
    state: 'candidate',
    org: '示例学院学生工作办公室',
    location: s.location,
    start_at: s.start_at,
    start_display: s.start_display,
    fields,
    tasks: [task],
    task_count: 1,
    open_task_count: 1,
    conflict_count: s.conflict_count,
    pending_count: s.pending_count,
    created_at: s.created_at,
    summary: s.summary,
    questions: s.question ? [s.question] : [],
    source: {
      id: s.source.id,
      kind: s.source.kind,
      title: s.source_title,
      image_url: s.image_url,
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
  // 官网同步 / IMAP 拉取等短任务：轮询 2 次后完成
  if (job.type === 'sync') {
    const done = job.polls >= 2
    return {
      id: job.id,
      state: done ? 'done' : 'running',
      stage: null,
      result: done ? { found: 3, created: 1, changed: 0 } : null,
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
        { key: 'crawl', name: '官网定时抓取', level: 'verified', note: '已实测：抓取你填写的公开列表页并逐篇读正文' },
        { key: 'site', name: '自定义站点检索', level: 'verified', note: '已实测：只在你声明的站点域名内限定检索' },
        { key: 'reminder', name: '到点提醒', level: 'verified', note: '已实测：按任务截止时间提前 2 小时提醒' },
        { key: 'imap', name: '邮箱 IMAP 拉取', level: 'unverified', note: '已实现只读拉取；缺真实账号，尚未验证' },
        { key: 'push', name: '多渠道推送', level: 'entry', note: '演示暂未接入，仅保留入口' },
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

  // ---------------------------------------------------------- 阶段一布局检查数据
  // 以下都是写死的假数据，仅用于无后端时检查布局，不代表真实同步/连接结果。

  const fromNow = (ms) => new Date(Date.now() + ms).toISOString()
  const MIN = 60 * 1000
  const HOUR = 60 * MIN

  const watchTargets = [
    {
      id: 'wt_1',
      name: '计算机学院 · 通知公告',
      url: 'https://cs.example.edu.cn/notice.htm',
      selector: null,
      cron: '0 8 * * *',
      enabled: true,
      last_run_at: fromNow(-35 * MIN),
      last_error: null,
      last_status: 'ok',
      source_count: 12,
    },
    {
      id: 'wt_2',
      name: '研究生院 · 学术活动',
      url: 'https://gs.example.edu.cn/activity.htm',
      selector: '.news-list li',
      cron: '0 8,18 * * *',
      enabled: true,
      last_run_at: fromNow(-2 * HOUR),
      last_error: '2 篇文章抓取失败：连接超时（activity/1027、activity/1028），已保留其余内容',
      last_status: 'partial',
      source_count: 5,
    },
    {
      id: 'wt_3',
      name: '就业指导中心 · 招聘信息',
      url: 'https://career.example.edu.cn/jobs.htm',
      selector: null,
      cron: null,
      enabled: false,
      last_run_at: null,
      last_error: null,
      last_status: 'never',
      source_count: 0,
    },
  ]

  const sites = [
    {
      id: 'site_1',
      name: '校图书馆活动',
      domain: 'lib.example.edu.cn',
      list_url: 'https://lib.example.edu.cn/activity.htm',
      search_url: 'https://lib.example.edu.cn/search?q={q}',
      enabled: true,
      created_at: fromNow(-3 * 24 * HOUR),
    },
  ]

  const mailImports = [
    {
      source_id: 'src_mail_1',
      subject: '关于 11 月 14 日田径运动会报名的通知',
      from: '体育部 <tyb@example.edu.cn>',
      date: fromNow(-26 * HOUR),
      job_state: 'done',
    },
    {
      source_id: 'src_mail_2',
      subject: '讲座：大模型时代的科研范式（11 月 20 日）',
      from: '研究生院 <gs@example.edu.cn>',
      date: fromNow(-2 * 24 * HOUR),
      job_state: 'running',
    },
    {
      source_id: 'src_mail_3',
      subject: '转发：食堂营业时间调整',
      from: '后勤处 <hqc@example.edu.cn>',
      date: fromNow(-3 * 24 * HOUR),
      job_state: 'failed',
    },
  ]

  // fire_at 相对当前时间生成，便于检查「已到点 / 未到点」两种状态
  let reminders = [
    { id: 'rem_1', task_id: 'task_1', event_id: 'evt_main', title: '提交宣讲会报名表', fire_at: fromNow(-10 * MIN), state: 'scheduled' },
    { id: 'rem_2', task_id: 'task_2', event_id: 'evt_main', title: '完成线上安全测试', fire_at: fromNow(90 * MIN), state: 'scheduled' },
    { id: 'rem_3', task_id: 'task_4', event_id: 'evt_main', title: '参加宣讲会', fire_at: fromNow(24 * HOUR), state: 'scheduled' },
  ]

  if (path === '/api/watch-targets' && method === 'GET') {
    return json(res, 200, { items: watchTargets })
  }
  if (path === '/api/watch-targets' && method === 'POST') {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const b = JSON.parse(body || '{}')
      const t = {
        id: `wt_${Date.now()}`,
        name: b.name ?? '未命名栏目',
        url: b.url ?? '',
        selector: b.selector ?? null,
        cron: b.cron ?? null,
        enabled: true,
        last_run_at: null,
        last_error: null,
        last_status: 'never',
        source_count: 0,
      }
      watchTargets.push(t)
      json(res, 200, t)
    })
    return
  }
  const wtMatch = path.match(/^\/api\/watch-targets\/([^/]+)$/)
  if (wtMatch && (method === 'PATCH' || method === 'DELETE')) {
    const t = watchTargets.find((x) => x.id === wtMatch[1])
    if (!t) return json(res, 404, { detail: '栏目不存在' })
    if (method === 'DELETE') {
      watchTargets.splice(watchTargets.indexOf(t), 1)
      return json(res, 200, { ok: true })
    }
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const b = JSON.parse(body || '{}')
      if (typeof b.enabled === 'boolean') t.enabled = b.enabled
      if (typeof b.name === 'string') t.name = b.name
      if (b.cron !== undefined) t.cron = b.cron
      json(res, 200, t)
    })
    return
  }
  const wtSyncMatch = path.match(/^\/api\/watch-targets\/([^/]+)\/sync$/)
  if (wtSyncMatch && method === 'POST') {
    const job = { id: `job_sync_${Date.now()}`, type: 'sync', polls: 0 }
    jobs.set(job.id, job)
    return json(res, 200, { job_id: job.id })
  }
  if (path === '/api/sync-runs' && method === 'GET') {
    return json(res, 200, {
      items: [
        {
          id: 'run_1',
          target_id: 'wt_1',
          started_at: fromNow(-35 * MIN),
          finished_at: fromNow(-34 * MIN),
          status: 'ok',
          found: 3,
          created: 1,
          changed: 0,
          error: null,
        },
      ],
    })
  }

  if (path === '/api/sites' && method === 'GET') {
    return json(res, 200, { items: sites })
  }
  if (path === '/api/sites' && method === 'POST') {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      const b = JSON.parse(body || '{}')
      const s = {
        id: `site_${Date.now()}`,
        name: b.name ?? '未命名站点',
        domain: b.domain ?? '',
        list_url: b.list_url ?? null,
        search_url: b.search_url ?? null,
        enabled: true,
        created_at: fromNow(0),
      }
      sites.push(s)
      json(res, 200, s)
    })
    return
  }
  const siteMatch = path.match(/^\/api\/sites\/([^/]+)$/)
  if (siteMatch && method === 'DELETE') {
    const i = sites.findIndex((x) => x.id === siteMatch[1])
    if (i >= 0) sites.splice(i, 1)
    return json(res, 200, { ok: true })
  }

  if (path === '/api/mail/import' && method === 'POST') {
    // 忽略 multipart 内容，只回契约形状
    req.on('data', () => {})
    req.on('end', () => {
      json(res, 200, { job_ids: [`job_mail_${Date.now()}`], source_ids: [`src_mail_${Date.now()}`] })
    })
    return
  }
  if (path === '/api/mail/imports' && method === 'GET') {
    return json(res, 200, { items: mailImports })
  }
  if (path === '/api/mail/imap/test' && method === 'POST') {
    // 布局服务没有真实邮箱，永远返回失败；真实环境才会返回连接结果
    req.resume()
    return json(res, 200, { ok: false, message: '布局检查服务没有真实邮箱可连，不代表后端能力' })
  }
  if (path === '/api/mail/imap/sync' && method === 'POST') {
    const job = { id: `job_imap_${Date.now()}`, type: 'sync', polls: 0 }
    jobs.set(job.id, job)
    return json(res, 200, { job_id: job.id })
  }
  if (path === '/api/mail/imap/status' && method === 'GET') {
    return json(res, 200, { configured: false, verified: false, last_sync_at: null, error: null })
  }

  if (path === '/api/reminders' && method === 'GET') {
    return json(res, 200, { items: reminders.filter((r) => r.state !== 'dismissed') })
  }
  if (path === '/api/reminders/sync' && method === 'POST') {
    return json(res, 200, { created: 0 })
  }
  const remMatch = path.match(/^\/api\/reminders\/([^/]+)\/dismiss$/)
  if (remMatch && method === 'POST') {
    const r = reminders.find((x) => x.id === remMatch[1])
    if (r) r.state = 'dismissed'
    return json(res, 200, { ok: true })
  }

  return json(res, 404, { detail: `mock 未实现：${method} ${path}` })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[ontime mock] 布局检查数据服务：http://127.0.0.1:${PORT}`)
  console.log('[ontime mock] 仅用于无后端时检查布局，不是真实识别/核实能力。')
})
