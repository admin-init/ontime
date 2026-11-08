// ------------------------------------------------------------------
// 唯一请求封装。类型按 docs/API契约_v1.md（冻结）与 docs/API契约_v1.1_阶段一.md
// 手写，字段以契约为准。
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

/** 契约 v1.1：level 增加 verified（已实现且实测）/ unverified（已实现但缺条件验证） */
export type CapabilityLevel = 'verified' | 'live' | 'unverified' | 'entry'

export type Capability = { key: string; name: string; level: CapabilityLevel; note: string }

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

// ------------------------------------------------------------------
// 阶段一（契约 v1.1）：官网同步 / 自定义站点 / 邮件 / 提醒
// ------------------------------------------------------------------

export type WatchStatus = 'never' | 'ok' | 'partial' | 'failed'

export type WatchTarget = {
  id: string
  name: string
  url: string
  selector: string | null
  cron: string | null
  enabled: boolean
  last_run_at: string | null
  last_error: string | null
  last_status: WatchStatus
  source_count: number
}

export type SyncRun = {
  id: string
  target_id: string
  started_at: string
  finished_at: string | null
  status: 'running' | 'ok' | 'partial' | 'failed'
  found: number
  created: number
  changed: number
  error: string | null
}

export type Site = {
  id: string
  name: string
  domain: string
  list_url: string | null
  search_url: string | null
  enabled: boolean
  created_at: string
}

export type MailImport = {
  source_id: string
  subject: string | null
  from: string | null
  date: string | null
  job_state: string
}

export type ImapStatus = {
  configured: boolean
  verified: boolean
  last_sync_at: string | null
  error: string | null
}

export type Reminder = {
  id: string
  task_id: string
  event_id: string | null
  title: string
  fire_at: string
  state: 'scheduled' | 'sent' | 'dismissed'
}

export function getWatchTargets() {
  return request<{ items: WatchTarget[] }>('/api/watch-targets')
}

export function createWatchTarget(body: { name: string; url: string; selector?: string; cron?: string }) {
  return request<WatchTarget>('/api/watch-targets', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  })
}

export function patchWatchTarget(id: string, body: { name?: string; enabled?: boolean; cron?: string | null }) {
  return request<WatchTarget>(`/api/watch-targets/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  })
}

export function deleteWatchTarget(id: string) {
  return request<{ ok: boolean }>(`/api/watch-targets/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function syncWatchTarget(id: string) {
  return request<{ job_id: string }>(`/api/watch-targets/${encodeURIComponent(id)}/sync`, { method: 'POST' })
}

export function getSyncRuns(targetId?: string, limit = 20) {
  const qs = new URLSearchParams({ limit: String(limit) })
  if (targetId) qs.set('target_id', targetId)
  return request<{ items: SyncRun[] }>(`/api/sync-runs?${qs.toString()}`)
}

export function getSites() {
  return request<{ items: Site[] }>('/api/sites')
}

export function createSite(body: { name: string; domain: string; list_url?: string; search_url?: string }) {
  return request<Site>('/api/sites', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  })
}

export function deleteSite(id: string) {
  return request<{ ok: boolean }>(`/api/sites/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/** 导入 .eml / .mbox：multipart 字段名 file，返回逐封邮件的处理 job。 */
export function importMail(file: File) {
  const form = new FormData()
  form.append('file', file)
  return request<{ job_ids: string[]; source_ids: string[] }>('/api/mail/import', {
    method: 'POST',
    body: form,
  })
}

export function getMailImports() {
  return request<{ items: MailImport[] }>('/api/mail/imports')
}

export function testImap(body: { host: string; port: number; username: string; password: string }) {
  return request<{ ok: boolean; message: string }>('/api/mail/imap/test', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  })
}

export function syncImap(body: {
  host: string
  port: number
  username: string
  password: string
  since_days?: number
  query?: string
}) {
  return request<{ job_id: string }>('/api/mail/imap/sync', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  })
}

export function getImapStatus() {
  return request<ImapStatus>('/api/mail/imap/status')
}

export function getReminders() {
  return request<{ items: Reminder[] }>('/api/reminders')
}

/** 按 open 任务的 due_at 生成提醒（默认提前 2 小时），后端去重。 */
export function syncReminders() {
  return request<{ created: number }>('/api/reminders/sync', { method: 'POST' })
}

export function dismissReminder(id: string) {
  return request<{ ok: boolean }>(`/api/reminders/${encodeURIComponent(id)}/dismiss`, { method: 'POST' })
}
