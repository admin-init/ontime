import { useCallback, useEffect, useRef, useState } from 'react'
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
  verifyByUrl,
  type Claim,
  type EventDetail,
  type Field,
  type Task,
  type VerifyResult,
} from '../api'
import {
  Badge,
  EmptyState,
  ErrorBox,
  LoadingRow,
  Quote,
  Spinner,
  StatusDot,
  StatusMark,
  statusText,
} from '../components/bits'
import { fmtClock, originText, sourceKindText } from '../format'
import { usePollJob } from '../hooks'

const TIME_FIELD_KEYS = new Set(['start_at', 'end_at', 'due_at'])

function stateBadge(state: EventDetail['state']) {
  if (state === 'candidate') return <Badge tone="accent">候选 · 待确认</Badge>
  if (state === 'confirmed') return <StatusMark status="user_confirmed" label="已确认" />
  if (state === 'merged') return <Badge tone="neutral">已并入其他事件</Badge>
  return <Badge tone="neutral">已忽略</Badge>
}

function fieldFallback(field: Field): string {
  if (field.status === 'needs_anchor') return '缺少日期依据，待确认'
  if (field.status === 'conflict') return '两种说法，待选择'
  if (field.status === 'insufficient') return '信息不足'
  if (field.status === 'unconfirmed') return '未确认'
  return '—'
}

function SourceRef({ source }: { source: Claim['source'] }) {
  if (!source) return null
  return (
    <span className="source-ref">
      {source.image_url && (
        <a className="source-thumb" href={source.image_url} target="_blank" rel="noreferrer" aria-label="查看来源截图">
          <img src={source.image_url} alt="" />
        </a>
      )}
      <span className="source-ref-main">
        <span className="source-name">{source.title ?? `${sourceKindText(source.kind)}来源`}</span>
        <span className="meta">{sourceKindText(source.kind)}</span>
      </span>
      {source.image_url && (
        <a className="text-btn" href={source.image_url} target="_blank" rel="noreferrer">
          查看原图
        </a>
      )}
      {source.url && (
        <a className="text-btn" href={source.url} target="_blank" rel="noreferrer">
          查看链接
        </a>
      )}
    </span>
  )
}

function AnchorInput({
  field,
  busy,
  onPatch,
}: {
  field: Field
  busy: boolean
  onPatch: (k: string, v: string) => void
}) {
  const [value, setValue] = useState('')
  const isTime = TIME_FIELD_KEYS.has(field.key)
  return (
    <div className="anchor">
      <div className="anchor-label">缺少日期依据，待确认。可以直接补上：</div>
      <div className="anchor-row">
        <input
          className="input"
          type={isTime ? 'datetime-local' : 'text'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={isTime ? '如 2026-11-12 14:00' : '填写正确内容'}
          aria-label="补充字段内容"
        />
        <button
          className="btn btn-sm btn-primary"
          disabled={!value.trim() || busy}
          onClick={() => onPatch(field.key, value)}
        >
          保存
        </button>
      </div>
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
  if (claims.length === 0) return <div className="claim-empty">暂无字段出处。</div>
  return (
    <div className="claim-list">
      {claims.map((c) => {
        const emptyClaim = c.value === null
        return (
          <div key={c.id} className={c.status === 'rejected' ? 'claim is-rejected' : 'claim'}>
            <div className="claim-head">
              <StatusMark status={c.status} />
              <span className="meta">{originText(c.origin)}</span>
              <SourceRef source={c.source} />
            </div>
            {c.quote && <Quote text={c.quote} />}
            {c.status === 'user_confirmed' ? (
              <div className="claim-actions">
                <span className="meta">已采纳</span>
                <button className="text-btn" disabled={busy} onClick={() => onDecide(c.id, 'reject')}>
                  撤销
                </button>
              </div>
            ) : c.status !== 'rejected' ? (
              <div className="claim-actions">
                {emptyClaim ? (
                  <span className="meta">缺少具体内容，可拒绝此说法或在上方补充。</span>
                ) : (
                  <button className="text-btn is-strong" disabled={busy} onClick={() => onDecide(c.id, 'accept')}>
                    采纳
                  </button>
                )}
                <button className="text-btn" disabled={busy} onClick={() => onDecide(c.id, 'reject')}>
                  拒绝
                </button>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function ConflictChooser({
  options,
  busy,
  onDecide,
}: {
  options: Claim[]
  busy: boolean
  onDecide: (claimId: string, action: 'accept' | 'reject') => void
}) {
  const [selected, setSelected] = useState<string | null>(null)
  const [kept, setKept] = useState(false)

  return (
    <div className="conflict">
      <div className="conflict-hint">同一字段有两种说法。选择一种保存，另一种仍会留在历史里。</div>
      <div className="conflict-choices" role="radiogroup" aria-label="字段候选值">
        {options.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={selected === c.id}
            className={selected === c.id ? 'conflict-choice is-selected' : 'conflict-choice'}
            onClick={() => {
              setSelected(c.id)
              setKept(false)
            }}
          >
            <span className="pick-mark" aria-hidden />
            <span className="co-value">{c.display ?? String(c.value ?? '—')}</span>
            <span className="co-source">{c.source?.title ?? '未知来源'}</span>
            {c.quote && <span className="co-quote">{c.quote}</span>}
          </button>
        ))}
      </div>
      <div className="conflict-actions">
        <button
          className="btn btn-sm btn-primary"
          disabled={!selected || busy}
          onClick={() => selected && onDecide(selected, 'accept')}
        >
          采用所选
        </button>
        <button
          className="text-btn"
          onClick={() => {
            setSelected(null)
            setKept(true)
          }}
        >
          保留
        </button>
        <span className="meta">
          {kept ? '已保留两种说法，字段仍待确认。' : selected ? '确认后将按所选内容更新。' : '先选一种说法'}
        </span>
      </div>
    </div>
  )
}

function FieldRow({
  field,
  busy,
  canPatch,
  defaultOpen = false,
  onDecide,
  onPatch,
}: {
  field: Field
  busy: boolean
  canPatch: boolean
  defaultOpen?: boolean
  onDecide: (claimId: string, action: 'accept' | 'reject') => void
  onPatch: (fieldKey: string, value: string) => void
}) {
  // 只有第一条冲突默认展开；其余字段保持行内提示，避免一屏被撑满
  const [open, setOpen] = useState(defaultOpen)
  const options = field.claims.filter((c) => c.status !== 'rejected')
  const isConflict = field.status === 'conflict' && options.length > 1

  return (
    <div className={open ? 'field-row is-open' : 'field-row'}>
      <button className="field-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="field-label">{field.label}</span>
        <span className={field.display ? 'field-value' : 'field-value is-empty'}>
          {field.display ?? fieldFallback(field)}
        </span>
        <span className="field-state">
          <StatusDot status={field.status} />
          <span>{statusText(field.status)}</span>
        </span>
        <span className="field-caret" aria-hidden>
          {open ? '−' : '+'}
        </span>
      </button>
      {open && (
        <div className="field-detail">
          {field.status === 'needs_anchor' &&
            (canPatch ? (
              <AnchorInput field={field} busy={busy} onPatch={onPatch} />
            ) : (
              <div className="meta">缺少日期依据，待确认。</div>
            ))}
          {isConflict ? (
            <ConflictChooser options={options} busy={busy} onDecide={onDecide} />
          ) : (
            <ClaimList claims={field.claims} busy={busy} onDecide={onDecide} />
          )}
        </div>
      )}
    </div>
  )
}

function TaskItem({
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
    <li className={task.state === 'done' ? 'task-item is-done' : 'task-item'}>
      <div className="task-row">
        <input
          type="checkbox"
          checked={task.state === 'done'}
          disabled={busy}
          onChange={onToggle}
          aria-label={task.action}
        />
        <div className="task-main">
          <span className="task-action">{task.action}</span>
          <span className="task-meta">
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
        <button className="text-btn" onClick={() => setOpen((o) => !o)}>
          {open ? '收起出处' : '出处'}
        </button>
      </div>
      {open && (
        <div className="task-detail">
          {task.fields.map((f) => (
            <FieldRow key={f.key} field={f} busy={busy} canPatch={false} onDecide={onDecide} onPatch={() => undefined} />
          ))}
        </div>
      )}
    </li>
  )
}

function VerifyResultView({
  result,
  applying,
  applied,
  onApply,
}: {
  result: VerifyResult
  applying: string | null
  applied: Set<string>
  onApply: (f: VerifyResult['findings'][number]) => void
}) {
  const banner =
    result.status === 'found'
      ? { cls: 'found', status: 'supported', title: '找到可对照的官方内容' }
      : result.status === 'conflict'
        ? { cls: 'conflict', status: 'conflict', title: '核实结果与当前记录存在冲突' }
        : { cls: 'none', status: 'unconfirmed', title: '未找到明确适用的官方依据' }

  return (
    <div className="verify">
      <div className={`verify-state is-${banner.cls}`}>
        <StatusMark status={banner.status} label={banner.title} />
        <p>{result.message}</p>
      </div>
      {result.status !== 'not_found' && (
        <div className="finding-list">
          {result.findings.map((f) => (
            <div key={f.id} className="finding">
              <div className="finding-head">
                {f.state === 'supported' && <StatusMark status="supported" label="官网支持" />}
                {f.state === 'conflict' && <StatusMark status="conflict" label="与当前记录冲突" />}
                {f.state === 'needs_review' && <StatusMark status="needs_anchor" label="待复核" />}
                {f.impact === 'high' && <Badge tone="warn">高影响</Badge>}
                <b>{f.label}</b>
                <span className="finding-value">{f.display ?? String(f.value ?? '')}</span>
              </div>
              <Quote text={f.quote} />
              <div className="finding-foot">
                <a className="source-link" href={f.source_url} target="_blank" rel="noreferrer">
                  {f.source_title}
                </a>
                {f.official && <span className="meta">官方来源</span>}
                {f.note && <span className="meta">{f.note}</span>}
                {f.state === 'needs_review' ? (
                  <span className="meta">适用性复核未通过，建议先不采用</span>
                ) : applied.has(f.id) ? (
                  <span className="meta">已写入</span>
                ) : (
                  <button className="text-btn is-strong" disabled={applying === f.id} onClick={() => onApply(f)}>
                    {applying === f.id ? '写入中…' : '作为补充写入'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {result.status === 'not_found' && (
        <p className="block-note">没有给出任何结论。可以补充说明后再次核实，或直接咨询负责部门。</p>
      )}
      {result.sources.length > 0 && (
        <div className="verify-sources">
          <h4>查看了这些页面</h4>
          <ul>
            {result.sources.map((s) => (
              <li key={s.id}>
                <a href={s.url} target="_blank" rel="noreferrer" className="source-link">
                  {s.title}
                </a>
                <span className="meta">{s.domain}</span>
                {s.official && <span className="meta">官方</span>}
                <span className="meta">{s.chars} 字</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="meta verify-time">
        核实时间：{fmtClock(result.checked_at)}
        {result.mode === 'url'
          ? result.query.length > 0 && ` · 核对链接：${result.query[0]}`
          : result.query.length > 0 && ` · 检索词：${result.query.join('；')}`}
      </div>
    </div>
  )
}

function VerifyPanel({ eventId, onRefresh }: { eventId: string; onRefresh: () => Promise<void> }) {
  const [jobId, setJobId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [applying, setApplying] = useState<string | null>(null)
  const [applied, setApplied] = useState<Set<string>>(new Set())
  const [urlResult, setUrlResult] = useState<VerifyResult | null>(null)
  const [url, setUrl] = useState('')
  const [urlBusy, setUrlBusy] = useState(false)
  const job = usePollJob(jobId, 1000)

  const running = jobId !== null && job?.state !== 'done' && job?.state !== 'failed'
  const searchResult = job?.state === 'done' && job.result ? (job.result as VerifyResult) : null
  // 用户提供的链接核实结果优先展示，避免与上一次搜索结论混在一起
  const result = urlResult ?? searchResult
  const showUrlEntry = result?.status === 'not_found' && !running && !urlBusy

  async function start() {
    setError(null)
    setUrlResult(null)
    try {
      const res = await startVerify(eventId)
      setApplied(new Set())
      setJobId(res.job_id)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  async function checkUrl() {
    const value = url.trim()
    if (!value || urlBusy) return
    setError(null)
    setUrlBusy(true)
    try {
      const res = await verifyByUrl(eventId, value)
      setUrlResult(res)
      setApplied(new Set())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUrlBusy(false)
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

  return (
    <section className="block">
      <div className="section-head">
        <h2>
          联网核实
          {result?.mode === 'url' && <span className="verify-origin">来源：你提供的链接</span>}
        </h2>
        <button className="btn btn-secondary btn-sm" disabled={running || urlBusy} onClick={() => void start()}>
          {jobId === null ? '联网核实' : '再次核实'}
        </button>
      </div>
      <p className="block-note">
        真实检索公开网页并对照原文；结果只作补充候选，写入前由你确认。核实需要 8–20 秒，可以离开页面。
      </p>
      {error && <ErrorBox>{error}</ErrorBox>}
      {running && (
        <div className="loading-row">
          <Spinner label="正在检索公开网页并核对原文…" />
        </div>
      )}
      {job?.state === 'failed' && <ErrorBox onRetry={() => void start()}>{job.error ?? '核实失败'}</ErrorBox>}
      {urlBusy ? (
        <div className="loading-row">
          <Spinner label="正在抓取你提供的链接并核对原文…" />
        </div>
      ) : (
        result && <VerifyResultView result={result} applying={applying} applied={applied} onApply={(f) => void apply(f)} />
      )}
      {showUrlEntry && (
        <form
          className="url-check"
          onSubmit={(e) => {
            e.preventDefault()
            void checkUrl()
          }}
        >
          <label className="url-check-label" htmlFor="verify-url">
            已有官方链接？粘贴后核对
          </label>
          <div className="url-check-row">
            <input
              id="verify-url"
              className="input"
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="粘贴官方页面链接（https://…）"
              autoComplete="off"
            />
            <button className="btn btn-primary btn-sm" type="submit" disabled={!url.trim() || urlBusy}>
              核对这个链接
            </button>
          </div>
        </form>
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
  const [exported, setExported] = useState(false)
  const exportTimer = useRef<number | null>(null)

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
  const firstConflictKey = detail?.fields.find((f) => f.status === 'conflict')?.key

  function markExported() {
    if (exportTimer.current !== null) window.clearTimeout(exportTimer.current)
    setExported(true)
    exportTimer.current = window.setTimeout(() => setExported(false), 1500)
  }

  if (loading && !detail) return <LoadingRow />
  if (!detail) {
    return (
      <>
        {error && <ErrorBox onRetry={() => void load()}>{error}</ErrorBox>}
        <EmptyState
          title="看不到这个事件"
          desc={error ?? '它可能已被合并或删除。'}
          action={
            <Link className="text-btn" to="/">
              回到行动台
            </Link>
          }
        />
      </>
    )
  }

  return (
    <>
      <div className="page-head detail-head">
        <div className="detail-title">
          <h1>{detail.title}</h1>
          <div className="head-sub">
            {stateBadge(detail.state)}
            {detail.start_display && (
              <>
                <span className="dot-sep">·</span>
                <span>{detail.start_display}</span>
              </>
            )}
            {detail.location && (
              <>
                <span className="dot-sep">·</span>
                <span>{detail.location}</span>
              </>
            )}
            {detail.org && (
              <>
                <span className="dot-sep">·</span>
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
          <a className="btn btn-secondary" href={icsUrl(id)} onClick={markExported}>
            导出日历
          </a>
          {exported && (
            <span className="export-feedback" role="status">
              已导出日历
            </span>
          )}
        </div>
      </div>

      {actionError && <ErrorBox>{actionError}</ErrorBox>}

      {detail.merge_id && (
        <Link to="/inbox" className="merge-line">
          <span>有一条合并建议待处理</span>
          <span aria-hidden>→</span>
        </Link>
      )}

      <div className="detail-grid">
        <div className="detail-main">
          <section className="block">
            <div className="section-head">
              <h2>字段与出处</h2>
              <span className="meta section-hint">点开任意一行，查看原文片段与来源</span>
            </div>
            <div className="field-list">
              {detail.fields.map((f) => (
                <FieldRow
                  key={f.key}
                  field={f}
                  busy={busy}
                  canPatch
                  defaultOpen={f.key === firstConflictKey}
                  onDecide={onDecide}
                  onPatch={onPatch}
                />
              ))}
            </div>
          </section>

          <section className="block">
            <div className="section-head">
              <h2>任务清单</h2>
              {detail.tasks.length > 0 && (
                <span className="meta">
                  {detail.open_task_count > 0 ? `${detail.open_task_count} 件未完成` : '都完成了'}
                </span>
              )}
            </div>
            {detail.tasks.length === 0 ? (
              <p className="block-note">这个事件没有需要你做的任务。</p>
            ) : (
              <ul className="task-list">
                {detail.tasks.map((t) => (
                  <TaskItem
                    key={t.id}
                    task={t}
                    busy={busy}
                    onToggle={() => void run(() => toggleTask(t.id))}
                    onDecide={onDecide}
                  />
                ))}
              </ul>
            )}
          </section>

          <VerifyPanel eventId={id} onRefresh={load} />

          <section className="block">
            <div className="section-head">
              <h2>规则与要求</h2>
              <span className="meta section-hint">高影响条款必须有原文依据</span>
            </div>
            {detail.rules.length === 0 ? (
              <p className="block-note">没有提取到规则条款。</p>
            ) : (
              <div className="rule-list">
                {detail.rules.map((r) => {
                  const evidence = r.claims.find(
                    (c) => c.status === 'supported' || c.status === 'user_confirmed',
                  )
                  const unconfirmed = r.impact === 'high' && !evidence
                  return (
                    <div key={r.id} className="rule">
                      <div className="rule-text">
                        {r.impact === 'high' &&
                          (evidence ? (
                            <Badge tone="warn">高影响</Badge>
                          ) : (
                            <StatusMark status="needs_anchor" label="高影响 · 未确认" />
                          ))}
                        <span>{r.text}</span>
                      </div>
                      {evidence ? (
                        <div className="rule-src">
                          <Quote text={evidence.quote ?? r.text} />
                          <div className="rule-source-line">
                            <span className="meta">来源：{evidence.source?.title ?? '未知'}</span>
                            {evidence.source?.url && (
                              <a className="text-btn" href={evidence.source.url} target="_blank" rel="noreferrer">
                                查看链接
                              </a>
                            )}
                            {evidence.source?.image_url && (
                              <a
                                className="text-btn"
                                href={evidence.source.image_url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                查看原图
                              </a>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="rule-src">{unconfirmed ? '未找到明确适用的官方依据，请以负责部门说法为准。' : ''}</div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>

          <section className="block">
            <div className="section-head">
              <h2>历史</h2>
              <span className="meta">只追加，不覆盖</span>
            </div>
            {detail.history.length === 0 ? (
              <p className="block-note">还没有记录。</p>
            ) : (
              <ol className="history-list">
                {[...detail.history].reverse().map((h, i) => (
                  <li key={i}>
                    <time>{fmtClock(h.at)}</time>
                    <div className="history-main">
                      <div className="history-head">
                        <b>{h.label}</b>
                        <StatusMark status={h.status} />
                        <span className="history-value">{h.display ?? '待确认'}</span>
                      </div>
                      <div className="meta">
                        {originText(h.origin)}
                        {h.source ? ` · ${h.source}` : ''}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <aside className="detail-aside">
          {detail.merge_id && (
            <Link to="/inbox" className="side-link aside-merge">
              <span>有一条合并建议待处理</span>
              <span aria-hidden>→</span>
            </Link>
          )}
          <section className="side-block">
            <div className="section-head">
              <h2>来源</h2>
              <span className="meta">{detail.sources.length} 条</span>
            </div>
            {detail.sources.length === 0 ? (
              <p className="block-note">这个事件还没有关联来源。</p>
            ) : (
              <ul className="source-list">
                {detail.sources.map((s, i) => (
                  <li key={s.id}>
                    {s.image_url ? (
                      <a
                        className="side-thumb"
                        href={s.image_url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`查看来源截图：${s.title ?? ''}`}
                      >
                        <img src={s.image_url} alt="" />
                      </a>
                    ) : (
                      <span className="source-index">{String(i + 1).padStart(2, '0')}</span>
                    )}
                    <div className="source-main">
                      {s.url ? (
                        <a className="source-link" href={s.url} target="_blank" rel="noreferrer">
                          {s.title ?? s.url}
                        </a>
                      ) : (
                        <span className="source-name">{s.title ?? sourceKindText(s.kind)}</span>
                      )}
                      <span className="meta">
                        {sourceKindText(s.kind)}
                        {s.published_at ? ` · ${fmtClock(s.published_at)}` : ''}
                      </span>
                      {s.excerpt && <p className="source-excerpt">{s.excerpt}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <p className="side-note">字段与来源一一对应；冲突与合并都由你确认，历史只追加、不覆盖。</p>
        </aside>
      </div>
    </>
  )
}
