# 到点宣传片 · 剪辑交接（v4）

最后更新：2026-11-09｜分支 `feat/video`｜当前成片 `video/out/promo-v4.mp4`
规格：**121.7 秒 / 3651 帧 / 1920×1080 / 30fps / H.264 + AAC / 33.5 MiB**

旧版保留：`promo-v3.mp4`（130.4s）、`promo-105s-v1.mp4`、`promo-105s-v2.mp4`、`promo-105s-v2-20pct.mp4`、`promo-105s-silent.mp4`。

---

## 1. 工程结构

工程根：`video/remotion/`

```
src/
  index.ts               registerRoot，唯一入口
  Root.tsx               两个 Composition：
                           Promo105        （带字幕，默认）
                           Promo105-NoSubs （同时间线，showSubtitles=false）
                         1920×1080 / 30fps / durationInFrames=TOTAL_FRAMES(3651)
  Promo.tsx              总装：Opening 序列 + 所有非 open 镜头 Sequence
                         + 全局 TopBar + Subtitles + Soundtrack
  timeline.ts            唯一时间线源：BASE_SHOTS（0 起点）+ TITLE_SECONDS=3
                         + SHOTS + CHAPTERS + TOTAL_FRAMES
  theme.ts               色板、FONT、MONO、STAGE（x=210,y=44,w=1500,h=937.5）
  captions.json          33 条字幕（秒），build-srt 的数据源
  audio-manifest.json    prepare-audio 生成；BGM 入点/音量/淡入淡出、3 个 whoosh、署名
  clips-manifest.json    prepare-media 生成；每个片段的源/倍率/实际时长
  components/
    Chrome.tsx           PaperFill / ScreenFrame / TopBar（38px 章节标签）
    MediaShot.tsx        录屏/静帧 + scale/translate 推近 + callout 层 + 末帧兜底
    Callout.tsx          细线框 + 说明；随 zoom 反算字号/线宽
    Subtitles.tsx        烧录字幕；读 captions.json
    Soundtrack.tsx       BGM（Sequence from 12s）+ 3 个 whoosh
  scenes/
    TitleCard.tsx        0–3s 片头
    Opening.tsx          3–13s 痛点三卡（官网/群聊/日历示意）
    Thesis.tsx           13–21s 主张 1/2
    DualValue.tsx        59.5–62.5s 两地点对照
    Statement.tsx        冲突/核实原则卡
    EndCard.tsx          117.2–121.7s 片尾 + 一行边界说明 + BGM 署名
    Concept.tsx          旧「指定网站查询规划」卡，**当前未使用**
scripts/
  prepare-media.mjs      复制 recordings → public/media；ffmpeg 预切/变速/抽末帧
  prepare-audio.mjs      复制 BGM/SFX；用 ffmpeg 拼 bgm-v3.mp3；写 audio-manifest
  build-srt.mjs          captions.json → video/subtitles/promo.zh.srt
public/
  media/clips/*.mp4      预切片段（生成物，已忽略）
  media/clips/*-last.png 每个片段最后一帧（兜底）
  media/stills/*.png     4 张真实静帧（生成物，已忽略）
  media/img/*.png        unnc_notice.png / unnc_chat.png（生成物，已忽略）
  audio/bgm-v3.mp3       131.5s 拼接 BGM 床（生成物，已忽略）
  audio/whoosh-transition.mp3
package.json             scripts：prepare-media / prepare-audio / captions / dev / render / render:nosubs / still
```

`public/media/`、`public/audio/`、`node_modules/`、`video/out/`、`recordings/` 都不入库。

---

## 2. 渲染

```powershell
$env:PATH = "C:\Users\stellarz\AppData\Roaming\fnm\node-versions\v22.23.4\installation;$env:PATH"
cd video/remotion
npm install --registry=https://registry.npmmirror.com
npm run prepare-media     # 需要 ffmpeg/ffprobe + recordings/_trial + _multisource + _export-ics
npm run prepare-audio     # 需要 video/assets/bgm/bgm-main.mp3 + video/assets/sfx/whoosh-transition.mp3
npm run captions          # 33 条 SRT
npm run render            # 输出 ../out/promo-v4.mp4
```

`npm run render` 实际参数：

```powershell
npx remotion render Promo105 ../out/promo-v4.mp4 `
  --codec=h264 --crf=20 --pixel-format=yuv420p --concurrency=4
```

- 分辨率 1920×1080，30fps，CRF 20，yuv420p，并发 4。
- 无字幕版：`npm run render:nosubs` → `../out/promo-v4-nosubs.mp4`。
- 单帧：`npm run still`（默认 frame 3000）。
- 当前成片 121.7s，3651 帧；AAC 音轨。
- 旧版成片在 `video/out/`，不要覆盖。

---

## 3. 时间线（以成片时间计）

`timeline.ts` 里 `BASE_SHOTS` 是 0 起点；`SHOTS` 统一 +3s 标题偏移。下表已经是成片时间。

| 时间 | 章节标签 | 素材 | 倍率 | 聚焦（归一化 x,y）/ 推近 |
|---|---|---|---|---|
| 0–3 | （隐藏） | `TitleCard` 字卡 | — | — |
| 3–6 | 散落的信息 | `Opening`：`unnc_notice.png` + `unnc_chat.png` + 日历示意 | 静帧入场 | — |
| 6–9.5 | 散落的信息 | 同上，三卡并置 | — | — |
| 9.5–13 | 散落的信息 | 同上，卡片退后 + 「信息都在。事情没成。」 | 轻微散开/模糊 | — |
| 13–16.6 | 连回原文 | 字卡 | — | — |
| 16.6–21 | 连回原文 | 字卡 + `unnc_notice.png` 引文卡 | — | — |
| 21–25.5 | 截图收录 | `02-notice-ingest` 0–34s | **8×** | (0.50,0.36) 1.00→1.04 |
| 25.5–27.9 | 截图收录 | `02` @31.6s 静帧 | — | (0.45,0.30) 1.00→1.08 |
| 27.9–32.4 | 结构化事件 | `03-confirm-detail` 1.0–6.0s | 1.1× | (0.48,0.30) 1.00→1.20 |
| 32.4–36.9 | 结构化事件 | `04-fields-source` 0.4–4.9s | 1× | (0.35,0.40) 1.00→1.35 |
| 36.9–43 | 结构化事件 | `04b-task-pending` @3.2s 静帧 | — | (0.35,0.70) 1.50→1.70 |
| 43–46.2 | 冲突裁决 | `05-chat-ingest` 1.4–51.2s | **16×** | (0.50,0.36) 1.00→1.03 |
| 46.2–50 | 冲突裁决 | `05` @52.0s 静帧 | — | (0.52,0.85) 1.35→1.40 |
| 50–53.8 | 冲突裁决 | `06-merge-conflict` 1.2–3.1s | **0.5× 慢放** | (0.45,0.78) 1.00→1.28 |
| 53.8–59.5 | 冲突裁决 | `06` 6.8–9.66s | **0.5× 慢放** | (0.38,0.62) 1.00→1.55 |
| 59.5–62.5 | 冲突裁决 | `DualValue` 字卡 | — | — |
| 62.5–65 | 冲突裁决 | `Statement` 冲突卡 | — | — |
| 65–69.666 | 联网核实 | `07-verify-search` 0.9–7.2s | **1.35×** | (0.35,0.55) 1.00→1.18 |
| 69.666–72.8 | 联网核实 | `07` @7.6s 静帧 | — | (0.35,0.62) 1.00→1.12 |
| 72.8–76.8 | 联网核实 | `08-link-verify-apply-export` 5.5–14.2s | **2.2×** | (0.35,0.65) 1.00→1.15 |
| 76.8–81.1 | 联网核实 | `08` 14.3–17.8s | 1× | (0.35,0.62) 1.00→1.25 |
| 81.1–85 | 联网核实 | `Statement` 核实卡 | — | — |
| 85–89.2 | 行动清单 | `09-action-final` 0.2–4.0s | 0.92× | (0.30,0.12) 1.45→1.75 |
| 89.2–93.6 | 行动清单 | `04b-task-pending` 3.0–6.1s | **0.7× 慢放** | (0.35,0.55) 1.00→1.60 |
| 93.6–96.2 | 行动清单 | `09-action-final` 6.4–7.8s | **0.54× 慢放** | (0.35,0.72) 1.00→1.45 |
| 96.2–100.2 | 行动清单 | `10-export-ics` 0.5–4.5s（补录） | 1× | (0.76,0.30) 1.30→1.42 |
| 100.2–104.8 | 多来源 | `ms-sync` 3.2–7.8s | 1× | (0.50,0.50) 1.15→1.20 |
| 104.8–106.8 | 多来源 | `ms-email2-start` 2.6–4.6s | 1×（跳切） | (0.50,0.75) 1.00→1.08 |
| 106.8–108.7 | 多来源 | `ms-email2-done` 3.1–5.0s | 1× | (0.50,0.38) 1.15→1.18 |
| 108.7–111.5 | 多来源 | `ms-inbox2` 2.6–5.4s | 1× | (0.50,0.30) 1.00→1.10 |
| 111.5–114.1 | 多来源 | `ms-reminder2` 3.4–6.0s | 1× | (0.50,0.30) 1.00→1.10 |
| 114.1–117.2 | 多来源 | `ms-agent3` 14.6–18.2s | **1.15×** | (0.50,0.68) 1.30→1.38 |
| 117.2–121.7 | （隐藏） | `EndCard` + 一行边界说明 + BGM 署名 | — | — |

章节标签由 `components/Chrome.tsx` 的 `TopBar` 统一画；`CHAPTERS` 在 `timeline.ts`。字号 38px / 600，位置 left=48、top=40；「到点」`#20201E`，「/ 功能名」`#72706B`；圆点 9px。`TitleCard` 与 `EndCard` 的 shot 设 `hideBar: true`。旧的右上角 tag 胶囊已删除，只保留加速倍率/事实性 note。

---

## 4. 组件约定

### 字幕 `components/Subtitles.tsx`

- 字号 **30px**，字重 500，行高 1.35，字距 0.015em。
- 底边距 **108px**（1080 的 10%）；水平居中。
- 深色底 `rgba(32,32,30,0.80)`，白字 `#FFFEFC`，padding 8×18，圆角 8。
- 每条字幕由 `src/captions.json` 的 `start/end`（秒）驱动；`build-srt.mjs` 生成同源 SRT。

### 标注 `components/Callout.tsx`

- 说明字号 **23px**（比 30px 字幕小一号），字重 500，行高 1.3。
- 框线 **2.5px**；左右侧标签固定宽 `170/zoom`；上下标签 `max-content`，上限 `360/zoom`。
- 坐标 `box: [x,y,w,h]` 是源画面归一化值（0–1）；`side: top|bottom|left|right`。
- 常用色：品牌绿 `#1D4A3B`、冲突 `#B45B3E`、次要 `#72706B`。

### 章节标签 `components/Chrome.tsx` 的 `TopBar`

- 左：绿点 + `到点`（38px/600）+ `/` + 章节名（38px/600，`#72706B`）。
- 右：shot.note（真实耗时/倍率，13px）；不再显示 tag 胶囊。
- 位置：left=48，top=40；只压到录屏框顶部空白纸面，不挡 App 内容和字幕。
- `hideBar` 的镜头：片头 0–3、片尾 117.2–121.7。

### 字体

```ts
FONT = '"Noto Sans SC", "Microsoft YaHei", "PingFang SC", system-ui, ...'
MONO = '"Cascadia Mono", "Consolas", ...'
```

本机 Windows 用 Microsoft YaHei 兜底；换机器没装 Noto Sans SC / 中文字体时，字宽会变，标注换行和字幕行宽要复查。

---

## 5. 素材现状

### `recordings/_trial/`（旧闭环，未重新录制）

- 视频：`01-reset`、`02-notice-ingest`、`03-confirm-detail`、`04-fields-source`、`04b-task-pending`、`05-chat-ingest`、`06-merge-conflict`、`07-verify-search`、`08-link-verify-apply-export`、`09-action-final`。
- 静帧：`stills/02-inbox.png`、`04b-task-pending.png`、`05-merge.png`、`07-notfound.png` 等；当前只用前四个。
- 原始 webm 在 `_trial/raw/`；`downloads/ontime-61d54b.ics` 是 v3 真实导出文件（v4 已改为新录制的 `ontime-770ecd.ics`，旧的只作历史留存）。

### `recordings/_multisource/`（已忽略）

| 源文件 | 时长 | 用途 |
|---|---|---|
| `ms-sync.mp4` | 8.0s | 设置 → 三个 UNNC 栏目 → UNNC 新闻二次同步 |
| `ms-email2-start.mp4` | 6.9s | 邮箱导入区 + 选择 `.eml` + 处理中 |
| `ms-email2-done.mp4` | 7.3s | 正确主题邮件行「已处理」 |
| `ms-inbox2.mp4` | 9.9s | 收件箱 6 条候选，顶部邮件来源 |
| `ms-reminder2.mp4` | 9.0s | 行动台顶部 6 条待确认 + 提醒 |
| `ms-agent3.mp4` | 25.3s | Agent 调研：表单、10.2s 运行、5 条结果、写入按钮 |
| `ms-capability.mp4` | 8.6s | 设置页能力矩阵（**v4 不再使用**） |

真实结果：UNNC 新闻二次同步 **3 秒**，12 篇；邮件解析 **23.7 秒**；Agent **10.2 秒**，返回 5 条真实条目。v4 的 Agent 镜头只取 `14.6–18.2s`，在页面滚动到「能力矩阵」之前截断。

### `recordings/_export-ics/`（v4 新增，已忽略）

- `export-ics.mp4`：1440×900 / 30fps / 4.53s，真实事件详情页点击「导出日历」→ 出现「已导出日历」。
- `report.json`：点击/下载/反馈的时间标记；`toast.png` 是反馈截图。
- 补录脚本：`video/tools/record-export-ics.mjs`（前置 5173 + 8000，事件 ID 可用 `EVENT_ID` 覆盖）。
- 说明：录制时为了缩略图不出现 404，把 `fixtures/demo/unnc_notice.png` / `unnc_chat.png` 复制到了 main 工作区 `storage/media/screenshots/` 中 DB 引用的两个 hash 文件名；这是演示素材，不是伪造 UI。

### `video/assets/`

- `bgm/bgm-main.mp3`：Kevin MacLeod《Continue Life》，CC BY 4.0，114.024s，-20 LUFS。**当前使用**。
- `sfx/whoosh-transition.mp3`：21/43/65s，音量 0.12，提前 1.1s 起。
- `prepare-audio.mjs` 会拼 `public/audio/bgm-v3.mp3`：原曲 0:09–1:54（105s）+ 原曲前 27s，0.5s 交叉淡化，131.5s 床。BGM 在片子 0:12 进，0.5s 淡入、最后 2s 淡出、0.30。

---

## 6. v4 的关键改动

1. **章节标签放大**：38px/600，left=48/top=40，保留「● 到点 / 功能名」。
2. **删掉「能力边界，写清楚。」整屏卡**（IMAP / 第三方 API / 推送），也删掉「边界」章节标签。
3. **删掉能力矩阵镜头**（`ms-capability`），并把 Agent 结果镜头截断在能力矩阵之前。
4. **删除导出旧文件卡**，补录 4 秒真实交互：点击「导出日历」→「已导出日历」。
5. **字幕补全**：新增导出、邮件已处理；删除边界说明；合并 Agent 结果说明。共 33 条。
6. **片尾减负**：去掉「真实可用：…」能力清单；只保留 15px 一行「邮箱自动连接与第三方 API 尚未验证。」，放在署名上方。
7. **清掉报告式角标**：「1 条抽取失败 · 保留」「真实文件」「真实检索」「真实收录过程」「站内提醒 · 真实」「not_found · 未给出结论」「5 条 · 用时 10.2 秒」等。

---

## 7. 已知问题

1. **Agent 结果页仍有 App 自带的「候选条目（5 条，来自本次真实访问）· 模型 ontime/deepseek-flash · 用时 10.2 秒」小字。** 这是真实 UI，v4 没有 P 掉；镜头已推近到结果列表，字幕只讲 5 条活动和原文。
2. **UNNC 活动抽取失败行保留在官网同步画面里。** 失败本身是真实结果；v4 去掉了「1 条抽取失败 · 保留」的编辑角标。
3. **邮件解析是跳切，不是连续加速。** 104.8–108.7s 从导入区切到「已处理」行，标「×6 实际约 24 秒」；实际等待 23.7s。
4. **Agent 按钮真实文案是「写入并替换当前规则」。** v4 没有点击，也没写成「已写入」；结果镜头只到 5 条条目。
5. **数据里的重复条目。** 收件箱 6 条、提醒列表有两条「登录链接完成活动注册」，是多次邮件导入测试留下的真实数据；片子保留真实列表。
6. **计数裁切。** 官网同步/Agent 结果镜头的顶栏「待确认 6」被推近裁掉，不一致的数字不露出来。
7. **未使用代码。** `scenes/Concept.tsx` 当前没有镜头引用。

---

## 8. 新会话最容易踩的坑

1. **先跑 `prepare-media`。** `public/media` 不入库；需要本机 `recordings/_trial`、`_multisource`、`_export-ics` 存在。
2. **`prepare-audio` 会覆盖 `src/audio-manifest.json`。** 不要手改 manifest 后直接 render。
3. **字幕是两处。** `src/captions.json` 是源，`video/subtitles/promo.zh.srt` 是生成物；改字幕必须 `npm run captions`。当前 33 条，最后一条 117.2–121.7。
4. **时间线有 3 秒标题偏移。** `BASE_SHOTS` 是 0 起点；`SHOTS` 统一 +3；`TOTAL_FRAMES` 取最后一个 shot 的 end。
5. **片段的 `clipDuration` 是手写的。** 改 `prepare-media` 的入点/倍率后，要同步改 `timeline.ts` 里对应 shot 的 `clipDuration`。
6. **标注坐标是源画面归一化值。** 导出按钮的「点导出」框是在 1440×900 源画面上对过位的；重录后需要重对。
7. **渲染前先 `npx tsc --noEmit`。**
8. **大文件别提交。** `video/out/`、`public/media/`、`public/audio/`、`recordings/`、`node_modules/` 都已忽略。
9. **字体。** 换机器后先渲染一帧看标注换行和字幕宽度。
10. **旧版不要覆盖。** v3 是 130.4s；v4 是 121.7s/3651 帧，输出 `promo-v4.mp4`。

---

## 附：最小验收

```powershell
npx tsc --noEmit
ffprobe -v error -show_entries format=duration,size `
  -show_entries stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames `
  -of default=noprint_wrappers=1 ..\out\promo-v4.mp4
# 期望：121.7s / 3651 帧 / 1920x1080 / h264 + aac
```
