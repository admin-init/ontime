import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getToday, toggleTask, type TaskRow, type TodayData } from '../api'
import { Badge, EmptyState, ErrorBox, LoadingRow } from '../components/bits'
import { greeting, todayLine } from '../format'

const DAY_MS = 24 * 3600 * 1000

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

type Group = { key: string; label: string; tasks: TaskRow[] }

function groupTasks(tasks: TaskRow[], now = new Date()): Group[] {
  const today = startOfDay(now)
  const tomorrow = addDays(today, 1)
  // 中文习惯周一为一周开始；周日属于本周最后一天，之后的日期进入「更晚」
  const weekIndex = (today.getDay() + 6) % 7
  const nextWeek = addDays(today, 7 - weekIndex)

  const buckets: Record<string, TaskRow[]> = { today: [], tomorrow: [], week: [], later: [], done: [] }
  for (const t of tasks) {
    if (!t.due_at) continue
    const due = new Date(t.due_at)
    if (Number.isNaN(due.getTime())) continue
    if (t.state === 'done') {
      buckets.done.push(t)
      continue
    }
    if (due < tomorrow) buckets.today.push(t)
    else if (due < addDays(tomorrow, 1)) buckets.tomorrow.push(t)
    else if (due < nextWeek) buckets.week.push(t)
    else buckets.later.push(t)
  }

  const byDue = (a: TaskRow, b: TaskRow) => (a.due_at ?? '').localeCompare(b.due_at ?? '')
  return [
    { key: 'today', label: '今天', tasks: buckets.today.sort(byDue) },
    { key: 'tomorrow', label: '明天', tasks: buckets.tomorrow.sort(byDue) },
    { key: 'week', label: '本周', tasks: buckets.week.sort(byDue) },
    { key: 'later', label: '更晚', tasks: buckets.later.sort(byDue) },
    { key: 'done', label: '已完成', tasks: buckets.done.sort(byDue) },
  ].filter((g) => g.tasks.length > 0)
}

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

  let groups: Group[] = []
  if (data) {
    // 只有已确认的事件才进入行动台；候选事件的任务留在收件箱里确认。
    const confirmed = new Set(data.events.map((ev) => ev.id))
    const horizon = Date.now() + 8 * DAY_MS
    const visible = data.tasks.filter(
      (t) =>
        confirmed.has(t.event_id) &&
        t.state !== 'dismissed' &&
        t.due_at !== null &&
        new Date(t.due_at).getTime() < horizon,
    )
    groups = groupTasks(visible)
  }

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
        <Link to="/inbox" className="pending-line">
          <span>有 {data.candidates} 条新收录等待确认</span>
          <span className="pending-line-arrow">→</span>
        </Link>
      )}

      <section className="section">
        <div className="section-head">
          <h2>近 7 天要做的事</h2>
          {groups.length > 0 && (
            <span className="meta">
              {groups.filter((g) => g.key !== 'done').reduce((n, g) => n + g.tasks.length, 0)} 件未完成
            </span>
          )}
        </div>
        {groups.length === 0 ? (
          <EmptyState
            title="近 7 天没有要截止的事"
            desc="收录新的通知后，要做的事会按截止时间排在这里。"
            action={
              <Link className="text-btn" to="/capture">
                去收录
              </Link>
            }
          />
        ) : (
          <div className="task-groups">
            {groups.map((g) => (
              <div key={g.key} className="task-group">
                <h3 className="group-title">{g.label}</h3>
                <ul className="task-list">
                  {g.tasks.map((t) => {
                    const overdue = t.state === 'open' && t.due_at && new Date(t.due_at).getTime() < Date.now()
                    return (
                      <li key={t.id} className={t.state === 'done' ? 'task-row is-done' : 'task-row'}>
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
                        <span className={overdue ? 'task-due is-overdue' : 'task-due'}>
                          {overdue ? '已逾期 · ' : ''}
                          {t.due_display}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head">
          <h2>已确认事件</h2>
          {data && data.events.length > 0 && <span className="meta">共 {data.events.length} 个</span>}
        </div>
        {!data || data.events.length === 0 ? (
          <EmptyState
            title="还没有已确认的事件"
            desc="在收件箱里确认候选事件后，它会出现在这里，并进入日历导出。"
            action={
              <Link className="text-btn" to="/inbox">
                打开收件箱
              </Link>
            }
          />
        ) : (
          <ul className="event-list">
            {data.events.map((ev) => (
              <li key={ev.id}>
                <Link to={`/events/${ev.id}`} className="event-row">
                  <div className="event-main">
                    <span className="event-title">{ev.title}</span>
                    <span className="event-sub">
                      {[ev.start_display, ev.location, ev.org].filter(Boolean).join(' · ') || '时间待确认'}
                    </span>
                  </div>
                  <div className="event-meta">
                    {ev.conflict_count > 0 && <Badge tone="warn">{ev.conflict_count} 处冲突</Badge>}
                    {ev.pending_count > 0 && <Badge tone="neutral">{ev.pending_count} 项待确认</Badge>}
                    <span className="event-tasks">
                      {ev.open_task_count > 0 ? `${ev.open_task_count} 件待办` : '无待办'}
                    </span>
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
