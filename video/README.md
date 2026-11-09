# 宣传片 · 本地生成说明

成片**不入库**：交付母版单文件约 149 MB，超过 GitHub 的 100 MB 单文件上限。仓库只保留 Remotion 工程、脚本、字幕与说明；按本文在本机渲染即可复现。仓库内另有一份 720p 预览：`deliverables/preview-720p.mp4`。

## 1. 成片规格（已验证）

| 项 | 交付版 `promo-v5.mp4` | Remotion 母版 `promo-v5-master.mp4` |
| --- | --- | --- |
| 画面 | 1920×1080 / 30fps / 3681 帧 | 同左 |
| 时长 | 122.709 s | 同左 |
| 视频 | H.264 High，10 Mbps CBR，`yuv420p` / **tv** / **bt709** | H.264，CRF 20，`yuvj420p` / pc |
| 音频 | AAC 192 kbps，48 kHz 立体声 | 同左 |
| 体积 | 约 149 MB | 约 33.7 MB |

Remotion 直出是 full-range，容器里常带 `bt470bg` 元数据；直接上传会被平台按 limited range 解码，纸底 `#F7F5F1` 被裁成纯白。因此交付前必须跑一遍 `encode:delivery` 转成 `tv` + `bt709`（脚本里写死了 `scale=in_range=pc:out_range=tv:in_color_matrix=bt709` 与 `-x264-params colorprim/transfer/colormatrix`）。

## 2. 环境

- Node 22（本机用 fnm）
- `ffmpeg` / `ffprobe` 在 `PATH` 中（本机 9.0.2）
- Windows PowerShell

```powershell
cd video/remotion
npm install
```

## 3. 渲染步骤

录屏素材需要先在本地存在（`recordings/` 已忽略，不入库）：主流程片段在 `recordings/_trial/`，多来源段在 `recordings/_multisource/`，导出段在 `recordings/_export-ics/`。没有这些片段时，`prepare-media` 会直接失败——不会用占位素材顶替。录制方法见 [`RECORDING.md`](RECORDING.md) 与分镜 [`SHOTLIST.md`](SHOTLIST.md)。

```powershell
# 1) 录屏 → 镜头片段：复制素材、ffmpeg 变速切片、抽末帧兜底
npm run prepare-media

# 2) 字幕：src/captions.json → video/subtitles/promo.zh.srt
npm run captions

# 3) 渲染母版（会先跑 prepare-audio 生成音频床）
npm run render
# → video/out/promo-v5-master.mp4

# 4) 转平台交付版（tv / bt709 / 10 Mbps CBR）
npm run encode:delivery
# → video/out/promo-v5.mp4
```

BGM 与 SFX 已入库（`video/assets/`），`npm run prepare-audio` 会把它们复制到 `public/audio/` 并写 `src/audio-manifest.json`。

## 4. 720p 预览（仓库内这一份）

从 149 MB 交付版两遍编码，锁定 1100 kbps 视频，控制在 20 MB 以内：

```powershell
ffmpeg -y -i video/out/promo-v5.mp4 `
  -vf "scale=1280:720:flags=lanczos,format=yuv420p" `
  -c:v libx264 -preset slow -b:v 1100k -maxrate 1500k -bufsize 3000k `
  -pass 1 -passlogfile "$env:TEMP\ontime-pass" -an -f mp4 NUL

ffmpeg -y -i video/out/promo-v5.mp4 `
  -vf "scale=1280:720:flags=lanczos,format=yuv420p" `
  -c:v libx264 -preset slow -b:v 1100k -maxrate 1500k -bufsize 3000k `
  -pass 2 -passlogfile "$env:TEMP\ontime-pass" `
  -c:a aac -b:a 96k -ac 2 `
  -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv `
  -movflags +faststart deliverables/preview-720p.mp4
```

实测：1280×720 / 30fps / 3681 帧 / 122.709 s / 17.36 MB / `bt709`+`tv`，全片解码无错误。

## 5. 校验

```powershell
ffprobe -v error `
  -show_entries format=duration,size:stream=width,height,r_frame_rate,nb_frames,color_space,color_range `
  -of default=noprint_wrappers=1 deliverables/preview-720p.mp4
```

## 6. 入库 / 不入库

| 路径 | 处理 | 原因 |
| --- | --- | --- |
| `video/remotion/src/**`、`scripts/**`、`package*.json` | 入库 | 渲染必需 |
| `video/subtitles/**`、`video/*.md` | 入库 | 字幕与制作记录 |
| `video/assets/bgm/*.mp3`、`video/assets/sfx/*.mp3` | 入库（约 5.5 MB） | 许可允许再分发且保留署名，直接渲染无需再找素材 |
| `video/out/*.mp4` | 忽略 | 成片过大；`video/.gitignore` 已排除 |
| `video/remotion/public/media/`、`public/audio/` | 忽略 | 生成物 |
| `recordings/` | 忽略 | 原始录屏含真实界面操作与账号痕迹，且体积大 |

## 7. 音乐与音效许可

- **"Continue Life" — Kevin MacLeod (incompetech.com)**，CC BY 4.0。片尾保留署名：

  ```
  Music: "Continue Life" — Kevin MacLeod (incompetech.com), CC BY 4.0
  ```

- 备选 BGM "Dim The Lights"（Ahjay Stelino）与两个 whoosh 音效来自 Mixkit 免费许可（音效不强制署名）。来源、响度处理与被排除的素材来源见 [`assets/README.md`](assets/README.md)。

## 8. 其他文档

- [`SHOTLIST.md`](SHOTLIST.md) 分镜表 · [`CUT-v1.md`](CUT-v1.md) 剪辑单
- [`RECORDING.md`](RECORDING.md) 录制环境与操作 · [`TRIAL.md`](TRIAL.md) 试片记录
- [`remotion/README.md`](remotion/README.md) 工程结构与镜头级素材映射（部分段落仍写 v3，当前成片为 v5）
