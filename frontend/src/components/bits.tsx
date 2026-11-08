import type { ReactNode } from 'react'

const STATUS_TEXT: Record<string, string> = {
  supported: '已支持',
  user_confirmed: '已确认',
  conflict: '冲突',
  needs_anchor: '缺日期依据',
  unconfirmed: '未确认',
  insufficient: '信息不足',
  rejected: '已拒绝',
}

export function statusText(status: string): string {
  return STATUS_TEXT[status] ?? status
}

export function StatusDot({ status }: { status: string }) {
  return <span className={`dot dot-${status}`} title={statusText(status)} />
}

type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info' | 'gray'

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}

function EmptySvg() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" aria-hidden>
      <rect x="6.75" y="10.75" width="26.5" height="20.5" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 17.5h8.5a3 3 0 0 0 6 0H29" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M14 30.5 9 24" stroke="currentColor" strokeWidth="1.5" opacity=".45" />
      <path d="M26 30.5 31 24" stroke="currentColor" strokeWidth="1.5" opacity=".45" />
    </svg>
  )
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
      <div className="empty-ico">
        <EmptySvg />
      </div>
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
    <div className="steps">
      {steps.map((s, i) => (
        <div key={s.key} className={`step step-${s.state}`}>
          <span className="step-ico">
            {s.state === 'done' ? '✓' : s.state === 'failed' ? '✕' : i + 1}
          </span>
          <span className="step-label">{s.label}</span>
          {i < steps.length - 1 && <span className="step-line" />}
        </div>
      ))}
    </div>
  )
}

export function ErrorBox({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <div className="error-box">
      <span>{children}</span>
      {onRetry && (
        <button className="btn btn-sm" onClick={onRetry}>
          重试
        </button>
      )}
    </div>
  )
}

export function Quote({ text }: { text: string }) {
  if (!text) return null
  return <div className="quote">「{text}」</div>
}
