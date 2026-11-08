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
          <div className="page-sub">能力边界、演示数据与隐私说明。能演示的才标注「已实现」，没做的绝不含糊。</div>
        </div>
      </div>

      {error && <ErrorBox onRetry={() => void refresh()}>{error}</ErrorBox>}
      {loading && <LoadingRow />}

      {data && (
        <section className="card">
          <div className="card-head">
            <h2>能力矩阵</h2>
            <span className="muted">由 /api/capabilities 提供，全站口径一致</span>
          </div>
          <table className="table cap-table">
            <thead>
              <tr>
                <th style={{ width: 220 }}>能力</th>
                <th>说明</th>
                <th style={{ width: 130 }}>状态</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((it) => (
                <tr key={it.key}>
                  <td style={{ fontWeight: 500 }}>{it.name}</td>
                  <td className="muted">{it.note}</td>
                  <td>{it.level === 'live' ? <Badge tone="success">已实现</Badge> : <Badge tone="gray">演示暂未接入</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card">
        <div className="card-head">
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

      <section className="card">
        <div className="card-head">
          <h2>演示数据</h2>
        </div>
        <div className="reset-zone">
          <div className="muted">
            「演示重置」会清空所有事件、任务、来源与截图，恢复到空状态。仅用于演示，不会影响真实数据。
          </div>
          {resetError && <ErrorBox>{resetError}</ErrorBox>}
          {resetState === 'done' && <div className="reset-ok">已重置，当前数据为空。</div>}
          {confirming ? (
            <div className="reset-confirm">
              <span style={{ color: 'var(--red)', fontWeight: 600 }}>确定要清空吗？此操作不可撤销。</span>
              <button className="btn btn-danger btn-sm" disabled={resetState === 'busy'} onClick={() => void doReset()}>
                {resetState === 'busy' ? '重置中…' : '确认清空'}
              </button>
              <button className="btn btn-sm" disabled={resetState === 'busy'} onClick={() => setConfirming(false)}>
                取消
              </button>
            </div>
          ) : (
            <div>
              <button className="btn" disabled={resetState === 'busy'} onClick={() => setConfirming(true)}>
                重置演示数据
              </button>
            </div>
          )}
        </div>
      </section>
    </>
  )
}
