import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  applyFinding,
  confirmEvent,
  decideClaim,
  getEvent,
  icsUrl,
  patchEvent,
  startVerify,
  toggleTask,
  type Claim,
  type EventDetail,
  type Field,
  type Task,
  type VerifyResult,
} from '../api'
import { Badge, EmptyState, ErrorBox, LoadingRow, Quote, Spinner, StatusDot, statusText } from '../components/bits'
import { fmtClock, originText } from '../format'
import { usePollJob } from '../hooks'

const TIME_FIELD_KEYS = new Set(['start_at', 'end_at', 'due_at'])

function stateBadge(state: EventDetail['state']) {
  if (state === 'candidate') return <Badge tone="warning">候选 · 待确认</Badge>
  if (state === 'confirmed') return <Badge tone="success">已确认</Badge>
  return <Badge tone="neutral">已忽略</Badge>
}

function AnchorInput({ field, busy, onPatch }: { field: Field; busy: boolean; onPatch: (k: string, v: string) => void }) {
  const [value, setValue] = useState('')
  const isTime = TIME_FIELD_KEYS.has(field.key)
  return (
    <div className="anchor-box">
      <span>缺少日期依据，待确认。可以直接补上：</span>
      <input
        className="input"
        type={isTime ? 'datetime-local' : 'text'}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={isTime ? '如 2026-11-12 14:00' : '填写正确内容'}
      />
      <button className="btn btn-sm btn-primary" disabled={!value.trim() || busy} onClick={() => onPatch(field.key, value)}>
        保存
      </button>
    </div>
  )
}

function ClaimList({
  claims,
  busy,
  onDecide,
}: {
  claims: Claim[]
  busy: boolean
  onDecide: (claimId: string, action: 'accept' | 'reject') => void
}) {
  if (claims.length === 0) return <div className="claim-empty muted">暂无字段出处。</div>
  return (
    <ul className="claim-list">
      {claims.map((c) => (
        <li key={c.id} className={c.status === 'rejected' ? 'claim rejected' : 'claim'}>
          <div className="claim-head">
            <StatusDot status={c.status} />
            <span>{statusText(c.status)}</span>
            <span className="muted">{originText(c.origin)}</span>
            {c.source && (
              <span className="claim-src">
                {c.source.image_url && (
                  <a href={c.source.image_url} target="_blank" rel="noreferrer">
                    打开原图
                  </a>
                )}
                {c.source.url && (
                  <a href={c.source.url} target="_blank" rel="noreferrer">
                    打开链接
                  </a>
                )}
                <span className="muted">{c.source.title ?? ''}</span>
              </span>
            )}
          </div>
          {c.quote && <Quote text={c.quote} />}
          {c.status === 'user_confirmed' ? (
            <div>
              <Badge tone="success">已采纳</Badge>
            </div>
          ) : c.status !== 'rejected' ? (
            <div className="claim-actions">
              <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => onDecide(c.id, 'accept')}>
                采纳
              </button>
              <button className="btn btn-sm" disabled={busy} onClick={() => onDecide(c.id, 'reject')}>
                拒绝
              </button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

function FieldRow({
  field,
  busy,
  canPatch,
  onDecide,
  onPatch,
}: {
  field: Field
  busy: boolean
  canPatch: boolean
  onDecide: (claimId: string, action: 'accept' | 'reject') => void
  onPatch: (fieldKey: string, value: string) => void
}) {
  // 冲突字段默认展开，避免漏看候选值
  const [open, setOpen] = useState(field.status === 'conflict')
  const options = field.claims.filter((c) => c.status !== 'rejected')
  const hasClaims = field.claims.length > 0
  return (
    <div className="field-row">
      <button className="field-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <StatusDot status={field.status} />
        <span className="field-label">{field.label}</span>
        <span className="field-display">
          {field.display ?? (field.status === 'needs_anchor' ? '待确认' : '—')}
        </span>
        {hasClaims && <span className="muted field-count">{`${field.claims.length} 条出处`}</span>}
        <span className="chev">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="field-body">
          {field.status === 'needs_anchor' &&
            (canPatch ? (
              <AnchorInput field={field} busy={busy} onPatch={onPatch} />
            ) : (
              <div className="anchor-box" style={{ marginBottom: 12 }}>
                <span>缺少日期依据，待确认。</span>
              </div>
            ))}
          {field.status === 'conflict' && options.length > 1 && (
            <div className="conflict-panel">
              <div className="panel-note">同一字段有不同说法，请选择要保留的那个（不会自动覆盖）：</div>
              <div className="conflict-options">
                {options.map((c) => (
                  <div key={c.id} className="conflict-option">
                    <div className="co-value">{c.display ?? String(c.value ?? '—')}</div>
                    <div className="co-src muted">{c.source?.title ?? '未知来源'}</div>
                    <div className="co-actions">
                      <button className="btn btn-sm btn-primary" disabled={busy} onClick={() => onDecide(c.id, 'accept')}>
                        采用
                      </button>
                      <button className="btn btn-sm" disabled={busy} onClick={() => onDecide(c.id, 'reject')}>
                        拒绝
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          <ClaimList claims={field.claims} busy={busy} onDecide={onDecide} />
        </div>
      )}
    </div>
  )
}

function TaskCard({
  task,
  busy,
  onToggle,
  onDecide,
}: {
  task: Task
  busy: boolean
  onToggle: () => void
  onDecide: (claimId: string, action: 'accept' | 'reject') => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="task-card">
      <div className="task-line">
        <input
          type="checkbox"
          checked={task.state === 'done'}
          disabled={busy}
          onChange={onToggle}
          aria-label={task.action}
        />
        <div className="task-main">
          <span className={task.state === 'done' ? 'task-action done-struck' : 'task-action'}>{task.action}</span>
          <span className="muted" style={{ fontSize: 13 }}>
            截止：{task.due_display ?? '待确认'}
            {task.submit_channel ? ` · 提交方式：${task.submit_channel}` : ''}
          </span>
        </div>
        {task.materials.length > 0 && (
          <div className="chips">
            {task.materials.map((m, i) => (
              <span key={i} className="chip">
                {m}
              </span>
            ))}
          </div>
        )}
        <button className="link-btn" onClick={() => setOpen((o) => !o)}>
          {open ? '收起出处' : '查看出处'}
        </button>
      </div>
      {open && (
        <div className="task-fields">
          {task.fields.map((f) => (
            <FieldRow key={f.key} field={f} busy={busy} canPatch={false} onDecide={onDecide} onPatch={() => undefined} />
          ))}
        </div>
      )}
    </div>
  )
}

function VerifyPanel({ eventId, onRefresh }: { eventId: string; onRefresh: () => Promise<void> }) {
  const [jobId, setJobId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [applying, setApplying] = useState<string | null>(null)
  const [applied, setApplied] = useState<Set<string>>(new Set())
  const job = usePollJob(jobId, 1000)

  const running = jobId !== null && job?.state !== 'done' && job?.state !== 'failed'
  const result = job?.state === 'done' && job.result ? (job.result as VerifyResult) : null

  async function start() {
    setError(null)
    try {
      const res = await startVerify(eventId)
      setApplied(new Set())
      setJobId(res.job_id)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function apply(f: VerifyResult['findings'][number]) {
    if (applying) return
    setApplying(f.id)
    setError(null)
    try {
      await applyFinding({
        event_id: eventId,
        field: f.field,
        value: f.value,
        quote: f.quote,
        source_id: f.source_id,
        impact: f.impact,
      })
      setApplied((prev) => new Set(prev).add(f.id))
      await onRefresh()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setApplying(null)
    }
  }

  const banner =
    result === null
      ? null
      : result.status === 'found'
        ? { cls: 'ok', title: '找到可对照的官方内容' }
        : result.status === 'conflict'
          ? { cls: 'warn', title: '核实结果与当前记录存在冲突' }
          : { cls: 'none', title: '未找到明确适用的官方依据' }

  return (
    <section className="card">
      <div className="card-head">
        <h2>联网核实</h2>
        <button className="btn btn-sm btn-primary" disabled={running} onClick={() => void start()}>
          {jobId === null ? '联网核实' : '再次核实'}
        </button>
      </div>
      <div className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
        真实检索公开网页并对照原文；结果只作补充候选，写入前由你确认。核实需要 8–20 秒，可以离开页面。
      </div>
      {error && <ErrorBox>{error}</ErrorBox>}
      {running && (
        <div className="loading-row">
          <Spinner label="正在检索公开网页并核对原文…" />
        </div>
      )}
      {job?.state === 'failed' && <ErrorBox onRetry={() => void start()}>{job.error ?? '核实失败'}</ErrorBox>}
      {result && banner && (
        <div>
          <div className={`verify-banner ${banner.cls}`}>
            <b>{banner.title}</b>
            <span>{result.message}</span>
          </div>
          {result.status !== 'not_found' &&
            result.findings.map((f) => (
              <div key={f.id} className={`finding f-${f.state}`}>
                <div className="finding-head">
                  {f.state === 'supported' && <Badge tone="success">官网支持</Badge>}
                  {f.state === 'conflict' && <Badge tone="warning">与当前记录冲突</Badge>}
                  {f.state === 'needs_review' && <Badge tone="gray">待复核</Badge>}
                  {f.impact === 'high' && <Badge tone="warning">高影响</Badge>}
                  <b>{f.label}</b>
                  <span className="finding-value">{f.display ?? String(f.value ?? '')}</span>
                </div>
                <Quote text={f.quote} />
                <div className="finding-foot">
                  <a className="source-link" href={f.source_url} target="_blank" rel="noreferrer">
                    {f.source_title}
                  </a>
                  {f.official && <Badge tone="success">官方来源</Badge>}
                  {f.note && <span className="muted">{f.note}</span>}
                  {f.state === 'needs_review' ? (
                    <span className="muted">适用性复核未通过，建议先不采用</span>
                  ) : applied.has(f.id) ? (
                    <Badge tone="success">已写入</Badge>
                  ) : (
                    <button className="btn btn-sm" disabled={applying === f.id} onClick={() => void apply(f)}>
                      {applying === f.id ? '写入中…' : '作为补充写入'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          {result.status === 'not_found' && (
            <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>
              没有给出任何结论。可以补充说明后再次核实，或直接咨询负责部门。
            </div>
          )}
          {result.sources.length > 0 && (
            <>
              <div className="subhead">查看了这些页面</div>
              <ul className="verify-sources">
                {result.sources.map((s) => (
                  <li key={s.id}>
                    <a href={s.url} target="_blank" rel="noreferrer" className="source-link">
                      {s.title}
                    </a>
                    <span className="domain">{s.domain}</span>
                    {s.official && <Badge tone="success">官方</Badge>}
                    <span className="muted">{s.chars} 字</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="muted" style={{ fontSize: 12, marginTop: 12 }}>
            核实时间：{fmtClock(result.checked_at)}
            {result.query.length > 0 && ` · 检索词：${result.query.join('；')}`}
          </div>
        </div>
      )}
    </section>
  )
}

export default function EventDetail() {
  const { id = '' } = useParams()
  const [detail, setDetail] = useState<EventDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setDetail(await getEvent(id))
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    setLoading(true)
    void load()
  }, [load])

  async function run(fn: () => Promise<unknown>) {
    if (busy) return
    setBusy(true)
    setActionError(null)
    try {
      await fn()
      await load()
    } catch (e) {
      setActionError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const onDecide = (claimId: string, action: 'accept' | 'reject') => void run(() => decideClaim(claimId, action))
  const onPatch = (fieldKey: string, value: string) => void run(() => patchEvent(id, fieldKey, value))

  if (loading && !detail) return <LoadingRow />
  if (!detail) {
    return (
      <>
        {error && <ErrorBox onRetry={() => void load()}>{error}</ErrorBox>}
        <EmptyState
          title="看不到这个事件"
          desc={error ?? '它可能已被合并或删除。'}
          action={
            <Link className="btn" to="/">
              回到行动台
            </Link>
          }
        />
      </>
    )
  }

  return (
    <>
      <div className="detail-head">
        <div style={{ minWidth: 0 }}>
          <h1>{detail.title}</h1>
          <div className="head-sub">
            {stateBadge(detail.state)}
            {detail.start_display && (
              <>
                <span className="sep">·</span>
                <span>{detail.start_display}</span>
              </>
            )}
            {detail.location && (
              <>
                <span className="sep">·</span>
                <span>{detail.location}</span>
              </>
            )}
            {detail.org && (
              <>
                <span className="sep">·</span>
                <span>{detail.org}</span>
              </>
            )}
          </div>
        </div>
        <div className="head-actions">
          {detail.state === 'candidate' && (
            <button className="btn btn-primary" disabled={busy} onClick={() => void run(() => confirmEvent(id))}>
              确认事件
            </button>
          )}
          <a className="btn" href={icsUrl(id)}>
            导出日历
          </a>
        </div>
      </div>

      {detail.merge_id && (
        <Link to="/inbox" className="pending-banner">
          这个事件有一条合并建议待处理
          <span className="banner-arrow">→</span>
        </Link>
      )}

      {actionError && <ErrorBox>{actionError}</ErrorBox>}

      <section className="card">
        <div className="card-head">
          <h2>字段与出处</h2>
          <span className="muted">点开任意一行，查看原文片段与来源</span>
        </div>
        <div>
          {detail.fields.map((f) => (
            <FieldRow key={f.key} field={f} busy={busy} canPatch onDecide={onDecide} onPatch={onPatch} />
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>任务清单</h2>
          {detail.tasks.length > 0 && (
            <span className="muted">
              {detail.open_task_count > 0 ? `${detail.open_task_count} 件未完成` : '都完成了'}
            </span>
          )}
        </div>
        {detail.tasks.length === 0 ? (
          <div className="muted">这个事件没有需要你做的任务。</div>
        ) : (
          <div>
            {detail.tasks.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                busy={busy}
                onToggle={() => void run(() => toggleTask(t.id))}
                onDecide={onDecide}
              />
            ))}
          </div>
        )}
      </section>

      <VerifyPanel eventId={id} onRefresh={load} />

      <section className="card">
        <div className="card-head">
          <h2>规则与要求</h2>
          <span className="muted">高影响条款必须有原文依据，否则显示「未确认」</span>
        </div>
        {detail.rules.length === 0 ? (
          <div className="muted">没有提取到规则条款。</div>
        ) : (
          <div>
            {detail.rules.map((r) => {
              const evidence = r.claims.find((c) => c.status === 'supported' || c.status === 'user_confirmed')
              const unconfirmed = r.impact === 'high' && !evidence
              return (
                <div key={r.id} className={unconfirmed ? 'rule-row rule-unconfirmed' : 'rule-row'}>
                  <div className="rule-text">
                    {r.impact === 'high' &&
                      (evidence ? <Badge tone="warning">高影响</Badge> : <Badge tone="gray">高影响 · 未确认</Badge>)}
                    <span>{r.text}</span>
                  </div>
                  {evidence ? (
                    <div className="rule-src">
                      <Quote text={evidence.quote ?? r.text} />
                      <span className="muted">来源：{evidence.source?.title ?? '未知'}</span>
                      {evidence.source?.url && (
                        <a href={evidence.source.url} target="_blank" rel="noreferrer">
                          打开链接
                        </a>
                      )}
                      {evidence.source?.image_url && (
                        <a href={evidence.source.image_url} target="_blank" rel="noreferrer">
                          打开原图
                        </a>
                      )}
                    </div>
                  ) : (
                    <div className="rule-src muted">未找到明确适用的官方依据，请以负责部门说法为准。</div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>历史</h2>
          <span className="muted">只追加，不覆盖</span>
        </div>
        {detail.history.length === 0 ? (
          <div className="muted">还没有记录。</div>
        ) : (
          <ul className="timeline">
            {[...detail.history].reverse().map((h, i) => (
              <li key={i}>
                <span className="tl-dot" />
                <div className="tl-body">
                  <div className="tl-head">
                    <b>{h.label}</b>
                    <StatusDot status={h.status} />
                    <span className="muted">{statusText(h.status)}</span>
                  </div>
                  <div className="tl-val">{h.display ?? '（待确认）'}</div>
                  <div className="tl-sub muted">
                    {fmtClock(h.at)} · {originText(h.origin)}
                    {h.source ? ` · ${h.source}` : ''}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
