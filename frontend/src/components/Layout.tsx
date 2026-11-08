import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { getToday } from '../api'

export default function Layout() {
  const { pathname } = useLocation()
  const [pending, setPending] = useState(0)

  // 顶部待确认徽标：加载失败（后端未启动）时安静降级，不打扰页面。
  const load = useCallback(async () => {
    try {
      const data = await getToday()
      setPending(data.candidates)
    } catch {
      setPending(0)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, pathname])

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            <span className="brand-dot" />
            到点
          </Link>
          <nav className="nav">
            <NavLink to="/" end>
              行动台
            </NavLink>
            <NavLink to="/capture">收录</NavLink>
            <NavLink to="/inbox">收件箱</NavLink>
            <NavLink to="/settings">设置</NavLink>
          </nav>
          <div className="topbar-right">
            {pending > 0 && (
              <Link to="/inbox" className="pending-pill">
                待确认 <b>{pending}</b> 条
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </>
  )
}
