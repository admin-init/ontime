import { useState } from 'react'
import { getCapabilities, resetDemo } from '../api'
import { Badge, ErrorBox, LoadingRow } from '../components/bits'
import { useLoad } from '../hooks'

export default function Settings() {
  const { data, error, loading, refresh } = useLoad(() => getCapabilities())
  const [confirming, setConfirming] = useState(false)
  const [resetState, setResetState] = useState<'idle' | 'busy' | 'done'>('idle')
  const [resetError, setResetError] = useState<string | null>(null)

  async function doReset() {
    setResetState('busy')
    setResetError(null)
    try {
      await resetDemo()
      setResetState('done')
      setConfirming(false)
    } catch (e) {
      setResetError((e as Error).message)
      setResetState('idle')
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>设置</h1>
          <div className="page-sub">
            能力边界、演示数据与隐私说明。已接入的标「已实现」，没接入的明确写「演示暂未接入」。
          </div>
        </div>
      </div>

      {error && <ErrorBox onRetry={() => void refresh()}>{error}</ErrorBox>}
      {loading && <LoadingRow />}

      {data && (
        <section className="section">
          <div className="section-head">
            <h2>能力矩阵</h2>
            <span className="meta section-hint">与后端声明的能力边界一致</span>
          </div>
          <ul className="cap-list">
            {data.items.map((it) => (
              <li key={it.key} className="cap-item">
                <div className="cap-main">
                  <div className="cap-name">{it.name}</div>
                  <div className="cap-note">{it.note}</div>
                </div>
                <div className="cap-state">
                  {it.level === 'live' ? (
                    <span className="live-state">
                      <span className="live-dot" aria-hidden />
                      已实现
                    </span>
                  ) : (
                    <Badge tone="warn">演示暂未接入</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="section">
        <div className="section-head">
          <h2>隐私说明</h2>
        </div>
        <ol className="privacy-list">
          <li>
            上传的<b>截图会发送给云端视觉模型</b>做文字识别。截图里可能包含他人姓名、头像、群名等信息，建议先裁剪再上传。
          </li>
          <li>识别出的文字与你粘贴的正文，会发送给云端语言模型，用于整理事件、截止时间与材料字段。</li>
          <li>数据保存在本机的 SQLite 数据库；原图与原文件只存在本机 storage/ 目录，不进入代码仓库。</li>
          <li>当前演示使用「云端视觉模型直读」模式：图片会离开本机；本地 OCR 模式未启用。</li>
          <li>邮箱自动连接、官网定时抓取等后台能力演示暂未接入，相关入口只作展示，不代表已连接。</li>
        </ol>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>演示数据</h2>
        </div>
        <p className="block-note">
          「演示重置」会清空本机所有事件、任务、来源与截图，恢复到空状态，仅用于演示前重来。
        </p>
        {resetError && <ErrorBox>{resetError}</ErrorBox>}
        {resetState === 'done' && <p className="reset-ok">已重置，当前数据为空。</p>}
        {confirming ? (
          <div className="reset-confirm">
            <span className="reset-warn">确定要清空吗？此操作不可撤销。</span>
            <button className="btn btn-danger btn-sm" disabled={resetState === 'busy'} onClick={() => void doReset()}>
              {resetState === 'busy' ? '重置中…' : '确认清空'}
            </button>
            <button className="text-btn" disabled={resetState === 'busy'} onClick={() => setConfirming(false)}>
              取消
            </button>
          </div>
        ) : (
          <div className="reset-row">
            <button className="btn btn-secondary" disabled={resetState === 'busy'} onClick={() => setConfirming(true)}>
              重置演示数据
            </button>
          </div>
        )}
      </section>
    </>
  )
}
