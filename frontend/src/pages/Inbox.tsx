import { useState } from 'react'
import { Link } from 'react-router-dom'
import { confirmEvent, decideMerge, getInbox, type Candidate, type Merge } from '../api'
import { Badge, EmptyState, ErrorBox, LoadingRow } from '../components/bits'
import { sourceKindText } from '../format'
import { useLoad } from '../hooks'

function CandidateCard({ c, busy, onAct }: { c: Candidate; busy: boolean; onAct: (fn: () => Promise<unknown>) => void }) {
  return (
    <article className="card">
      <div className="cand-body">
        <div className="cand-thumb">
          {c.source?.image_url ? (
            <img src={c.source.image_url} alt="来源截图" />
          ) : (
            <div className="thumb-fallback">{sourceKindText(c.source?.kind)}来源</div>
          )}
        </div>
        <div className="cand-main">
          <div className="cand-title-row">
            <h3>{c.title}</h3>
            <Badge tone="neutral">候选</Badge>
            {c.conflict_count > 0 && <Badge tone="warning">{c.conflict_count} 处冲突</Badge>}
          </div>
          {c.summary && <p className="cand-summary">{c.summary}</p>}
          {c.start_display && (
            <div className="kv-line">
              活动时间：<b>{c.start_display}</b>
            </div>
          )}
          {c.questions.length > 0 && (
            <div className="questions">
              {c.questions.map((q, i) => (
                <div key={i} className="q-item">
                  <span className="q-mark">问</span>
                  <span>{q}</span>
                </div>
              ))}
            </div>
          )}
          {c.tasks.length > 0 && (
            <ul className="mini-tasks">
              {c.tasks.map((t) => (
                <li key={t.id}>
                  <span>{t.action}</span>
                  <span className="muted">{t.due_display ?? '截止待确认'}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="muted" style={{ fontSize: 12 }}>
            来源：{c.source?.title ?? sourceKindText(c.source?.kind)}
          </div>
        </div>
      </div>
      <div className="card-foot">
        <Link className="btn" to={`/events/${c.id}`}>
          先看详情
        </Link>
        <button className="btn btn-primary" disabled={busy} onClick={() => onAct(() => confirmEvent(c.id))}>
          确认无误，加入行动台
        </button>
      </div>
    </article>
  )
}

function MergeCard({ m, busy, onAct }: { m: Merge; busy: boolean; onAct: (fn: () => Promise<unknown>) => void }) {
  return (
    <article className="card">
      <div className="card-head">
        <h3>疑似同一件事</h3>
        <Badge tone="info">相似度 {Math.round(m.score * 100)}%</Badge>
      </div>
      <div className="merge-vs">
        <div className="merge-side">
          <span className="muted">已有事件</span>
          <b>{m.a.title}</b>
          <span className="muted">{m.a.start_display ?? '时间待确认'}</span>
        </div>
        <span className="merge-arrow" aria-hidden>
          ⇄
        </span>
        <div className="merge-side">
          <span className="muted">新收录</span>
          <b>{m.b.title}</b>
          <span className="muted">{m.b.start_display ?? '时间待确认'}</span>
        </div>
      </div>
      {m.reasons.length > 0 && (
        <div className="chips" style={{ marginBottom: 12 }}>
          {m.reasons.map((r, i) => (
            <span key={i} className="chip">
              {r}
            </span>
          ))}
        </div>
      )}
      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 130 }}>项目</th>
            <th>旧值</th>
            <th>新值</th>
          </tr>
        </thead>
        <tbody>
          {m.diff.map((d, i) => (
            <tr key={i}>
              <td className="muted">{d.label}</td>
              <td className="diff-old">{d.old ?? <span className="muted">（无）</span>}</td>
              <td className="diff-new">{d.new ?? <span className="muted">（无）</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="card-foot">
        <button className="btn" disabled={busy} onClick={() => onAct(() => decideMerge(m.id, 'reject'))}>
          不是同一件事
        </button>
        <button className="btn btn-primary" disabled={busy} onClick={() => onAct(() => decideMerge(m.id, 'accept'))}>
          合并为同一事件
        </button>
      </div>
    </article>
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
        <div className="card">
          <EmptyState
            title="收件箱是空的"
            desc="去「收录」上传一张截图、粘贴一段文字，识别出的内容会先出现在这里等你确认。"
            action={
              <Link className="btn btn-primary" to="/capture">
                去收录
              </Link>
            }
          />
        </div>
      )}

      {candidates.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="section-title">
            <h2>候选事件</h2>
            <span className="muted">{candidates.length} 条待确认</span>
          </div>
          {candidates.map((c) => (
            <CandidateCard key={c.id} c={c} busy={busyId === c.id} onAct={(fn) => void act(c.id, fn)} />
          ))}
        </section>
      )}

      {merges.length > 0 && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="section-title">
            <h2>合并建议</h2>
            <span className="muted">{merges.length} 条待确认</span>
          </div>
          {merges.map((m) => (
            <MergeCard key={m.id} m={m} busy={busyId === m.id} onAct={(fn) => void act(m.id, fn)} />
          ))}
        </section>
      )}
    </>
  )
}
