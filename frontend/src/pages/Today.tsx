import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  dismissReminder,
  getReminders,
  getToday,
  syncReminders,
  toggleTask,
  type Reminder,
  type TaskRow,
  type TodayData,
} from '../api'
import { Badge, EmptyState, ErrorBox, LoadingRow } from '../components/bits'
import { fmtClock, greeting, todayLine } from '../format'

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

  // 提醒：正常轮询展示；后端未实现 / 未启动时安静降级，不影响行动台
  const [reminders, setReminders] = useState<Reminder[]>([])
  const [remindError, setRemindError] = useState<string | null>(null)
  const [dismissing, setDismissing] = useState<Set<string>>(new Set())
  const [notice, setNotice] = useState<string | null>(null)
  const firedRef = useRef<Set<string>>(new Set())

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

  // 首次进入请求浏览器通知权限；不支持 / 被拒绝时只在站内显示，不报错
  useEffect(() => {
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        void Notification.requestPermission().catch(() => undefined)
      }
    } catch {
      // 浏览器不支持 Notification 时忽略
    }
  }, [])

  const pullReminders = useCallback(async (withSync: boolean) => {
    if (withSync) {
      // 先让后端按 open 任务的截止时间补齐提醒（幂等）；失败不影响展示
      try {
        await syncReminders()
      } catch {
        // 契约 v1.1 的后端尚未就绪时静默
      }
    }
    try {
      const res = await getReminders()
      setReminders(res.items)
      setRemindError(null)
    } catch (e) {
      setReminders([])
      setRemindError((e as Error).message)
    }
  }, [])

  useEffect(() => {
    void pullReminders(true)
  }, [pullReminders])

  // 每 15 秒重拉提醒并检查到点
  useEffect(() => {
    const timer = window.setInterval(() => void pullReminders(false), 15000)
    return () => window.clearInterval(timer)
  }, [pullReminders])

  // 到点检查：优先浏览器通知，失败只留站内提示，绝不抛错
  const checkFire = useCallback(() => {
    const now = Date.now()
    for (const r of reminders) {
      if (r.state !== 'scheduled' || firedRef.current.has(r.id)) continue
      const at = new Date(r.fire_at).getTime()
      if (Number.isNaN(at) || at > now) continue
      firedRef.current.add(r.id)
      let notified = false
      try {
        if ('Notification' in window && Notification.permission === 'granted') {
          const n = new Notification(`到点提醒：${r.title}`, {
            body: `提醒时间 ${fmtClock(r.fire_at)}`,
            tag: r.id,
          })
          n.onclick = () => {
            window.focus()
            n.close()
          }
          notified = true
        }
      } catch {
        notified = false
      }
      if (!notified) setNotice(`「${r.title}」已到提醒时间（${fmtClock(r.fire_at)}）`)
    }
  }, [reminders])

  useEffect(() => {
    checkFire()
  }, [checkFire])

  useEffect(() => {
    const timer = window.setInterval(checkFire, 15000)
    return () => window.clearInterval(timer)
  }, [checkFire])

  const upcoming = reminders
    .filter((r) => r.state === 'scheduled')
    .sort((a, b) => a.fire_at.localeCompare(b.fire_at))
    .slice(0, 3)

  async function onDismiss(r: Reminder) {
    if (dismissing.has(r.id)) return
    setDismissing((prev) => new Set(prev).add(r.id))
    try {
      await dismissReminder(r.id)
      setReminders((prev) => prev.filter((x) => x.id !== r.id))
      setRemindError(null)
    } catch (e) {
      setRemindError((e as Error).message)
    } finally {
      setDismissing((prev) => {
        const s = new Set(prev)
        s.delete(r.id)
        return s
      })
    }
  }

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
    // 先改本地，勾选不等待网络；事件行的 open_task_count 同步增减，
    // 保证顶部「未完成」与同一屏事件行「待办」始终一致。
    setData((prev) => {
      if (!prev) return prev
      const delta = next === 'done' ? -1 : 1
      return {
        ...prev,
        tasks: prev.tasks.map((x) => (x.id === t.id ? { ...x, state: next } : x)),
        events: prev.events.map((ev) =>
          ev.id === t.event_id
            ? { ...ev, open_task_count: Math.max(0, ev.open_task_count + delta) }
            : ev,
        ),
      }
    })
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
          <h2>提醒</h2>
          {upcoming.length > 0 && <span className="meta">最近 {upcoming.length} 条未完成</span>}
        </div>
        {notice && (
          <div className="remind-toast" role="status">
            <span>{notice}</span>
            <button className="text-btn" onClick={() => setNotice(null)}>
              知道了
            </button>
          </div>
        )}
        {upcoming.length === 0 ? (
          <p className="block-note">
            暂无提醒。已确认事件的任务填了截止时间后，到点前会在这里出现，并用浏览器通知弹出（未授权时只在站内显示）。
          </p>
        ) : (
          <ul className="remind-list">
            {upcoming.map((r) => {
              const at = new Date(r.fire_at).getTime()
              const due = !Number.isNaN(at) && at <= Date.now()
              return (
                <li key={r.id} className="remind-row">
                  <span className={due ? 'remind-dot is-due' : 'remind-dot'} aria-hidden />
                  <div className="remind-main">
                    <span className="remind-title">{r.title}</span>
                    <span className={due ? 'remind-when is-due' : 'remind-when'}>
                      {due ? '已到提醒时间 · ' : ''}
                      {fmtClock(r.fire_at)}
                    </span>
                  </div>
                  <div className="remind-actions">
                    {r.event_id && (
                      <Link className="text-btn" to={`/events/${r.event_id}`}>
                        查看事件
                      </Link>
                    )}
                    <button
                      className="text-btn"
                      disabled={dismissing.has(r.id)}
                      onClick={() => void onDismiss(r)}
                    >
                      不再提醒
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        {/* 行动台整体已报后端不可用时，提醒区不再重复报错 */}
        {!error && remindError && <ErrorBox onRetry={() => void pullReminders(false)}>{remindError}</ErrorBox>}
      </section>

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
