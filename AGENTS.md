# AGENTS.md — 到点 Demo 执行约定

本仓库当前目标是**可录制的最小 Demo**，不是完整产品。所有执行 Agent 必须遵守以下约束。

## 技术栈（已定，不要更换）

- 后端：Python 3.12 + FastAPI + SQLAlchemy 2.0 + SQLite，`uv` 管理。目录 `backend/`。
- 前端：Vite + React 19 + TypeScript，**不使用 Tailwind**，样式写在 `src/styles.css`。目录 `frontend/`。
- 契约：`docs/API契约_v1.md` 是前后端唯一接口依据，改动需先改契约。
- 数据模型：`backend/app/models.py`。语义字段只能经 `app/claims.py` 写入。

## 运行方式（Windows / PowerShell）

```powershell
# Node（fnm 已安装，node 22）
$env:PATH = "C:\Users\stellarz\AppData\Roaming\fnm\node-versions\v22.23.4\installation;$env:PATH"

# 后端
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000

# 前端
cd frontend
npm install --registry=https://registry.npmmirror.com
npm run dev        # http://127.0.0.1:5173
```

模型 Key 不在仓库内：`backend/app/core.py` 会读 `LLM_API_KEY` 或 `~/.ontime/llm_key`。**不要打印、复制或提交密钥。**

## 不可违反的产品规则

1. **不造假。** 识别结果、关联建议、核实结论必须来自真实模型调用或真实检索；不允许写死演示结果冒充识别。
2. **不静默覆盖。** 同一字段出现新值时必须并列展示，由用户确认。
3. **未确认就说未确认。** 找不到依据时显示「未找到明确适用的官方依据」，不得给结论。
4. **能力标注真实。** 未实现的后台能力只能用「演示暂未接入」入口展示，不得显示假的连接状态或同步时间。
5. **隐私。** `storage/`、`*.db`、`.env` 不入库；演示素材不得包含真实私密聊天、真实邮箱或个人凭证。

## 代码边界

- 后端：`app/core.py`（配置/DB）、`app/models.py`（模型）、`app/claims.py`（唯一写入口）、`app/pipeline.py`（收录）、`app/verify.py`（核实）、`app/api.py`（路由）、`app/main.py`（装配）。
- 前端：`src/api.ts`（唯一请求封装）、`src/styles.css`（设计系统）、`src/pages/*`。
- 不要新增数据库迁移工具；Demo 阶段 `create_all` + `POST /api/demo/reset` 即可。
- 不做测试框架建设；只做必要的手动/脚本化验证。

## 汇报格式（必须）

1. 结论与完成状态。
2. 分支、commit、改动文件。
3. 实际验证了什么、结果如何（含命令与关键输出）。
4. 阻塞与需要主控决定的问题。
5. 对接口或共享文件的兼容性变化。
