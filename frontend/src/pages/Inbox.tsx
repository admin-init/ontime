import { useState } from 'react'
import { Link } from 'react-router-dom'
import { confirmEvent, decideMerge, getInbox, type Candidate, type Merge } from '../api'
import { Badge, EmptyState, ErrorBox, LoadingRow } from '../components/bits'
import { sourceKindText } from '../format'
import { useLoad } from '../hooks'

function CandidateItem({
  c,
  busy,
  onAct,
}: {
  c: Candidate
  busy: boolean
  onAct: (fn: () => Promise<unknown>) => void
}) {
  return (
    <li className="candidate-item">
      <div className="candidate-thumb">
        {c.source?.image_url ? (
          <img src={c.source.image_url} alt="来源截图" />
        ) : (
          <span>{sourceKindText(c.source?.kind)}来源</span>
        )}
      </div>
      <div className="candidate-main">
        <div className="item-title-row">
          <h3>{c.title}</h3>
          <Badge tone="accent">候选</Badge>
          {c.conflict_count > 0 && <Badge tone="warn">{c.conflict_count} 处冲突</Badge>}
        </div>
        {c.summary && <p className="candidate-summary">{c.summary}</p>}
        <div className="candidate-meta">
          {c.start_display && (
            <span>
              活动时间 <b>{c.start_display}</b>
            </span>
          )}
          <span>来源 {c.source?.title ?? sourceKindText(c.source?.kind)}</span>
        </div>
        {c.questions.length > 0 && (
          <div className="question-list">
            {c.questions.map((q, i) => (
              <div key={i} className="question">
                {q}
              </div>
            ))}
          </div>
        )}
        {c.tasks.length > 0 && (
          <div className="candidate-tasks">
            {c.tasks.map((t) => (
              <span key={t.id}>
                {t.action}
                <span className="meta"> · {t.due_display ?? '截止待确认'}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="item-actions">
        <Link className="text-btn" to={`/events/${c.id}`}>
          先看详情
        </Link>
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => onAct(() => confirmEvent(c.id))}>
          确认收录
        </button>
      </div>
    </li>
  )
}

function MergeItem({
  m,
  busy,
  onAct,
}: {
  m: Merge
  busy: boolean
  onAct: (fn: () => Promise<unknown>) => void
}) {
  return (
    <li className="merge-item">
      <div className="item-title-row">
        <h3>疑似同一件事</h3>
        <span className="meta">匹配分 {m.score.toFixed(1)}</span>
      </div>
      <div className="merge-pair">
        <div className="merge-side">
          <span className="merge-label">已有事件</span>
          <b>{m.a.title}</b>
          <span className="meta">{m.a.start_display ?? '时间待确认'}</span>
        </div>
        <div className="merge-side">
          <span className="merge-label">新收录</span>
          <b>{m.b.title}</b>
          <span className="meta">{m.b.start_display ?? '时间待确认'}</span>
        </div>
      </div>
      {m.reasons.length > 0 && <div className="reason-line">{m.reasons.join(' · ')}</div>}

      <div className="diff">
        <div className="diff-row diff-head">
          <span>字段</span>
          <span>旧</span>
          <span>新</span>
        </div>
        {m.diff.map((d, i) => (
          <div key={i} className="diff-row">
            <span className="diff-label">{d.label}</span>
            <span className="diff-old">{d.old ?? '无'}</span>
            <span className="diff-new">{d.new ?? '无'}</span>
          </div>
        ))}
      </div>

      <div className="item-actions is-end">
        <button className="text-btn" disabled={busy} onClick={() => onAct(() => decideMerge(m.id, 'reject'))}>
          不是同一件事
        </button>
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => onAct(() => decideMerge(m.id, 'accept'))}>
          合并为同一事件
        </button>
      </div>
    </li>
  )
}

export default function Inbox() {
  const { data, error, loading, refresh } = useLoad(() => getInbox())
  const [busyId, setBusyId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  async function act(id: string, fn: () => Promise<unknown>) {
    if (busyId) return
    setBusyId(id)
    setActionError(null)
    try {
      await fn()
      await refresh()
    } catch (e) {
      setActionError((e as Error).message)
    } finally {
      setBusyId(null)
    }
  }

  const candidates = data?.candidates ?? []
  const merges = data?.merges ?? []
  const isEmpty = !loading && !error && candidates.length === 0 && merges.length === 0

  return (
    <>
      <div className="page-head">
        <div>
          <h1>收件箱</h1>
          <div className="page-sub">新收录的内容先到这里：确认无误才进入行动台，合并与覆盖都由你决定。</div>
        </div>
      </div>

      {error && <ErrorBox onRetry={() => void refresh()}>{error}</ErrorBox>}
      {actionError && <ErrorBox>{actionError}</ErrorBox>}
      {loading && <LoadingRow />}

      {isEmpty && (
        <EmptyState
          title="收件箱是空的"
          desc="去「收录」上传一张截图、粘贴一段文字，识别出的内容会先出现在这里等你确认。"
          action={
            <Link className="text-btn" to="/capture">
              去收录
            </Link>
          }
        />
      )}

      {candidates.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>候选事件</h2>
            <span className="meta">{candidates.length} 条待确认</span>
          </div>
          <ul className="item-list">
            {candidates.map((c) => (
              <CandidateItem key={c.id} c={c} busy={busyId === c.id} onAct={(fn) => void act(c.id, fn)} />
            ))}
          </ul>
        </section>
      )}

      {merges.length > 0 && (
        <section className="section">
          <div className="section-head">
            <h2>合并建议</h2>
            <span className="meta">{merges.length} 条待确认</span>
          </div>
          <ul className="item-list">
            {merges.map((m) => (
              <MergeItem key={m.id} m={m} busy={busyId === m.id} onAct={(fn) => void act(m.id, fn)} />
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
