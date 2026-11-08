import { useEffect, useMemo, useState } from 'react'
import {
  createWatchTarget,
  jobErrorMessage,
  parseResearchResult,
  patchSite,
  researchSite,
  type ResearchItem,
  type ResearchParsed,
  type Site,
  type SiteProfile,
} from '../../api'
import { Badge, ErrorBox, LoadingRow, Steps, type StepView } from '../../components/bits'
import { usePollJob } from '../../hooks'

const MAX_ITEMS = 8

const PROFILE_LABELS: { key: keyof SiteProfile; label: string }[] = [
  { key: 'list_url', label: '列表页' },
  { key: 'item_selector', label: '列表项选择器' },
  { key: 'title_selector', label: '标题选择器' },
  { key: 'content_selector', label: '正文选择器' },
]

/** 站点当前已写入的规则摘要（用于写入前并列提示，不静默覆盖）。 */
function currentProfileText(s: Site): string[] {
  const rows: string[] = []
  if (s.list_url) rows.push(`列表页 ${s.list_url}`)
  if (s.item_selector) rows.push(`列表项 ${s.item_selector}`)
  if (s.title_selector) rows.push(`标题 ${s.title_selector}`)
  if (s.content_selector) rows.push(`正文 ${s.content_selector}`)
  return rows
}

/**
 * 「用 Agent 调研」：填站点/页面地址，后端真实派 Agent 访问后返回
 * 候选条目（最多 8 条）与解析规则建议（profile）。
 * 进度只按 job.stage 渲染；后端没有返回分步进度时只显示「调研中」，
 * 不在前端假装阶段。失败（含 job.result.error）如实显示，不给假成功。
 */
export default function SiteResearchPanel({ sites, onChanged }: { sites: Site[]; onChanged: () => void }) {
  const [url, setUrl] = useState('')
  const [task, setTask] = useState('')
  const [starting, setStarting] = useState(false)
  const [running, setRunning] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [runError, setRunError] = useState<string | null>(null)

  const [jobId, setJobId] = useState<string | null>(null)
  const job = usePollJob(jobId, 1500)

  const [result, setResult] = useState<ResearchParsed | null>(null)

  // 设为订阅源（加入官网栏目）
  const [addingUrl, setAddingUrl] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [addError, setAddError] = useState<string | null>(null)

  // 写入解析规则（Agent 建议，用户确认后才写）
  const [targetId, setTargetId] = useState('')
  const [writing, setWriting] = useState(false)
  const [writeState, setWriteState] = useState<'idle' | 'done'>('idle')
  const [writtenName, setWrittenName] = useState('')
  const [writeError, setWriteError] = useState<string | null>(null)

  useEffect(() => {
    if (!job) return
    if (job.state === 'done') {
      const parsed = parseResearchResult(job.result)
      setResult(parsed)
      if (parsed.error) setRunError(parsed.error)
      setRunning(false)
      setJobId(null)
    } else if (job.state === 'failed') {
      setRunError(jobErrorMessage(job))
      setRunning(false)
      setJobId(null)
    }
  }, [job])

  // 进度：只用后端返回的 stage.steps；没有就显示笼统的「调研中」
  const steps: StepView[] | null = running ? (job?.stage?.steps ?? null) : null
  const stageMessage = running ? (job?.stage?.message ?? null) : null

  const profileRows = useMemo(() => {
    if (!result?.profile) return []
    return PROFILE_LABELS.filter((row) => result.profile?.[row.key])
  }, [result])

  // 域名匹配的已登记站点：调研时作为 site_id 传入，写入时作为默认目标
  const matchedSite = useMemo(() => {
    const u = url.trim()
    if (!u) return null
    try {
      const host = new URL(u).hostname.toLowerCase().replace(/^www\./, '')
      return (
        sites.find((s) => {
          const d = s.domain.toLowerCase().replace(/^www\./, '')
          return host === d || host.endsWith(`.${d}`)
        }) ?? null
      )
    } catch {
      return null
    }
  }, [url, sites])

  // 写入目标默认值：结果到达时按域名匹配取一次；sites 随后刷新不重置，
  // 避免写入成功后的确认文案被清回（写入状态同理）。
  useEffect(() => {
    if (!result) return
    setTargetId(matchedSite?.id ?? sites[0]?.id ?? '')
    setWriteState('idle')
    // matchedSite/sites 此刻取默认值即可，后续变化不重置
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])

  async function onStart() {
    if (starting || running) return
    const u = url.trim()
    if (!/^https?:\/\//i.test(u)) {
      setFormError('地址需要以 http:// 或 https:// 开头')
      return
    }
    setFormError(null)
    setRunError(null)
    setAddError(null)
    setWriteError(null)
    setResult(null)
    setAdded(new Set())
    setWriteState('idle')
    setStarting(true)
    try {
      const res = await researchSite({
        url: u,
        task: task.trim() || undefined,
        site_id: matchedSite?.id || undefined,
      })
      setJobId(res.job_id)
      setRunning(true)
    } catch (e) {
      setRunError((e as Error).message)
    } finally {
      setStarting(false)
    }
  }

  async function onSubscribe(item: ResearchItem) {
    if (addingUrl) return
    setAddingUrl(item.url)
    setAddError(null)
    try {
      await createWatchTarget({ name: item.title, url: item.url })
      setAdded((prev) => {
        const next = new Set(prev)
        next.add(item.url)
        return next
      })
    } catch (e) {
      setAddError(`「${item.title}」设为订阅源失败：${(e as Error).message}`)
    } finally {
      setAddingUrl(null)
    }
  }

  async function onWrite() {
    const profile = result?.profile
    if (!profile || writing) return
    // targetId 尚未由默认值 effect 填好时，落到域名匹配或第一个站点
    const target = sites.find((s) => s.id === targetId) ?? matchedSite ?? sites[0] ?? null
    if (!target) {
      setWriteError('先在上方登记站点，再写入解析规则')
      return
    }
    setWriting(true)
    setWriteError(null)
    try {
      await patchSite(target.id, {
        ...(profile.list_url ? { list_url: profile.list_url } : {}),
        item_selector: profile.item_selector,
        title_selector: profile.title_selector,
        content_selector: profile.content_selector,
        profile_source: 'agent',
      })
      setWriteState('done')
      setWrittenName(target.name)
      onChanged()
    } catch (e) {
      setWriteError((e as Error).message)
    } finally {
      setWriting(false)
    }
  }

  const target = sites.find((s) => s.id === targetId) ?? null
  const hasCurrentProfile = target ? currentProfileText(target).length > 0 : false

  return (
    <div className="research-panel">
      <div className="research-head">
        <h3 className="research-title">用 Agent 调研</h3>
        <span className="meta section-hint">
          Agent 实际访问你给的地址，找出可订阅的条目，并给出解析规则建议（写入前需你确认）
        </span>
      </div>
      <div className="add-grid">
        <input
          className="input"
          placeholder="站点 / 页面地址，https://…"
          value={url}
          maxLength={300}
          disabled={starting || running}
          onChange={(e) => setUrl(e.target.value)}
        />
        <input
          className="input"
          placeholder="任务描述（可选，如：找出这个栏目里最近的通知）"
          value={task}
          maxLength={200}
          disabled={starting || running}
          onChange={(e) => setTask(e.target.value)}
        />
      </div>
      <div className="form-foot">
        <span className="meta">
          调研由真实模型与抓取完成，可能需要一两分钟；结果最多给出 {MAX_ITEMS} 条，每条附原文片段。
        </span>
        <button
          className="btn btn-primary btn-sm"
          disabled={starting || running || !url.trim()}
          onClick={() => void onStart()}
        >
          {starting || running ? '调研中…' : '开始调研'}
        </button>
      </div>

      {formError && <ErrorBox>{formError}</ErrorBox>}

      {running && (
        <div className="research-progress">
          {steps ? (
            <>
              <Steps steps={steps} />
              {stageMessage && <p className="meta">{stageMessage}</p>}
            </>
          ) : (
            <LoadingRow label="调研中… Agent 正在访问站点（后端未返回分步进度）" />
          )}
        </div>
      )}

      {runError && <ErrorBox>{runError}</ErrorBox>}
      {addError && <ErrorBox>{addError}</ErrorBox>}

      {result && (
        <>
          {result.items.length > 0 && (
            <>
              <p className="meta">
                候选条目（{result.items.length} 条，来自本次真实访问）
                {result.model ? ` · 模型 ${result.model}` : ''}
                {result.elapsedMs != null ? ` · 用时 ${(result.elapsedMs / 1000).toFixed(1)} 秒` : ''}：
              </p>
              <ul className="src-list">
                {result.items.map((item) => (
                  <li key={item.url} className="src-item">
                    <div className="src-main">
                      <div className="src-title">
                        <span className="src-name">{item.title}</span>
                      </div>
                      <div className="src-sub">
                        <span className="src-url">{item.url}</span>
                        {item.snippet && <span className="meta">{item.snippet}</span>}
                      </div>
                    </div>
                    <div className="src-actions">
                      {added.has(item.url) ? (
                        <span className="meta">已加入官网栏目</span>
                      ) : (
                        <button
                          className="text-btn is-strong"
                          disabled={addingUrl !== null}
                          onClick={() => void onSubscribe(item)}
                        >
                          {addingUrl === item.url ? '加入中…' : '设为订阅源'}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="meta">「设为订阅源」会把该条目加入上方「官网栏目」，下次同步开始抓取新内容。</p>
            </>
          )}
          {!result.error && result.items.length === 0 && (
            <p className="block-note">
              调研完成，但没有返回候选条目。可以换一个地址，或补充任务描述后重试。
            </p>
          )}

          {result.profile && (
            <div className="research-profile">
              <div className="research-profile-head">
                <span>解析规则建议</span>
                <Badge tone="accent">由 Agent 建议 · 需你确认</Badge>
              </div>
              <div className="research-profile-grid">
                {profileRows.map((row) => (
                  <div key={row.key} className="research-profile-row">
                    <span className="meta">{row.label}</span>
                    <span className="research-profile-value">{result.profile?.[row.key]}</span>
                  </div>
                ))}
              </div>
              {writeState === 'done' ? (
                <p className="import-ok">
                  已写入「{writtenName}」，来源标记为 Agent 建议；可在上方站点列表中查看。
                </p>
              ) : sites.length === 0 ? (
                <p className="meta">先在上方登记站点，再写入解析规则。</p>
              ) : (
                <>
                  {hasCurrentProfile && target && (
                    <div className="meta">
                      「{target.name}」已有解析规则（
                      {target.profile_source === 'agent'
                        ? '来自 Agent 建议'
                        : target.profile_source === 'manual'
                          ? '手动填写'
                          : '此前登记'}
                      ：{currentProfileText(target).join('；')}），写入将替换这些字段，不会静默覆盖其它站点。
                    </div>
                  )}
                  <div className="research-profile-actions">
                    <select
                      className="input"
                      value={targetId}
                      aria-label="选择写入的站点"
                      onChange={(e) => setTargetId(e.target.value)}
                    >
                      {sites.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}（{s.domain}）
                        </option>
                      ))}
                    </select>
                    <button className="btn btn-secondary btn-sm" disabled={writing} onClick={() => void onWrite()}>
                      {writing ? '写入中…' : hasCurrentProfile ? '写入并替换当前规则' : '写入解析规则'}
                    </button>
                  </div>
                  {writeError && <ErrorBox>{writeError}</ErrorBox>}
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
