// ------------------------------------------------------------------
// 唯一请求封装。类型按 docs/API契约_v1.md（冻结）手写，字段以契约为准。
// ------------------------------------------------------------------

export type ClaimStatus =
  | 'supported'
  | 'user_confirmed'
  | 'conflict'
  | 'needs_anchor'
  | 'insufficient'
  | 'rejected'

export type ClaimOrigin = 'model' | 'user' | 'rule' | 'import'

export type ClaimSourceKind = 'screenshot' | 'text' | 'web' | 'mail' | 'link'

export type ClaimSource = {
  id: string
  kind: ClaimSourceKind
  title: string | null
  url: string | null
  image_url: string | null
  published_at: string | null
}

export type Claim = {
  id: string
  value: unknown
  display: string | null
  status: ClaimStatus
  origin: ClaimOrigin
  quote: string | null
  quote_start: number | null
  quote_end: number | null
  source: ClaimSource | null
}

export type Field = {
  key: string
  label: string
  value: unknown
  display: string | null
  /** 契约：Claim.status，另有 unconfirmed（无任何依据） */
  status: ClaimStatus | 'unconfirmed'
  precision: 'date' | 'datetime' | 'range' | null
  claims: Claim[]
}

export type Task = {
  id: string
  action: string
  state: 'open' | 'done' | 'dismissed'
  due_at: string | null
  due_display: string | null
  materials: string[]
  submit_channel: string | null
  fields: Field[]
}

export type EventBrief = {
  id: string
  title: string
  /** 列表不含 merged；直接打开已合并事件 URL 时为 merged */
  state: 'candidate' | 'confirmed' | 'ignored' | 'merged'
  org: string | null
  location: string | null
  start_at: string | null
  start_display: string | null
  fields: Field[]
  tasks: Task[]
  task_count: number
  open_task_count: number
  conflict_count: number
  pending_count: number
  created_at: string
}

export type EventDetail = EventBrief & {
  rules: { id: string; text: string; impact: 'high' | 'normal'; state: string; claims: Claim[] }[]
  sources: {
    id: string
    kind: string
    title: string | null
    url: string | null
    image_url: string | null
    fetched_at: string
    published_at: string | null
    excerpt: string
  }[]
  history: {
    at: string
    field: string
    label: string
    display: string | null
    status: string
    origin: string
    source: string | null
    kind: string | null
  }[]
  merge_id: string | null
}

export type TaskRow = {
  id: string
  event_id: string
  event_title: string
  action: string
  due_at: string | null
  due_display: string | null
  state: 'open' | 'done' | 'dismissed'
}

export type TodayData = {
  events: EventBrief[]
  tasks: TaskRow[]
  candidates: number
}

export type Candidate = EventBrief & {
  summary: string | null
  questions: string[]
  source: { id: string | null; kind: string | null; title: string | null; image_url: string | null }
}

export type MergeDiffRow = {
  kind: 'add' | 'change' | 'task'
  field: string
  label: string
  old: string | null
  new: string | null
}

export type Merge = {
  id: string
  /** 后端为 0–5 的匹配分，不是百分比 */
  score: number
  reasons: string[]
  state: 'pending'
  a: { id: string; title: string; start_display: string | null }
  b: { id: string; title: string; start_display: string | null }
  diff: MergeDiffRow[]
}

export type InboxData = {
  candidates: Candidate[]
  merges: Merge[]
  changes: unknown[]
  counts: { candidates: number; merges: number; changes: number }
}

export type JobStep = { key: string; label: string; state: 'todo' | 'active' | 'done' | 'failed' }
export type JobStage = { stage: string; steps: JobStep[]; message: string | null } | null

export type JobData = {
  id: string
  state: 'queued' | 'running' | 'done' | 'failed'
  stage: JobStage
  result: unknown
  error: string | null
}

export type VerifyResult = {
  status: 'found' | 'conflict' | 'not_found'
  message: string
  query: string[]
  sources: { id: string; title: string; url: string; domain: string; official: boolean; chars: number }[]
  findings: {
    id: string
    field: string
    label: string
    value: unknown
    display: string | null
    quote: string
    source_id: string
    source_title: string
    source_url: string
    official: boolean
    state: 'supported' | 'conflict' | 'needs_review'
    impact: 'high' | 'normal'
    note: string
  }[]
  checked_at: string
  /** 仅 POST /api/verify/url 返回；检索路径没有该字段 */
  mode?: 'url'
}

export type Capability = { key: string; name: string; level: 'live' | 'entry'; note: string }

// ------------------------------------------------------------------
// 请求
// ------------------------------------------------------------------

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, init)
  } catch {
    throw new ApiError('无法连接服务，请确认后端已启动（端口 8000）', 0)
  }
  if (!res.ok) {
    let message = res.status >= 500 ? '服务暂时不可用（后端未启动？）' : `请求失败（${res.status}）`
    try {
      const data = (await res.json()) as { detail?: unknown }
      if (data && typeof data.detail === 'string') message = data.detail
    } catch {
      // 非 JSON 响应体，保留默认文案
    }
    throw new ApiError(message, res.status)
  }
  return (await res.json()) as T
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

export function getHealth() {
  return request<{ ok: boolean; db: string; model: { ok: boolean; model: string; error?: string } }>(
    '/api/health',
  )
}

export function getCapabilities() {
  return request<{ items: Capability[] }>('/api/capabilities')
}

export function getToday() {
  return request<TodayData>('/api/today')
}

export function getInbox() {
  return request<InboxData>('/api/inbox')
}

export function getEvent(id: string) {
  return request<EventDetail>(`/api/events/${encodeURIComponent(id)}`)
}

export function getJob(id: string) {
  return request<JobData>(`/api/jobs/${encodeURIComponent(id)}`)
}

export function ingestScreenshot(file: File) {
  const form = new FormData()
  form.append('file', file)
  return request<{ job_id: string; source_id: string }>('/api/ingest/screenshot', {
    method: 'POST',
    body: form,
  })
}

export function ingestText(text: string, title?: string) {
  return request<{ job_id: string; source_id: string }>('/api/ingest/text', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ text, title: title || undefined }),
  })
}

export function confirmEvent(id: string) {
  return request<EventDetail>(`/api/events/${encodeURIComponent(id)}/confirm`, { method: 'POST' })
}

export function patchEvent(id: string, field: string, value: string) {
  return request<EventDetail>(`/api/events/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ field, value }),
  })
}

export function startVerify(id: string) {
  return request<{ job_id: string }>(`/api/events/${encodeURIComponent(id)}/verify`, {
    method: 'POST',
  })
}

/** 检索兜底：不搜索，只抓取用户提供的官方链接并逐字段核对。 */
export function verifyByUrl(eventId: string, url: string) {
  return request<VerifyResult>('/api/verify/url', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ event_id: eventId, url }),
  })
}

export function applyFinding(body: {
  event_id: string
  field: string
  value: unknown
  quote: string
  source_id: string
  impact: string
}) {
  return request<EventDetail>('/api/findings/apply', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  })
}

export function decideClaim(id: string, action: 'accept' | 'reject') {
  return request<{ ok: boolean; status: string }>(`/api/claims/${encodeURIComponent(id)}/decide`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ action }),
  })
}

export function decideMerge(id: string, action: 'accept' | 'reject') {
  return request<{ ok: boolean; state: string; event_id?: string }>(
    `/api/merge/${encodeURIComponent(id)}`,
    { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ action }) },
  )
}

export function toggleTask(id: string) {
  return request<{ ok: boolean; state: Task['state'] }>(`/api/tasks/${encodeURIComponent(id)}/toggle`, {
    method: 'POST',
  })
}

export function resetDemo() {
  return request<{ ok: boolean }>('/api/demo/reset', { method: 'POST' })
}

/** 导出日历：契约返回 text/calendar 文件流，直接用链接下载。 */
export function icsUrl(id: string) {
  return `/api/events/${encodeURIComponent(id)}/ics`
}
