import { Link, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { EmptyState } from './components/bits'
import Today from './pages/Today'
import Capture from './pages/Capture'
import Inbox from './pages/Inbox'
import EventDetail from './pages/EventDetail'
import Settings from './pages/Settings'

function NotFound() {
  return (
    <EmptyState
      title="页面不存在"
      desc="你要找的页面不在行动台里。"
      action={
        <Link className="btn" to="/">
          回到行动台
        </Link>
      }
    />
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Today />} />
        <Route path="/capture" element={<Capture />} />
        <Route path="/inbox" element={<Inbox />} />
        <Route path="/events/:id" element={<EventDetail />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
