# HANDOFF — 到点（最后更新 2026-11-09 04:2x）

## 一句话状态

截图闭环 + 多来源 + 站点调研 Agent 全部可运行，真实模型与真实检索验证过。
tag：`v0.1-demo`（演示基线）→ `v0.2-phase1`（官网同步/邮件/提醒/声明式站点）→ `v0.2-phase2`（站点调研 Agent/API 源）。

## 怎么跑

```powershell
# Node（fnm 已装）
$env:PATH = "C:\Users\stellarz\AppData\Roaming\fnm\node-versions\v22.23.4\installation;$env:PATH"

cd backend
uv sync
uv run uvicorn app.main:app --port 8000     # API + /media

cd frontend
npm install --registry=https://registry.npmmirror.com
npm run dev                                  # http://127.0.0.1:5173
```

- 模型 Key：`~/.ontime/llm_key`（或环境变量 `LLM_API_KEY`），**不在仓库**。
- 学校配置：`backend/.env`（`SCHOOL_NAME=宁波诺丁汉大学` / `SCHOOL_DOMAIN=nottingham.edu.cn`），不入库。
- IMAP 凭证：只在 `~/.ontime/imap.json`；第三方 API Key：只在 `~/.ontime/sites.json`。
- 演示重置：设置页「重置演示数据」或 `POST /api/demo/reset`。

## 已真实实现（可演示）

| 能力 | 证据 |
|---|---|
| 截图/粘贴 → 结构化事件 | 视觉模型真实转录 + 抽取；字段带原文 quote |
| 事件/任务分离、字段级来源 | 每个 claim 可点开原文与来源 |
| 跨来源合并、冲突并排 | 不自动覆盖，用户裁决；合并可撤销 |
| 联网核实（搜索） | 360 检索 + 抓原文 + 适用性判断，含 not_found |
| 按需核实官方链接 | `POST /api/verify/url`，真实抓取并逐字段核对 |
| 官网同步 + 变更检测 | UNNC 三栏目真实抓取；正文改动 → stale + change |
| 邮件 `.eml/.mbox` 导入 | 真实解析，重复导入 409 |
| 站内提醒 | 按截止前 2 小时生成；浏览器通知 |
| 自定义站点（声明式） | 核实查询带 `site:` 限定 |
| 站点调研 Agent | 受限 opencode 子进程，真实返回条目 + 解析规则 |
| 日历导出 | `.ics`，DTEND 取 `end_at` |

## 已实现但未验证

- **邮箱自动连接（IMAP 只读）**：代码完成，无真实账号 → `verified=false`，UI 显示「已实现·未验证」。
- **第三方 API 源**：本地 mock 验证链路；无真实第三方 Key → `unverified`。

## 已知限制 / 风险

1. 站点 Agent 的内网拦截按 URL 字面匹配，**未做 DNS 解析后的私网校验**（DNS rebinding 残余风险）；正式环境需网络层出口限制。
2. Agent **不开放 `execute`**：Code Mode 的 `fetch()` 会绕过 `webfetch` 拒绝。解析规则由 Agent 给出选择器、后端执行，不是脚本沙箱。
3. 模型偶发空响应：如实写 `source.status=failed` / `SyncRun.error`，下次同步重试，不造假。
4. 官网同步的 `careers` 栏目是落地页无列表，`found=0`；换栏目即可，无需改代码。
5. 只支持单个 profile、单用户；无登录、无多租户。

## 录屏主线（可分段）

1. 设置 → 重置 → 收录 `fixtures/demo/unnc_notice.png` → 确认事件
2. 收录 `unnc_chat.png` → 合并建议 → 接受 → 地点冲突并排 → 选一个
3. 联网核实（搜索）→ 未找到 → 粘贴官方链接 → 依据 → 写入
4. 设置 → 官网同步（三栏目 + 立即同步）→ 收件箱出现新候选
5. 设置 → 导入 `.eml` → 收件箱出现邮件候选
6. 设置 → 自定义站点 → Agent 调研 → 结果 → 写入解析规则
7. 行动台 → 提醒 → 勾选任务 → 导出 `.ics`

## 产物位置

- 宣传片：`ontime-wt-video/video/out/`（v3 更新中）
- PPT：`ontime-wt-slides/slides/out/ontime-deck.pdf`
- 素材：`fixtures/demo/`（UNNC 通知/群聊、自拟补充、真实历史）
- 调度台账：`docs/调度台账.md`；契约：`docs/API契约_v1*.md`

## 下一步

1. 拿到测试邮箱后验证 IMAP，能力矩阵改 `verified`。
2. 若拿到第三方 API，验证 `api_source`。
3. 素材更新后重渲染宣传片 v3、PPT 第 9 页 + 新「多来源」页。
