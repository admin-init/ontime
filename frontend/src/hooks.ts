import { useCallback, useEffect, useState } from 'react'
import { getJob, type JobData } from './api'

/**
 * 每 intervalMs 轮询一次 job，直到 done / failed。
 * jobId 为 null 时不轮询。请求失败视为 failed，让页面展示错误与重试。
 */
export function usePollJob(jobId: string | null, intervalMs = 600): JobData | null {
  const [job, setJob] = useState<JobData | null>(null)
  useEffect(() => {
    if (!jobId) {
      setJob(null)
      return
    }
    let alive = true
    let timer: number | undefined
    setJob(null)
    const tick = async () => {
      try {
        const data = await getJob(jobId)
        if (!alive) return
        setJob(data)
        if (data.state === 'done' || data.state === 'failed') return
      } catch (err) {
        if (!alive) return
        setJob({ id: jobId, state: 'failed', stage: null, result: null, error: (err as Error).message })
        return
      }
      timer = window.setTimeout(tick, intervalMs)
    }
    void tick()
    return () => {
      alive = false
      if (timer) window.clearTimeout(timer)
    }
  }, [jobId, intervalMs])
  return job
}

/** 简单数据加载：首次自动加载，refresh() 手动重新拉取。失败不抛出，落在 error 里。 */
export function useLoad<T>(load: () => Promise<T>, deps: ReadonlyArray<unknown> = []) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let alive = true
    setLoading(true)
    load().then(
      (d) => {
        if (!alive) return
        setData(d)
        setError(null)
        setLoading(false)
      },
      (e: unknown) => {
        if (!alive) return
        setError((e as Error).message ?? '加载失败')
        setLoading(false)
      },
    )
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const refresh = useCallback(() => setNonce((n) => n + 1), [])
  return { data, error, loading, refresh }
}
