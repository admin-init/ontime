import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// 开发期把 /api 与 /media 代理到本地 FastAPI 后端。
// 后端没启动时页面仍需正常渲染空态（见 src/pages 各页的降级处理）。
// 需要只检查布局时，可把 VITE_API_TARGET 指向 mock/server.mjs（见 README）。
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const target = env.VITE_API_TARGET || 'http://127.0.0.1:8000'

  return {
    plugins: [react()],
    server: {
      port: 5173,
      proxy: {
        '/api': { target, changeOrigin: true },
        '/media': { target, changeOrigin: true },
      },
    },
  }
})
