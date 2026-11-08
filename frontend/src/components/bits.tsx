import type { ReactNode } from 'react'

const STATUS_TEXT: Record<string, string> = {
  supported: '已支持',
  user_confirmed: '已确认',
  conflict: '有冲突',
  needs_anchor: '待补日期',
  unconfirmed: '未确认',
  insufficient: '信息不足',
  rejected: '已拒绝',
  merged: '已并入其他事件',
}

export function statusText(status: string): string {
  return STATUS_TEXT[status] ?? status
}

export function StatusDot({ status }: { status: string }) {
  return <span className={`status-dot dot-${status}`} aria-hidden />
}

/** 6px 状态点 + 12px 文案，字段行、历史、规则共用。 */
export function StatusMark({ status, label }: { status: string; label?: string }) {
  return (
    <span className={`status-mark status-${status}`}>
      <StatusDot status={status} />
      <span>{label ?? statusText(status)}</span>
    </span>
  )
}

type Tone = 'neutral' | 'accent' | 'warn' | 'success' | 'muted' | 'danger'

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

const SOURCE_KIND_BADGE: Record<string, string> = {
  web: '官网',
  mail: '邮件',
  screenshot: '截图',
  text: '文字',
  link: '链接',
}

/** 收件箱来源徽标：区分官网同步 / 邮件 / 截图 / 文字，沿用现有小徽标样式。 */
export function SourceKindBadge({ kind }: { kind: string | null | undefined }) {
  const label = kind ? SOURCE_KIND_BADGE[kind] : undefined
  if (!label) return null
  return <Badge tone="muted">{label}</Badge>
}

export function EmptyState({
  title,
  desc,
  action,
}: {
  title: string
  desc?: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <div className="empty-title">{title}</div>
      {desc && <div className="empty-desc">{desc}</div>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  )
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="spinner-wrap">
      <span className="spinner" aria-hidden />
      {label && <span>{label}</span>}
    </span>
  )
}

export function LoadingRow({ label = '加载中…' }: { label?: string }) {
  return (
    <div className="loading-row">
      <Spinner label={label} />
    </div>
  )
}

export type StepView = { key: string; label: string; state: 'todo' | 'active' | 'done' | 'failed' }

export function Steps({ steps }: { steps: StepView[] }) {
  return (
    <ol className="steps">
      {steps.map((s, i) => (
        <li key={s.key} className={`step is-${s.state}`}>
          <span className="step-dot" aria-hidden />
          <span className="step-label">{s.label}</span>
          {i < steps.length - 1 && <span className="step-line" aria-hidden />}
        </li>
      ))}
    </ol>
  )
}

export function ErrorBox({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <span>{children}</span>
      {onRetry && (
        <button className="text-btn" onClick={onRetry}>
          重试
        </button>
      )}
    </div>
  )
}

export function Quote({ text }: { text: string }) {
  if (!text) return null
  return <blockquote className="quote">{text}</blockquote>
}
