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
            <span className="brand-dot" aria-hidden />
            到点
          </Link>
          <nav className="nav" aria-label="主导航">
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
                待确认 <b>{pending}</b>
              </Link>
            )}
          </div>
        </div>
      </header>
      <main className={pathname.startsWith('/events/') ? 'page page-wide' : 'page'}>
        <Outlet />
      </main>
      <footer className="site-foot">
        演示版 · 识别、关联与核实均由真实模型或检索产生，结论以原始出处为准
      </footer>
    </>
  )
}
