import { useEffect, useState } from 'react'
import {
  createWatchTarget,
  deleteWatchTarget,
  getWatchTargets,
  patchWatchTarget,
  syncWatchTarget,
  type WatchStatus,
  type WatchTarget,
} from '../../api'
import { Badge, ErrorBox, LoadingRow } from '../../components/bits'
import { fmtClock } from '../../format'
import { useLoad, usePollJob } from '../../hooks'

const STATUS_BADGE: Record<WatchStatus, { tone: 'success' | 'warn' | 'danger' | 'muted'; label: string }> = {
  ok: { tone: 'success', label: '正常' },
  partial: { tone: 'warn', label: '部分成功' },
  failed: { tone: 'danger', label: '失败' },
  never: { tone: 'muted', label: '未同步' },
}

export default function WatchTargetsSection() {
  const { data, error, loading, refresh } = useLoad(() => getWatchTargets())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // 立即同步：POST 拿 job_id 后轮询，结束刷新列表（一次同步一条）
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const job = usePollJob(jobId, 1500)

  // 添加表单
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [selector, setSelector] = useState('')
  const [cron, setCron] = useState('')
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    if (!job) return
    if (job.state === 'done' || job.state === 'failed') {
      if (job.state === 'failed') setActionError(job.error ?? '同步失败，请稍后重试')
      setJobId(null)
      setSyncingId(null)
      void refresh()
    }
  }, [job, refresh])

  const items = data?.items ?? []

  async function onToggle(t: WatchTarget) {
    if (busyId) return
    setBusyId(t.id)
    setActionError(null)
    try {
      await patchWatchTarget(t.id, { enabled: !t.enabled })
      await refresh()
    } catch (e) {
      setActionError((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  async function onSync(t: WatchTarget) {
    if (syncingId) return
    setActionError(null)
    setSyncingId(t.id)
    try {
      const res = await syncWatchTarget(t.id)
      setJobId(res.job_id)
    } catch (e) {
      setActionError((e as Error).message)
      setSyncingId(null)
    }
  }

  async function onDelete(t: WatchTarget) {
    if (busyId) return
    setBusyId(t.id)
    setActionError(null)
    try {
      await deleteWatchTarget(t.id)
      setConfirmId(null)
      await refresh()
    } catch (e) {
      setActionError((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  async function onAdd() {
    if (adding) return
    if (!name.trim() || !url.trim()) return
    if (!/^https?:\/\//i.test(url.trim())) {
      setActionError('列表页地址需要以 http:// 或 https:// 开头')
      return
    }
    setAdding(true)
    setActionError(null)
    try {
      await createWatchTarget({
        name: name.trim(),
        url: url.trim(),
        selector: selector.trim() || undefined,
        cron: cron.trim() || undefined,
      })
      setName('')
      setUrl('')
      setSelector('')
      setCron('')
      await refresh()
    } catch (e) {
      setActionError((e as Error).message)
    } finally {
      setAdding(false)
    }
  }

  return (
    <section className="section">
      <div className="section-head">
        <h2>官网栏目</h2>
        <span className="meta section-hint">定时抓取你填写的公开列表页，新内容先进收件箱待确认</span>
      </div>

      {error && <ErrorBox onRetry={() => void refresh()}>{error}</ErrorBox>}
      {actionError && <ErrorBox>{actionError}</ErrorBox>}
      {loading && <LoadingRow />}

      {!loading && !error && items.length === 0 && (
        <p className="block-note">还没有官网栏目。在下方填入名称和列表页地址即可添加。</p>
      )}

      {items.length > 0 && (
        <ul className="src-list">
          {items.map((t) => {
            const badge = STATUS_BADGE[t.last_status] ?? STATUS_BADGE.never
            return (
              <li key={t.id} className="src-item">
                <div className="src-main">
                  <div className="src-title">
                    <span className="src-name">{t.name}</span>
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                    {!t.enabled && <Badge tone="muted">已停用</Badge>}
                  </div>
                  <div className="src-sub">
                    <span className="src-url">{t.url}</span>
                    <span className="meta">
                      上次同步 {t.last_run_at ? fmtClock(t.last_run_at) : '从未'}
                      {t.source_count > 0 ? ` · 已收录 ${t.source_count} 篇` : ''}
                      {t.cron ? ` · ${t.cron}` : ''}
                    </span>
                  </div>
                  {t.last_error && <div className="src-error">{t.last_error}</div>}
                </div>
                <div className="src-actions">
                  <label className="src-toggle">
                    <input
                      type="checkbox"
                      checked={t.enabled}
                      disabled={busyId !== null}
                      onChange={() => void onToggle(t)}
                      aria-label={`启用「${t.name}」`}
                    />
                    启用
                  </label>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={busyId !== null || syncingId !== null}
                    onClick={() => void onSync(t)}
                  >
                    {syncingId === t.id ? '同步中…' : '立即同步'}
                  </button>
                  {confirmId === t.id ? (
                    <>
                      <button
                        className="text-btn is-danger"
                        disabled={busyId !== null}
                        onClick={() => void onDelete(t)}
                      >
                        确认删除
                      </button>
                      <button className="text-btn" disabled={busyId !== null} onClick={() => setConfirmId(null)}>
                        取消
                      </button>
                    </>
                  ) : (
                    <button className="text-btn" disabled={busyId !== null} onClick={() => setConfirmId(t.id)}>
                      删除
                    </button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="add-form">
        <div className="add-grid">
          <input
            className="input"
            placeholder="栏目名称，如：学院通知"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="input"
            placeholder="列表页地址，https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <div className="add-grid">
          <input
            className="input"
            placeholder="条目 CSS 选择器（可选，留空自动识别）"
            value={selector}
            onChange={(e) => setSelector(e.target.value)}
          />
          <input
            className="input"
            placeholder="定时规则 cron（可选，如 0 8 * * *）"
            value={cron}
            onChange={(e) => setCron(e.target.value)}
          />
        </div>
        <div className="form-foot">
          <span className="meta">同步抓到的内容先进收件箱待确认；正文有变化时并列展示，不会静默覆盖。</span>
          <button
            className="btn btn-primary btn-sm"
            disabled={adding || !name.trim() || !url.trim()}
            onClick={() => void onAdd()}
          >
            {adding ? '添加中…' : '添加栏目'}
          </button>
        </div>
      </div>
    </section>
  )
}
