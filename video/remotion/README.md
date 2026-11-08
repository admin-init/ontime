# 到点 · 108 秒宣传片（Remotion）

版本：v1 草稿｜2026-11-08｜分支 `feat/video`

成片：`video/out/promo-105s-v2.mp4`（1920×1080 / 30fps / 3240 帧 / 108.0s / H.264 + AAC）
字幕：`video/subtitles/promo.zh.srt`（29 条，UTF-8 无 BOM，同时烧进画面）
素材：只使用 `recordings/_trial/` 的试片与 `fixtures/demo/unnc_*.png`，没有重新录制，没有改 `frontend/` 或 `backend/`。

---

## 1. 环境与安装

- Node 22（本机通过 fnm 的 `v22.23.4`）
- ffmpeg / ffprobe 在 `PATH` 中（本机 ffmpeg 9.0.2）
- Windows PowerShell

```powershell
$env:PATH = "C:\Users\stellarz\AppData\Roaming\fnm\node-versions\v22.23.4\installation;$env:PATH"
cd video/remotion
npm install --registry=https://registry.npmmirror.com
```

## 2. 渲染命令

```powershell
# 1) 把 recordings/_trial 和 fixtures/demo 的素材复制/转成 shot-ready 片段
npm run prepare-media

# 2) 生成独立 SRT（源数据是 src/captions.json）
npm run captions

# 3) 渲染带字幕版
npm run render
# 输出：video/out/promo-105s-v2.mp4

# 无字幕版（同一个时间线，showSubtitles=false）
npm run render:nosubs
# 输出：video/out/promo-105s-v2-nosubs.mp4

# 预览单帧
npm run still
```

`npm run render` 的等效命令：

```powershell
npm run prepare-audio
npx remotion render Promo105 ../out/promo-105s-v2.mp4 `
  --codec=h264 --crf=20 --pixel-format=yuv420p --concurrency=4
```

参数：1920×1080、30fps、3240 帧、H.264 / yuv420p、CRF 20、AAC 音轨。v2 约 27 MB；`promo-105s-v1.mp4` 是上一版 105s 有声版，`promo-105s-silent.mp4` 是无声版。

## 3. 声音

主片用 `video/assets/bgm/bgm-main.mp3`（Kevin MacLeod《Continue Life》，CC BY 4.0，114.024s，-20 LUFS）。`bgm-alt.mp3` 备用，本轮未用。

- BGM 在片子 **0:12** 进（标题卡 0–3s + 痛点段留白），读取音轨 0:09；0.5s 淡入、最后 2s 淡出、音量 0.30。
- `whoosh-transition.mp3` 用在 **21s / 43s / 65s** 三个关键转场，音量 0.12，提前 1.1s 起，峰值落在切点上。
- `npm run prepare-audio` 会把音频复制到 `public/audio/` 并写 `src/audio-manifest.json`；`npm run render` 会自动先跑它。
- 片尾能力声明下方已加署名：`Music: "Continue Life" — Kevin MacLeod (incompetech.com), CC BY 4.0`。
- BGM/SFX 文件不入库（`assets/bgm/*.mp3`、`assets/sfx/*.mp3`、`public/audio/` 已忽略）。

## 4. 工程结构

```
video/remotion/
  src/
    Promo.tsx            总时间线 + 全局字幕/顶栏/声音
    timeline.ts          28 个镜头的起止、素材、倍率、推近、标注（开场 3 段合成 10s）
    captions.json        29 条字幕（秒）
    audio-manifest.json  BGM 入点/音量/淡入淡出、3 个 whoosh 落点、片尾署名
    theme.ts             纸底/墨色/品牌绿/冲突色、1920×1080 画布
    components/
      Chrome.tsx         顶部「到点 / 镜头名 / 实机标签」与外框
      MediaShot.tsx      录屏/静帧 + scale/translate 推近 + 标注层
      Callout.tsx        细线框 + 13px 说明（上下左右四个方向）
      Subtitles.tsx      烧录字幕（可开关）
      Soundtrack.tsx     BGM + whoosh
    scenes/              开场、主张、双值对照、原则卡、导出卡、规划图、片尾
  scripts/
    prepare-media.mjs    复制素材 / ffmpeg 变速切片 / 抽静帧 / 生成清单
    prepare-audio.mjs    复制 BGM/SFX / 写 audio-manifest
    build-srt.mjs        captions.json → video/subtitles/promo.zh.srt
  public/media/          生成物，已忽略，不入库
  public/audio/          生成物，已忽略，不入库
```

`src/timeline.ts` 是这一版剪辑的唯一时间线源。改镜头时长/倍率/推近/标注，只改这里；字幕在 `src/captions.json`，改完跑 `npm run captions`。

## 5. 素材映射

v2 在片头加 3s 标题卡，下表时间整体 +3s；镜头/倍率不变。变速切片由 `prepare-media.mjs` 用 ffmpeg 预切，Remotion 里按 1× 播放，保证帧数与 shot 时长一致；最后一帧 PNG 作为兜底，避免片段比 shot 短时黑帧。

| 镜头 ID | 成片时间 | 素材 | 源入–出 | 倍率 | 片段时长 | 用途 |
|---|---|---|---|---|---|---|
| `u1` | 18.0–22.5 | `02-notice-ingest.mp4` | 0–34.0s | **8×** | 4.27s | 通知收录四步进度；角标「×8 实际约 30 秒」 |
| `u2` | 22.5–24.9 | `02-notice-ingest.mp4` @31.6s | 静帧 | — | 2.4s | 收件箱候选卡 |
| `u3` | 24.9–29.4 | `03-confirm-detail.mp4` | 1.0–6.0s | 1.1× | 4.53s | 确认事件 → 字段 |
| `u4` | 29.4–33.9 | `04-fields-source.mp4` | 0.4–4.9s | 1× | 4.50s | 活动时间展开 + 原文/来源 |
| `u5` | 33.9–40.0 | `04b-task-pending.mp4` @3.2s | 静帧 | — | 6.1s | 报名截止「待确认」+ 材料来自群聊 |
| `d1` | 40.0–43.2 | `05-chat-ingest.mp4` | 1.4–51.2s | **16×** | 3.10s | 群聊收录；角标「×16 实际约 49 秒」 |
| `d2` | 43.2–47.0 | `05-chat-ingest.mp4` @52.0s | 静帧 | — | 3.8s | 合并建议 / 旧值新值 |
| `d3` | 47.0–50.8 | `06-merge-conflict.mp4` | 1.2–3.1s | **0.5× 慢放** | 3.80s | diff 表（地点、新增待办） |
| `d4` | 50.8–56.5 | `06-merge-conflict.mp4` | 6.8–9.66s | **0.5× 慢放** | 5.73s | 地点冲突两候选 + 保留两种说法 |
| `e1` | 62.0–66.666 | `07-verify-search.mp4` | 0.9–7.2s | **1.35×** | 4.67s | 真实检索 → `not_found`；角标「×1.4 实际检索约 5 秒」 |
| `e2` | 66.666–69.8 | `07-verify-search.mp4` @7.6s | 静帧 | — | 3.13s | 「未找到明确适用的官方依据」 |
| `e3` | 69.8–73.8 | `08-link-verify-apply-export.mp4` | 5.5–14.2s | **2.2×** | 3.97s | 贴官方链接 → 核对原文；角标「×2.2 实际约 7 秒」 |
| `e4` | 73.8–78.1 | `08-link-verify-apply-export.mp4` | 14.3–17.8s | 1× | 3.50s | 6 条 findings 的前两条；角标「本屏 2 条 / 共 6 条」 |
| `f1` | 82.0–86.2 | `09-action-final.mp4` | 0.2–4.0s | 0.92× | 4.13s | 勾选「完成注册」/ 未完成清零 |
| `f2` | 86.2–90.6 | `04b-task-pending.mp4` | 3.0–6.1s | **0.7× 慢放** | 4.37s | 材料 chips + 所需材料行 |
| `f3` | 90.6–93.2 | `09-action-final.mp4` | 6.4–7.8s | **0.54× 慢放** | 2.59s | 历史「只追加，不覆盖」 |
| `g1` | 95.0–98.45 | `01-reset.mp4` | 0–1.933s | **0.55× 慢放** | 3.50s | 设置页三条「演示暂未接入」 |

开场 0–10s、主张 10–18s、双值对照 56.5–59.5s、两张原则卡、导出卡、规划图、片尾均为 Remotion 字卡/概念卡，不使用录屏素材。

所有非 1× 的镜头都在右上角标注了倍率与真实耗时（慢放也标「0.5× 慢放」），不假装实时。

## 6. 画面与字幕参数

- 画布：1920×1080，纸底 `#F7F5F1`，正文 `#20201E`，次要 `#72706B`，品牌绿 `#1D4A3B`，冲突 `#B45B3E`。
- UI 素材框：1500×937.5，居中（左边距 210，上边距 44），细边框 + 阴影；推近在框内裁切。
- 推近：`scale + translate`，`Easing.bezier(0.33, 0, 0.2, 1)`，倍率 1.35–1.75；没有花哨转场。
- 标注：1.15px 细线框（随缩放反算，屏幕上恒为 1px）+ 13px 说明；上下左右四个方向，优先放在内容列外侧，避免压字。
- 字幕：30px、行高 1.35、深色 80% 底、圆角 8、底部 216px（画面高度 20%）；`Promo105-NoSubs` 可关闭。
- 顶栏：左「到点 / 镜头名」，右「真实耗时或说明 + 实机/入口/规划/真实文件标签」。标签是编辑信息，不属于 App UI。

## 7. 已知边界（片子里已如实处理）

1. **通知本身没有材料清单。** UNNC 通知只要求线上报名；`one-page project intro`、报名表来自群聊。片子里材料镜头明确标注「群聊来源 · 非官方通知」，没有把材料归因给通知。
2. **08 findings 只拍到前两条。** 真实结果是 6 条，画面只显示 2 条；角标写「本屏 2 条 / 共 6 条」，字幕说「6 条依据」，没有伪造滚动。
3. **08 findings 屏包含真实冲突提示。** 官方原文地点写「思源报告厅」，与群聊「劳伦斯」不一致；这是真实结果，没有剪掉，也没有后期改绿。用「只标出，不覆盖」标注解释。
4. **导出没有 toast。** 页面确实无提示；片子不伪造提示，改为展示真实下载文件 `ontime-61d54b.ics`（795 B），并写「页面暂无提示；文件已生成」。
5. **行动台计数不一致。** 原素材同屏有「0 件未完成」和「2 件待办」。F1 推近到任务区，裁掉事件行徽标，只保留勾选与「未完成清零」；没有后期改数字。
6. **标题冲突是噪音。** diff 屏保留标题行（真实），但不给特写；冲突镜头只框地点两候选；历史屏不强调「标题 → 讲座」。
7. **`04b` 的任务状态来自试片后段。** 「完成注册」在源素材里已勾选。F1 用它作为勾选结果，F2 与它连续；没有把已完成说成未完成。
8. **开场「手机日历」是示意图。** 日历卡右下角写「日历示意」；没有假装是真实手机截图。

## 8. 复现与检查

```powershell
# 校验工程
npx tsc --noEmit

# 校验成片
ffprobe -v error -show_entries format=duration,size `
  -show_entries stream=width,height,r_frame_rate,nb_frames `
  -of default=noprint_wrappers=1 ..\out\promo-105s-v2.mp4
# 期望：1920x1080 / 30fps / 3240 帧 / 108.000s
```

`video/out/`、`video/remotion/public/media/`、`node_modules/` 都已忽略；仓库只提交工程、脚本、字幕与说明。
