import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getToday, toggleTask, type TaskRow, type TodayData } from '../api'
import { Badge, EmptyState, ErrorBox, LoadingRow } from '../components/bits'
import { greeting, todayLine } from '../format'

const WEEK_MS = 7 * 24 * 3600 * 1000

export default function Today() {
  const [data, setData] = useState<TodayData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<Set<string>>(new Set())

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await getToday())
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const tasks: TaskRow[] = []
  if (data) {
    // 只有已确认的事件才进入行动台；候选事件的任务留在收件箱里确认。
    const confirmed = new Set(data.events.map((ev) => ev.id))
    const horizon = Date.now() + WEEK_MS
    for (const t of data.tasks) {
      if (!confirmed.has(t.event_id)) continue
      if (t.state === 'dismissed' || !t.due_at) continue
      if (new Date(t.due_at).getTime() > horizon) continue
      tasks.push(t)
    }
    // open 优先，再按截止时间升序（与 due_display 一致）
    tasks.sort((a, b) => {
      if (a.state !== b.state) return a.state === 'open' ? -1 : 1
      return (a.due_at ?? '').localeCompare(b.due_at ?? '')
    })
  }
  const openCount = tasks.filter((t) => t.state === 'open').length

  async function onToggle(t: TaskRow) {
    if (toggling.has(t.id)) return
    setToggling((prev) => new Set(prev).add(t.id))
    const next = t.state === 'open' ? 'done' : 'open'
    // 先改本地，勾选不等待网络
    setData((prev) =>
      prev ? { ...prev, tasks: prev.tasks.map((x) => (x.id === t.id ? { ...x, state: next } : x)) } : prev,
    )
    try {
      await toggleTask(t.id)
    } catch (e) {
      setError((e as Error).message)
      void load()
    } finally {
      setToggling((prev) => {
        const s = new Set(prev)
        s.delete(t.id)
        return s
      })
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{greeting()}</h1>
          <div className="page-sub">{todayLine()}</div>
        </div>
      </div>

      {error && <ErrorBox onRetry={() => void load()}>{error}</ErrorBox>}
      {loading && !data && <LoadingRow />}

      {data && data.candidates > 0 && (
        <Link to="/inbox" className="pending-banner">
          有 <b>{data.candidates}</b> 条新收录的内容等待你确认
          <span className="banner-arrow">→</span>
        </Link>
      )}

      <section className="card">
        <div className="card-head">
          <h2>近 7 天要做的事</h2>
          {tasks.length > 0 && (
            <span className="muted">{openCount > 0 ? `${openCount} 件未完成` : '都完成了'}</span>
          )}
        </div>
        {tasks.length === 0 ? (
          <EmptyState
            title="近 7 天没有要截止的事"
            desc="收录新的通知后，要做的事会按截止时间排在这里。"
            action={
              <Link className="btn" to="/capture">
                去收录
              </Link>
            }
          />
        ) : (
          <ul className="task-list">
            {tasks.map((t) => {
              const overdue = t.state === 'open' && t.due_at && new Date(t.due_at).getTime() < Date.now()
              return (
                <li key={t.id} className={t.state === 'done' ? 'task-row-done' : ''}>
                  <input
                    type="checkbox"
                    checked={t.state === 'done'}
                    disabled={toggling.has(t.id)}
                    onChange={() => void onToggle(t)}
                    aria-label={t.action}
                  />
                  <div className="task-main">
                    <span className="task-action">{t.action}</span>
                    <Link to={`/events/${t.event_id}`} className="task-event">
                      {t.event_title}
                    </Link>
                  </div>
                  <span className={overdue ? 'task-due overdue' : 'task-due'}>
                    {overdue ? '已逾期 · ' : ''}
                    {t.due_display}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="card">
        <div className="card-head">
          <h2>已确认事件</h2>
          {data && data.events.length > 0 && <span className="muted">共 {data.events.length} 个</span>}
        </div>
        {!data || data.events.length === 0 ? (
          <EmptyState
            title="还没有已确认的事件"
            desc="在收件箱里确认候选事件后，它会出现在这里，并进入日历导出。"
            action={
              <Link className="btn" to="/inbox">
                打开收件箱
              </Link>
            }
          />
        ) : (
          <ul className="row-list">
            {data.events.map((ev) => (
              <li key={ev.id}>
                <Link to={`/events/${ev.id}`} className="event-row">
                  <div className="event-main">
                    <span className="event-title">{ev.title}</span>
                    <span className="event-sub muted">
                      {[ev.start_display, ev.location, ev.org].filter(Boolean).join(' · ') || '时间待确认'}
                    </span>
                  </div>
                  <div className="event-meta">
                    {ev.conflict_count > 0 && <Badge tone="warning">{ev.conflict_count} 处冲突</Badge>}
                    {ev.pending_count > 0 && <Badge tone="neutral">{ev.pending_count} 项待确认</Badge>}
                    <Badge tone={ev.open_task_count > 0 ? 'success' : 'neutral'}>
                      {ev.open_task_count > 0 ? `${ev.open_task_count} 件待办` : '无待办'}
                    </Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
