import { useEffect, useRef, useState } from 'react'
import {
  getImapStatus,
  getMailImports,
  importMail,
  syncImap,
  testImap,
  type ImapStatus,
  type MailImport,
} from '../../api'
import { Badge, ErrorBox, LoadingRow } from '../../components/bits'
import { fmtClock } from '../../format'
import { useLoad, usePollJob } from '../../hooks'

const JOB_STATE_BADGE: Record<string, { tone: 'success' | 'neutral' | 'danger'; label: string }> = {
  done: { tone: 'success', label: '已处理' },
  running: { tone: 'neutral', label: '处理中' },
  queued: { tone: 'neutral', label: '排队中' },
  failed: { tone: 'danger', label: '处理失败' },
}

/** 连接状态行：契约要求——没有真实账号时必须显示「已实现 / 未验证」，不得显示"已连接"。 */
function ImapStateLine({ s }: { s: ImapStatus | null }) {
  if (!s) return <span className="meta">正在读取连接状态…</span>
  if (s.verified) {
    return (
      <span className="live-state">
        <span className="live-dot" aria-hidden />
        已验证
        {s.last_sync_at ? ` · 上次拉取 ${fmtClock(s.last_sync_at)}` : ''}
      </span>
    )
  }
  return (
    <>
      <Badge tone="warn">已实现 · 未验证</Badge>
      <span className="meta">
        {s.configured
          ? '已保存连接信息，但还没有通过真实账号验证'
          : '尚未连接真实邮箱；填写下方配置并「测试连接」成功后才会变为已验证'}
      </span>
    </>
  )
}

export default function MailSection() {
  const {
    data: mailData,
    error: mailError,
    loading: mailLoading,
    refresh: refreshImports,
  } = useLoad(() => getMailImports())
  const { data: imapStatus, refresh: refreshStatus } = useLoad(() => getImapStatus())

  // 文件导入
  const [dragging, setDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importMsg, setImportMsg] = useState<string | null>(null)
  const [importError, setImportError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // IMAP 表单（凭证只在内存里，页面不保存）
  const [host, setHost] = useState('')
  const [port, setPort] = useState('993')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [testError, setTestError] = useState<string | null>(null)

  // IMAP 拉取（走 job）
  const [pulling, setPulling] = useState(false)
  const [pullJobId, setPullJobId] = useState<string | null>(null)
  const job = usePollJob(pullJobId, 1500)

  useEffect(() => {
    if (!job) return
    if (job.state === 'done' || job.state === 'failed') {
      if (job.state === 'failed') setImportError(job.error ?? 'IMAP 拉取失败')
      else setImportMsg('IMAP 拉取完成，新邮件已进入处理队列')
      setPullJobId(null)
      setPulling(false)
      void refreshImports()
      void refreshStatus()
    }
  }, [job, refreshImports, refreshStatus])

  async function uploadFiles(files: FileList | File[]) {
    const list = Array.from(files).filter(
      (f) => /\.(eml|mbox)$/i.test(f.name) || f.type === 'message/rfc822' || f.type === 'application/mbox',
    )
    if (list.length === 0) {
      setImportError('请选择 .eml 或 .mbox 文件')
      return
    }
    setImporting(true)
    setImportError(null)
    setImportMsg(null)
    let okFiles = 0
    let okMails = 0
    for (const f of list) {
      try {
        const res = await importMail(f)
        okFiles += 1
        okMails += res.job_ids.length
      } catch (e) {
        setImportError(`导入「${f.name}」失败：${(e as Error).message}`)
      }
    }
    setImporting(false)
    if (okFiles > 0) {
      setImportMsg(`已导入 ${okFiles} 个文件、${okMails} 封邮件，逐封识别后状态在列表里更新`)
      void refreshImports()
    }
  }

  const imapReady = host.trim() !== '' && username.trim() !== '' && password !== ''

  async function onTest() {
    if (testing) return
    setTesting(true)
    setTestError(null)
    setTestResult(null)
    try {
      const res = await testImap({
        host: host.trim(),
        port: Number(port) || 993,
        username: username.trim(),
        password,
      })
      setTestResult(res)
      void refreshStatus()
    } catch (e) {
      setTestError((e as Error).message)
    } finally {
      setTesting(false)
    }
  }

  async function onPull() {
    if (pulling) return
    setPulling(true)
    setImportError(null)
    setImportMsg(null)
    try {
      const res = await syncImap({
        host: host.trim(),
        port: Number(port) || 993,
        username: username.trim(),
        password,
      })
      setPullJobId(res.job_id)
    } catch (e) {
      setImportError((e as Error).message)
      setPulling(false)
    }
  }

  const items = mailData?.items ?? []

  return (
    <section className="section">
      <div className="section-head">
        <h2>邮箱</h2>
        <span className="meta section-hint">导入 .eml / .mbox，或只读拉取 IMAP 收件箱</span>
      </div>

      <div
        className={dragging ? 'dropzone drop-sm is-dragging' : 'dropzone drop-sm'}
        onClick={() => fileRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') fileRef.current?.click()
        }}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files)
        }}
        role="button"
        tabIndex={0}
        aria-label="导入邮件文件"
      >
        <input
          ref={fileRef}
          type="file"
          accept=".eml,.mbox,message/rfc822,application/mbox"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) void uploadFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <div className="drop-title">{importing ? '正在导入…' : '拖入 .eml / .mbox 文件，或点击选择'}</div>
        <div className="drop-hint">附件里的 PDF 与图片会一并提取；导入内容与截图一样先识别、待确认</div>
      </div>

      {importMsg && <p className="import-ok">{importMsg}</p>}
      {importError && <ErrorBox>{importError}</ErrorBox>}

      {mailError && <ErrorBox onRetry={() => void refreshImports()}>{mailError}</ErrorBox>}
      {mailLoading && <LoadingRow />}
      {!mailLoading && !mailError && items.length === 0 && (
        <p className="block-note">还没有导入过邮件。</p>
      )}

      {items.length > 0 && (
        <ul className="src-list">
          {items.map((m: MailImport) => {
            const state = JOB_STATE_BADGE[m.job_state] ?? { tone: 'neutral' as const, label: m.job_state }
            return (
              <li key={m.source_id} className="src-item">
                <div className="src-main">
                  <div className="src-title">
                    <span className="src-name">{m.subject ?? '（无主题）'}</span>
                    <Badge tone={state.tone}>{state.label}</Badge>
                  </div>
                  <div className="src-sub">
                    <span className="meta">{m.from ?? '未知发件人'}</span>
                    {m.date && <span className="meta">{fmtClock(m.date)}</span>}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div className="imap-panel">
        <div className="imap-status">
          <span className="src-name">IMAP 只读拉取</span>
          <ImapStateLine s={imapStatus ?? null} />
        </div>
        <div className="add-grid">
          <input
            className="input"
            placeholder="IMAP 服务器，如 imap.example.com"
            value={host}
            autoComplete="off"
            onChange={(e) => setHost(e.target.value)}
          />
          <input
            className="input"
            placeholder="端口（默认 993）"
            value={port}
            inputMode="numeric"
            onChange={(e) => setPort(e.target.value)}
          />
        </div>
        <div className="add-grid">
          <input
            className="input"
            placeholder="邮箱账号"
            value={username}
            autoComplete="username"
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            className="input"
            type="password"
            placeholder="授权码 / 应用专用密码"
            value={password}
            autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="form-foot">
          <span className="meta">
            授权码只发送给本机后端用于连接，页面不保存；拉取为只读（BODY.PEEK），不标已读、不删信、不发信。
          </span>
          <span className="btn-row">
            <button
              className="btn btn-secondary btn-sm"
              disabled={pulling || testing || !imapReady}
              onClick={() => void onPull()}
            >
              {pulling ? '拉取中…' : '拉取邮件'}
            </button>
            <button
              className="btn btn-primary btn-sm"
              disabled={testing || pulling || !imapReady}
              onClick={() => void onTest()}
            >
              {testing ? '测试中…' : '测试连接'}
            </button>
          </span>
        </div>
        {testResult && (
          <div className={testResult.ok ? 'imap-result is-ok' : 'imap-result is-fail'} role="status">
            {testResult.ok ? `连接成功：${testResult.message}` : `连接失败：${testResult.message}`}
          </div>
        )}
        {testError && <ErrorBox>{testError}</ErrorBox>}
      </div>
    </section>
  )
}
