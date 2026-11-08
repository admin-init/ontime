# 到点 · API 契约 v1.2（阶段二：站点调研 Agent）

在 v1.1 基础上**只增不改**。阶段二只用于"用户声明的站点"，不做通用搜索、不登录、不绕限制。

## 1. 站点模型扩展

```ts
type Site = {
  id: string; name: string; domain: string;
  kind: "web" | "api";                 // 新增
  list_url: string | null;
  search_url: string | null;
  api_url: string | null;              // kind="api" 时使用
  item_selector: string | null;        // 列表项 CSS
  title_selector: string | null;       // 标题 CSS（相对 item）
  content_selector: string | null;     // 正文 CSS
  profile_source: "manual" | "agent" | null;
  verified: boolean;                   // 是否用真实抓取验证过
  enabled: boolean; created_at: string;
};

type ResearchItem = { title: string; url: string; snippet: string };

type SiteProfile = {
  list_url: string | null;
  item_selector: string | null;
  title_selector: string | null;
  content_selector: string | null;
};
```

| 方法 | 路径 | 请求 | 返回 |
|---|---|---|---|
| GET | `/api/sites` | — | `{items: Site[]}` |
| POST | `/api/sites` | `{name, domain, kind?, list_url?, search_url?, api_url?, api_key?}` | `Site` |
| PATCH | `/api/sites/{id}` | `Site` 的可选子集 | `Site` |
| DELETE | `/api/sites/{id}` | — | `{ok:true}` |
| POST | `/api/sites/research` | `{url, task?, site_id?}` | `{job_id}`（type=`site_research`） |
| POST | `/api/sites/{id}/sync` | — | `{job_id}`（web 用 profile 抓列表；api 拉 JSON） |

## 2. Agent 调研

```ts
POST /api/sites/research
body: { url: string; task?: string; site_id?: string }
-> { job_id: string }
```

`job.result`（`GET /api/jobs/{id}`，state=done）：

```ts
type ResearchResult = {
  mode: "agent";
  items: ResearchItem[];              // 最多 8 条，URL 必须 http/https
  profile: SiteProfile | null;        // 可一键写入站点
  elapsed_ms: number;
  model: string;
  error?: string;                     // 失败时如实返回，items 为空
};
```

行为与边界：
- 后端以**子进程**调用 `opencode run --standalone --agent site-agent --format json`，临时 HOME + 临时工作目录，结束即删。
- 权限：默认全拒；只允许 `read`（工作区）、`webfetch`（http/https，禁内网/localhost/私有地址）；`shell`、`execute` 一律拒绝；`external_directory` 拒绝。
- **不开放 `execute`**（已实测其 `fetch()` 可绕过 webfetch 拒绝）。
- 超时 150s；超时杀进程树；并发上限 1。
- 网页内容视为数据，不作为指令；Agent 只返回 JSON，后端用 Quote 规则与 URL 校验后才入库/展示。
- Agent 不可用（未安装、超时、报错）→ 返回 `mode:"agent"`、`items:[]`、`error` 文案，**不降级成假结果**。

## 3. 第三方 API 源

- `kind:"api"` 的站点：`api_url` 指向用户提供的 JSON 接口，`api_key` 只写本地 `~/.ontime/sites.json`，**不入库、不回显**。
- `/api/sites/{id}/sync`：GET 该接口 → 解析 `items` 数组（字段映射：`title/url/summary`，缺失则跳过）→ 写入 `source.kind="web"`（`meta.origin="api"`）→ 走现有抽取。
- 没有真实 Key 时 `verified=false`，能力矩阵标 `unverified`。

## 4. 能力矩阵

新增：
- `site_agent` → `verified`（有真实调研样例后）
- `api_source` → `unverified`（缺真实 Key）

## 5. 不变

- 事件/字段/claim/合并/核实接口不变。
- 所有写入仍走 `claims.add_claim()`。
