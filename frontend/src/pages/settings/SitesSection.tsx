import { useState } from 'react'
import { createSite, deleteSite, getSites, type Site } from '../../api'
import { ErrorBox, LoadingRow } from '../../components/bits'
import { useLoad } from '../../hooks'

export default function SitesSection() {
  const { data, error, loading, refresh } = useLoad(() => getSites())
  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')
  const [listUrl, setListUrl] = useState('')
  const [searchUrl, setSearchUrl] = useState('')
  const [adding, setAdding] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const items = data?.items ?? []

  async function onAdd() {
    if (adding) return
    if (!name.trim() || !domain.trim()) return
    if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(domain.trim())) {
      setActionError('域名格式不对，填主站域名即可，如 lib.example.edu.cn')
      return
    }
    setAdding(true)
    setActionError(null)
    try {
      await createSite({
        name: name.trim(),
        domain: domain.trim(),
        list_url: listUrl.trim() || undefined,
        search_url: searchUrl.trim() || undefined,
      })
      setName('')
      setDomain('')
      setListUrl('')
      setSearchUrl('')
      await refresh()
    } catch (e) {
      setActionError((e as Error).message)
    } finally {
      setAdding(false)
    }
  }

  async function onDelete(s: Site) {
    setActionError(null)
    try {
      await deleteSite(s.id)
      setConfirmId(null)
      await refresh()
    } catch (e) {
      setActionError((e as Error).message)
    }
  }

  return (
    <section className="section">
      <div className="section-head">
        <h2>自定义站点</h2>
        <span className="meta section-hint">声明式：先登记站点，再作为可订阅来源或核实限定</span>
      </div>
      <p className="block-note">
        只在你声明的站点内检索：核实与抓取都带上 <b>site:域名</b> 限定。不登录、不绕过访问限制——验证码、付费墙、需要执行脚本的页面一律不处理。
      </p>

      {error && <ErrorBox onRetry={() => void refresh()}>{error}</ErrorBox>}
      {actionError && <ErrorBox>{actionError}</ErrorBox>}
      {loading && <LoadingRow />}

      {!loading && !error && items.length === 0 && (
        <p className="block-note">还没有自定义站点。在下方登记名称和域名即可添加。</p>
      )}

      {items.length > 0 && (
        <ul className="src-list">
          {items.map((s) => (
            <li key={s.id} className="src-item">
              <div className="src-main">
                <div className="src-title">
                  <span className="src-name">{s.name}</span>
                  <span className="src-domain">{s.domain}</span>
                </div>
                <div className="src-sub">
                  {s.list_url ? (
                    <span className="src-url">列表页 {s.list_url}</span>
                  ) : (
                    <span className="meta">未填列表页</span>
                  )}
                  {s.search_url && <span className="src-url">搜索 {s.search_url}</span>}
                </div>
              </div>
              <div className="src-actions">
                {confirmId === s.id ? (
                  <>
                    <button className="text-btn is-danger" onClick={() => void onDelete(s)}>
                      确认删除
                    </button>
                    <button className="text-btn" onClick={() => setConfirmId(null)}>
                      取消
                    </button>
                  </>
                ) : (
                  <button className="text-btn" onClick={() => setConfirmId(s.id)}>
                    删除
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="add-form">
        <div className="add-grid">
          <input
            className="input"
            placeholder="站点名称，如：校图书馆"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="input"
            placeholder="域名，如 lib.example.edu.cn"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
          />
        </div>
        <div className="add-grid">
          <input
            className="input"
            placeholder="列表页地址（可选）"
            value={listUrl}
            onChange={(e) => setListUrl(e.target.value)}
          />
          <input
            className="input"
            placeholder="搜索地址（可选，如 https://…/search?q={q}）"
            value={searchUrl}
            onChange={(e) => setSearchUrl(e.target.value)}
          />
        </div>
        <div className="form-foot">
          <span className="meta">列表页地址可一键转为官网栏目定时同步；搜索地址用于核实时限定站点。</span>
          <button
            className="btn btn-primary btn-sm"
            disabled={adding || !name.trim() || !domain.trim()}
            onClick={() => void onAdd()}
          >
            {adding ? '添加中…' : '添加站点'}
          </button>
        </div>
      </div>
    </section>
  )
}
