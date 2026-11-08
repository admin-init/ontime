import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ingestScreenshot, ingestText } from '../api'
import { ErrorBox, LoadingRow, Steps, type StepView } from '../components/bits'
import { usePollJob } from '../hooks'

// 后端 stage.steps 未返回时的兜底展示（与契约的四步一致）
const DEFAULT_STEPS: StepView[] = [
  { key: 'ocr', label: '识别截图', state: 'todo' },
  { key: 'extract', label: '整理事项', state: 'todo' },
  { key: 'link', label: '查找关联事件', state: 'todo' },
  { key: 'done', label: '等待确认', state: 'todo' },
]

function DropIco() {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none" className="drop-ico" aria-hidden>
      <rect x="6.75" y="10.75" width="30.5" height="24.5" rx="3" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16" cy="19" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="m9 31 8-8 6 6 5-5 7 7" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

export default function Capture() {
  const navigate = useNavigate()
  const [jobId, setJobId] = useState<string | null>(null)
  const [sourceName, setSourceName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [text, setText] = useState('')
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const job = usePollJob(jobId, 600)

  const finished = job?.state === 'done' || job?.state === 'failed'

  const upload = useCallback(async (file: File, name?: string) => {
    setError(null)
    setSourceName(name ?? file.name)
    try {
      const res = await ingestScreenshot(file)
      setJobId(res.job_id)
    } catch (e) {
      setError((e as Error).message)
      setSourceName('')
    }
  }, [])

  // Ctrl+V 直接粘贴剪贴板里的截图
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const file = item.getAsFile()
          if (file) {
            e.preventDefault()
            void upload(file, '剪贴板截图')
            return
          }
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [upload])

  // 处理完成后进入收件箱确认
  useEffect(() => {
    if (job?.state === 'done') {
      const timer = window.setTimeout(() => navigate('/inbox'), 500)
      return () => window.clearTimeout(timer)
    }
    if (job?.state === 'failed') {
      setError(job.error ?? '处理失败，请重试')
    }
  }, [job, navigate])

  function reset() {
    setJobId(null)
    setError(null)
    setSourceName('')
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('请上传图片文件（PNG / JPG）')
      return
    }
    void upload(file)
  }

  async function submitText() {
    if (!text.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await ingestText(text.trim(), title.trim() || undefined)
      setSourceName('手动输入的文字')
      setJobId(res.job_id)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  const running = jobId !== null && !finished

  return (
    <>
      <div className="page-head">
        <div>
          <h1>收录</h1>
          <div className="page-sub">把截图或文字交给「到点」，识别结果先去收件箱等你确认，不会自动生效。</div>
        </div>
      </div>

      {error && !running && (
        <ErrorBox onRetry={jobId ? reset : undefined}>{error}</ErrorBox>
      )}

      {jobId !== null && (
        <section className="card">
          <div className="card-head">
            <h2>正在处理{sourceName ? `：${sourceName}` : ''}</h2>
            {running && <LoadingRow label="" />}
          </div>
          <Steps steps={job?.stage?.steps ?? DEFAULT_STEPS} />
          {job?.stage?.message && <p className="step-message">{job.stage.message}</p>}
          {job?.state === 'failed' && (
            <div style={{ marginTop: 12 }}>
              <ErrorBox onRetry={reset}>{job.error ?? error ?? '处理失败'}</ErrorBox>
            </div>
          )}
        </section>
      )}

      {running ? null : (
        <>
          <section
            className={dragging ? 'dropzone dragging' : 'dropzone'}
            onClick={() => fileRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click()
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            role="button"
            tabIndex={0}
            aria-label="上传截图"
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void upload(f)
                e.target.value = ''
              }}
            />
            <DropIco />
            <div className="drop-title">把截图拖到这里，或点击选择图片</div>
            <div className="muted">也可以直接 Ctrl + V 粘贴剪贴板里的截图</div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>粘贴或输入文字</h2>
            </div>
            <div className="form-stack">
              <input
                className="input"
                placeholder="标题（可选），如：学院通知"
                value={title}
                maxLength={60}
                onChange={(e) => setTitle(e.target.value)}
              />
              <textarea
                className="textarea"
                rows={6}
                placeholder="把通知原文、邮件正文或聊天记录粘贴到这里…"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <div className="form-foot">
                <span className="muted">识别通常需要几秒到十几秒，完成后会自动跳到收件箱。</span>
                <button
                  className="btn btn-primary"
                  disabled={!text.trim() || submitting}
                  onClick={() => void submitText()}
                >
                  {submitting ? '提交中…' : '收录这段文字'}
                </button>
              </div>
            </div>
          </section>
        </>
      )}
    </>
  )
}
