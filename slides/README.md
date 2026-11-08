# 到点 · 评审演示（HTML 幻灯片）

单文件 HTML + CSS，16:9（1280×720 / 13.333×7.5in），共 10 页。所有截图取自本地运行的真实界面；活动内容为演示数据。

## 导出

```powershell
# PDF（Edge 无头，@page 已设为 13.333in × 7.5in，margin 0）
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" `
  --headless --disable-gpu --no-pdf-header-footer `
  --print-to-pdf="slides\out\ontime-deck.pdf" `
  "slides\slides.html"

# 单页 PNG（1280×720）：slides.html#p1 … #p10
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" `
  --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 `
  --window-size=1280,720 `
  --screenshot="slides\out\page-08.png" `
  "file:///S:/Stellar/ASUS/ontime-wt-slides/slides/slides.html#p8"
```

## 每页要点

| 页 | 标题 | 要点 |
| --- | --- | --- |
| 1 | 封面 | 多来源校园信息行动台；官网 / 邮件 / 聊天截图汇成有据可查的清单 |
| 2 | 信息散着，做法也没留下依据 | 三种来源 + 已经做过的三个动作（截图、备忘录、日历）都只留下结果 |
| 3 | 三条原则 | 字段级来源、不静默覆盖、未确认就直说 |
| 4 | 从一张截图，到一份行动清单 | 六步闭环，两行三列 |
| 5 | 每个字段，都连回原文 | 字段挂出处引文，点击定位，原文改动可发现 |
| 6 | 冲突并排，裁决由人，历史只追加 | 同一字段两种说法并排，不自动覆盖 |
| 7 | 有依据带原文，没依据直说 | 搜索无果显示「未找到明确适用的官方依据」；贴官方链接则逐字段给引文 |
| 8 | 多来源，不是多接几个接口 | 官网同步 / 邮件导入 / 自定义站点 + Agent；同一事件的不同证据 |
| 9 | 现在做到哪，就说到哪 | 四档能力矩阵：真实可用 9 项 / 已实现·待验证 / 已实现·未验证 / 规划 |
| 10 | 收尾 | 现场演示路径与行动台截图 |

## 第 4 页版式（截图闭环）

- 两行三列：第一行 Step 1–3，第二行 Step 4–6。
- 每格截图 360px 宽（1280 画布下 3×360 + 2×32 = 1144，左右各 68）。
- 行间用折返箭头连接 Step 3 → Step 4，保持 1→6 的阅读顺序。
- 截图按步骤裁切后放大：`assets/p5/step1–6.png`。
- 底注收为一行 17px。

## 第 8 页真实数据

| 来源 | 状态 | 数值 |
| --- | --- | --- |
| 官网同步 · UNNC 就业 | 正常 | 0 篇（列表页未解析出条目） |
| 官网同步 · UNNC 新闻 | 正常 | 12 篇 |
| 官网同步 · UNNC 活动 | 最近一次抽取失败 | 5 篇；1 条抽取失败（模型返回空内容） |
| 邮件导入 | `.eml` 已处理 | 1 封（数学建模竞赛校内报名） |
| 站点调研 Agent | 本次调研 | 6 条候选，模型 `ontime/deepseek-flash` |

数据取自本机真实运行库 `backend/ontime.db` 与设置页；不是估算值。

## 第 9 页能力矩阵文案

- **真实可用（9 项）**：截图识别与收录、事件整理与字段来源、跨来源关联 / 冲突、联网核实、行动清单、日历导出、官网同步、站内提醒、站点调研 Agent。
- **已实现 · 待验证**：邮箱自动连接（IMAP）——只读拉取已实现，尚未用真实邮箱账号验证。
- **已实现 · 未验证**：第三方 API 源——JSON 拉取与抽取已实现，缺真实第三方 Key 验证。
- **规划**：多渠道推送、系统级分享扩展——尚未接入，仅作为规划保留。

## 截图来源

| 文件 | 来源界面 |
| --- | --- |
| `assets/capture.png` | 收录页（上传 / 粘贴） |
| `assets/event.png` | 事件详情（1440 宽版本） |
| `assets/event-full.png` | 事件详情整页长截图（1280×2400） |
| `assets/inbox.png` | 收件箱与合并建议 |
| `assets/today.png` | 行动台 |
| `assets/verify-notfound.png` | 联网核实：未找到依据 |
| `assets/verify-url-result.png` | 联网核实：官方链接逐字段结果 |
| `assets/src/sync.png` | 设置页 · 官网栏目（UNNC 三栏真实状态） |
| `assets/src/mail.png` | 设置页 · 邮件导入与已处理 `.eml` |
| `assets/src/agent.png` | 设置页 · 站点调研 Agent 的 6 条候选 |

`assets/p5/*.png`、`assets/src/*.png` 均由原图裁切，未改内容。

## 已知缺口

- UNNC 就业栏目同步成功但解析出 0 条，页面如实写 0 篇，没有补数。
- 邮箱 IMAP 未用真实账号验证；第三方 API 源缺真实 Key，均单列标注。
- 第 8 页的官网截图裁切到设置页三行，保留了右侧按钮边缘；不影响阅读。
