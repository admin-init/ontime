# 到点 · 前端

Vite + React 19 + TypeScript。样式全部写在 `src/styles.css`，没有 Tailwind。

接口以 `../docs/API契约_v1.md`（已冻结）为准；所有请求都经过 `src/api.ts`。

## 启动

```powershell
# Node 22（fnm）
$env:PATH = "C:\Users\stellarz\AppData\Roaming\fnm\node-versions\v22.23.4\installation;$env:PATH"

cd frontend
npm install --registry=https://registry.npmmirror.com
npm run dev        # http://127.0.0.1:5173
```

开发服务器把 `/api` 与 `/media` 代理到 `http://127.0.0.1:8000`。先启动真实后端：

```powershell
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

生产构建：

```powershell
cd frontend
npm run build      # tsc -b && vite build
```

## 页面

| 路由 | 内容 |
|---|---|
| `/` | 行动台：近 7 天截止、已确认事件、待确认入口 |
| `/capture` | 收录：拖拽 / 点击上传、`Ctrl+V` 粘贴、文字收录、四步进度 |
| `/inbox` | 收件箱：候选事件、字段冲突问题、合并建议（旧值 / 新值） |
| `/events/:id` | 详情：字段与出处、冲突裁决、任务、联网核实、规则、历史 |
| `/settings` | 能力矩阵、演示重置、隐私说明 |

## mock 仅用于无后端时的布局检查

`mock/server.mjs` 是**写死数据的假服务**，只在真实后端未启动时用来看布局和空态/长页面是否溢出。它没有模型调用、没有检索、没有持久化，**不是产品能力，也不能用于录制演示**。

```powershell
# 终端 A：假数据服务（默认 127.0.0.1:8787，可用 MOCK_PORT 改端口）
node mock/server.mjs

# 终端 B：让 vite 代理到 mock
$env:VITE_API_TARGET = "http://127.0.0.1:8787"
npm run dev
```

检查完关掉终端、移除 `VITE_API_TARGET`，再用真实后端录制。mock 的候选事件、核实结论、相似度等全部是演示文案，不代表真实识别结果。

## 约定

- 不新增请求封装；需要新接口时先改契约，再改 `src/api.ts`。
- 不把 `*_display` 再格式化一遍，后端已给出中文展示文本。
- 字段冲突必须并排展示候选值与来源，由用户点选，不自动覆盖。
- 找不到官方依据时只显示「未找到明确适用的官方依据」，不给结论。
- 未实现的后台能力只标注「演示暂未接入」，不显示假的连接状态。
