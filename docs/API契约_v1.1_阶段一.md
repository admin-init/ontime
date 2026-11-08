# 到点 · API 契约 v1.1（阶段一新增）

在 `API契约_v1.md` 基础上**只增不改**。所有新接口都要求 `Content-Type: application/json`（除 multipart）。
时间一律 ISO；`*_display` 仍由后端格式化。

## 来源管理（官网同步）

```ts
type WatchTarget = {
  id: string; name: string; url: string; selector: string | null;
  cron: string | null; enabled: boolean;
  last_run_at: string | null; last_error: string | null;
  last_status: "never" | "ok" | "partial" | "failed";
  source_count: number;
};

type SyncRun = {
  id: string; target_id: string; started_at: string; finished_at: string | null;
  status: "running" | "ok" | "partial" | "failed";
  found: number; created: number; changed: number; error: string | null;
};
```

| 方法 | 路径 | 请求 | 返回 |
|---|---|---|---|
| GET | `/api/watch-targets` | — | `{items: WatchTarget[]}` |
| POST | `/api/watch-targets` | `{name, url, selector?, cron?}` | `WatchTarget` |
| PATCH | `/api/watch-targets/{id}` | `{name?, enabled?, cron?}` | `WatchTarget` |
| DELETE | `/api/watch-targets/{id}` | — | `{ok:true}` |
| POST | `/api/watch-targets/{id}/sync` | — | `{job_id}`（异步，进度看 `/api/jobs/{id}`） |
| GET | `/api/sync-runs?target_id=&limit=20` | — | `{items: SyncRun[]}` |

行为要求：
- 抓取列表页 → 解析文章链接 → 逐篇抓正文（trafilatura）→ 按 URL 去重写入 `source.kind="web"` → 走现有抽取流水线。
- 同一 URL 再次抓取且正文变化时：旧 quote 失配的 claim 置 `stale`，并生成 `change`（pending），**不覆盖**；`SyncRun.changed` 记录本次失效的依据条数。
- 单次同步最多处理 10 篇新文章；抽取失败写 `SyncRun.error` 与 `WatchTarget.last_error`，下次同步会重试 `status=failed` 的来源，不影响已有数据。
- 抽取结果为 `actionable=false` 的新闻/宣传稿只保留来源与摘要，**不生成候选事件**。

## 自定义站点（声明式）

```ts
type Site = {
  id: string; name: string; domain: string;
  list_url: string | null; search_url: string | null;
  enabled: boolean; created_at: string;
};
```

| 方法 | 路径 | 请求 | 返回 |
|---|---|---|---|
| GET | `/api/sites` | — | `{items: Site[]}` |
| POST | `/api/sites` | `{name, domain, list_url?, search_url?}` | `Site` |
| DELETE | `/api/sites/{id}` | — | `{ok:true}` |

- 站点只用于：① 作为可订阅来源（`list_url` 可一键转为 WatchTarget）；② 核实时附加 `site:domain` 限定。
- 不实现登录、验证码、付费墙、脚本执行。

## 邮件

```ts
type MailImport = {
  source_id: string; subject: string | null; from: string | null;
  date: string | null; job_state: string;
};
```

| 方法 | 路径 | 请求 | 返回 |
|---|---|---|---|
| POST | `/api/mail/import` | multipart `file`（`.eml` / `.mbox`） | `{job_ids: string[], source_ids: string[]}` |
| GET | `/api/mail/imports` | — | `{items: MailImport[]}` |
| POST | `/api/mail/imap/test` | `{host, port, username, password}` | `{ok: boolean, message: string}` |
| POST | `/api/mail/imap/sync` | `{host, port, username, password, since_days?, query?}` | `{job_id}` |
| GET | `/api/mail/imap/status` | — | `{configured: boolean, verified: boolean, last_sync_at: string \| null, error: string \| null}` |

- 附件：PDF 用 pypdf 抽文字并入正文；图片走现有截图 OCR。
- IMAP 只读：`BODY.PEEK`，不标已读、不发信、不删信。
- **凭证不落库**：只写后端本地 `~/.ontime/imap.json`（权限 600），接口返回里永远不回显密码。
- 没有真实账号时 `verified=false`，UI 必须显示「已实现 / 未验证」。

## 提醒

```ts
type Reminder = {
  id: string; task_id: string; event_id: string | null;
  title: string; fire_at: string; state: "scheduled" | "sent" | "dismissed";
};
```

| 方法 | 路径 | 请求 | 返回 |
|---|---|---|---|
| GET | `/api/reminders` | — | `{items: Reminder[]}` |
| POST | `/api/reminders/sync` | — | `{created: number}`（按 open 任务的 `due_at` 生成，默认提前 2 小时） |
| POST | `/api/reminders/{id}/dismiss` | — | `{ok:true}` |

前端：页面打开时请求浏览器通知权限；到点的提醒用 `new Notification()` 弹出，失败则只在站内显示。

## 能力矩阵变更

`/api/capabilities` 的 `level` 增加 `"verified"`（已实现且实测）与 `"unverified"`（已实现但缺条件验证）。
阶段一完成后：`crawl`、`site`、`reminder` → `verified`；`imap` → `unverified`。

## 不变的部分

- 事件/字段/claim/合并/核实的所有既有接口与字段**不改**。
- 所有新写入仍必须经过 `claims.add_claim()`，不得直接改语义字段。
