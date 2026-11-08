# 到点 · 前后端接口契约 v1（冻结）

后端 base：`/api`。开发期前端 `vite` 代理 `/api` → `http://127.0.0.1:8000`。
所有时间为 ISO 字符串；`*_display` 字段是后端已格式化好的中文展示文本，前端直接渲染，不要再自己算。

## 通用对象

```ts
type Claim = {
  id: string; value: any; display: string | null;
  status: "supported" | "user_confirmed" | "conflict" | "needs_anchor" | "insufficient" | "rejected";
  origin: "model" | "user" | "rule" | "import";
  quote: string | null; quote_start: number | null; quote_end: number | null;
  source: { id: string; kind: "screenshot"|"text"|"web"|"mail"|"link";
            title: string | null; url: string | null;
            image_url: string | null; published_at: string | null } | null;
};

type Field = {
  key: string; label: string;            // label 已是中文，如「活动时间」
  value: any; display: string | null;    // display 可直接渲染
  status: string;                        // 见 Claim.status，另有 "unconfirmed"（无任何依据）
  precision: "date" | "datetime" | "range" | null;
  claims: Claim[];
};

type Task = {
  id: string; action: string; state: "open" | "done" | "dismissed";
  due_at: string | null; due_display: string | null;
  materials: string[]; submit_channel: string | null;
  fields: Field[];                       // action / due_at / materials / submit_channel
};

type EventBrief = {
  id: string; title: string; state: "candidate" | "confirmed" | "ignored" | "merged";  // 列表不含 merged；直接打开已合并事件 URL 时为 merged，文案「已并入其他事件」
  org: string | null; location: string | null;
  start_at: string | null; start_display: string | null;
  fields: Field[]; tasks: Task[];
  task_count: number; open_task_count: number;
  conflict_count: number; pending_count: number;
  created_at: string;
};

type EventDetail = EventBrief & {
  rules: { id: string; text: string; impact: "high"|"normal"; state: string; claims: Claim[] }[];
  sources: { id: string; kind: string; title: string|null; url: string|null;
             image_url: string|null; fetched_at: string; published_at: string|null; excerpt: string }[];
  history: { at: string; field: string; label: string; display: string|null;
             status: string; origin: string; source: string|null; kind: string|null }[];
  merge_id: string | null;
};
```

## 读取

| 方法 | 路径 | 返回 |
|---|---|---|
| GET | `/api/health` | `{ok, db, model:{ok,model,error?}, school, college}` |
| GET | `/api/capabilities` | `{items:[{key,name,level:"live"\|"entry",note}]}` |
| GET | `/api/today` | `{events: EventBrief[], tasks: TaskRow[], candidates: number}`，`TaskRow={id,event_id,event_title,action,due_at,due_display,state}`；`events` 与 `tasks` 只含 `state=confirmed` 的事件，候选事件不计入行动台 |
| GET | `/api/inbox` | `{candidates: Candidate[], merges: Merge[], changes: [], counts:{candidates,merges,changes}}` |
| GET | `/api/events` | `{items: EventBrief[]}` |
| GET | `/api/events/{id}` | `EventDetail` |
| GET | `/api/jobs/{id}` | `{id,state:"queued"\|"running"\|"done"\|"failed",stage:{stage,steps:[{key,label,state:"todo"\|"active"\|"done"\|"failed"}],message},result,error}` |
| GET | `/api/events/{id}/ics` | `text/calendar` 文件流 |

```ts
type Candidate = EventBrief & {
  summary: string | null;
  questions: string[];                 // 需要用户确认的问题
  source: { id: string|null; kind: string|null; title: string|null; image_url: string|null };
};

type Merge = {
  id: string; score: number; reasons: string[]; state: "pending";   // score 为 0–5 的匹配分，不是百分比
  a: { id: string; title: string; start_display: string|null };
  b: { id: string; title: string; start_display: string|null };
  diff: { kind: "add"|"change"|"task"|"material"; field: string; label: string;
          old: string|null; new: string|null }[];
};
```

## 写入

| 方法 | 路径 | 请求体 | 说明 |
|---|---|---|---|
| POST | `/api/ingest/screenshot` | `multipart/form-data`，字段名 `file` | → `{job_id, source_id}`，立刻开始处理 |
| POST | `/api/ingest/text` | `{text, title?}` | 同上 |
| POST | `/api/events/{id}/confirm` | — | → `EventDetail` |
| PATCH | `/api/events/{id}` | `{field, value}` | 用户手改字段 → `EventDetail` |
| POST | `/api/events/{id}/verify` | — | → `{job_id}`，完成后 `job.result` 见下 |
| POST | `/api/verify/url` | `{event_id, url}` | 可选兜底：不检索，只抓取该官方链接并核对；同步返回 `VerifyResult`（额外带 `mode:"url"`），同时记一条 `type="verify_url"` 的 job 留痕 |
| POST | `/api/findings/apply` | `{event_id, field, value, quote, source_id, impact}` | → `EventDetail` |
| POST | `/api/claims/{id}/decide` | `{action:"accept"\|"reject"}` | 字段来源裁决 |
| POST | `/api/merge/{id}` | `{action:"accept"\|"reject"}` | → `{ok,state,event_id?}` |
| POST | `/api/tasks/{id}/toggle` | — | → `{ok,state}` |
| POST | `/api/demo/reset` | — | 清空所有数据与截图 |

### 核实结果（`job.result`，`state === "done"` 时）

```ts
type VerifyResult = {
  status: "found" | "conflict" | "not_found";
  message: string;
  query: string[];
  sources: { id: string; title: string; url: string; domain: string; official: boolean; chars: number }[];
  findings: {
    id: string; field: string; label: string;
    value: any; display: string | null; quote: string;
    source_id: string; source_title: string; source_url: string;
    official: boolean; state: "supported" | "conflict" | "needs_review";
    impact: "high" | "normal"; note: string;
  }[];
  checked_at: string;
  mode?: "url";        // 仅 /api/verify/url 返回；检索路径无此字段
};
```

`/api/verify/url` 是可选兜底路径：搜索引擎尚未收录时（或已知官方页面地址时），用户可贴入官方链接直接核对。
抓不到正文、页面与事件不适用、或 quote 校验不通过时，同样返回 `status: "not_found"`，不伪造结论。

## 前端路由与要求

| 路由 | 关键内容 |
|---|---|
| `/` 行动台 | 近 7 天截止（按 `due_display` 升序、`open` 优先）、已确认事件、待确认入口；顶部显示「待确认 N 条」 |
| `/capture` 收录 | 大拖拽/点击上传 + `Ctrl+V` 粘贴 + 文本框；上传后显示 `stage.steps` 四步进度（识别截图→整理事项→查找关联事件→等待确认），完成后跳转 `/inbox` 或事件详情 |
| `/inbox` 收件箱 | 候选事件卡（含截图缩略、summary、questions）+ 合并建议卡（`diff` 表格显示 旧值/新值） |
| `/events/:id` 详情 | 字段表（每个字段右侧状态点，点击展开 `claims`：原文片段 + 来源）；任务清单可勾选；「联网核实」面板；规则区；历史 |
| `/settings` 设置 | 能力矩阵（`/api/capabilities`，live/entry 两档徽标）、演示重置按钮、隐私说明 |

交互硬要求：
- 字段状态 `conflict` 必须并排显示候选值与各自来源，用户点选后调 `/api/claims/{id}/decide`；不得自动选。
- `needs_anchor` 显示「缺少日期依据，待确认」，并允许用户补日期（`PATCH /api/events/{id}`）。
- 核实结果里 `not_found` 必须显示「未找到明确适用的官方依据」，不得显示任何结论。
- 「演示暂未接入」的入口用灰底徽标，不可假装已连接。

## 视觉方向

白底、细边框、低饱和；主色墨绿 `#0E7C66`，正文 `#1C1917`，次要文字 `#78716C`，背景 `#FAFAF9`，边框 `#E7E5E4`。
中文优先字体：`"PingFang SC","Microsoft YaHei","Noto Sans SC",system-ui`。
卡片圆角 10–12px，边框 1px，阴影几乎不用。信息密度适中，不用聊天气泡、不展示 JSON、不显示调试字段。
桌面录制清晰：主内容最大宽度 1120px，最小字号 13px，关键数字 20–28px。
