# ffmpeg 命令手册

版本：v0.1｜环境：Windows / PowerShell / ffmpeg 9.0.2（scoop）

> `recordings/` 已加入 `.gitignore`。所有原始素材放 `recordings/raw/`，成片放 `video/out/`（也在 `video/.gitignore` 中）。

## 1. 探测

```powershell
ffprobe -v error -show_entries format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames -of default=noprint_wrappers=1 "recordings\raw\xxx.webm"
```

精确帧数（慢一点，但能判断是否掉帧）：

```powershell
ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames,r_frame_rate,duration -of default=noprint_wrappers=1 "recordings\raw\xxx.webm"
```

## 2. Playwright webm → H.264 mp4

```powershell
ffmpeg -y -i "recordings\raw\xxx.webm" `
  -vf "fps=30,format=yuv420p" `
  -c:v libx264 -preset slow -crf 18 -movflags +faststart `
  "recordings\raw\xxx.mp4"
```

- Playwright 源通常是 25fps；`fps=30` 会补重复帧，输出 CFR 30。UI 演示可以接受；如果要真 30fps，用下面的 gdigrab。
- `-crf 18` 对白底 UI 足够清晰；文件太大时用 20，不要超过 23。

## 3. 桌面 30fps 录屏（有头 Chrome 全屏）

```powershell
ffmpeg -y -f gdigrab -framerate 30 -i desktop -t 20 `
  -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p `
  "recordings\raw\screen-test-30fps.mp4"
```

- 录之前把 Chrome 全屏、隐藏书签栏、关闭通知。
- 画面里不能出现密钥、真实邮箱、私人聊天。
- 结束按 `q`，不要直接关窗口。

## 4. 精确裁剪

```powershell
# 精确到帧（推荐；会重编码）
ffmpeg -y -ss 00:00:03.200 -to 00:00:12.800 -i "in.mp4" `
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -an "out.mp4"

# 快速裁剪（可能从关键帧开始，切点不准）
ffmpeg -y -ss 00:00:03.200 -to 00:00:12.800 -i "in.mp4" -c copy "out.mp4"
```

## 5. 拼接

`concat.txt`（每行一个文件，路径用正斜杠）：

```
file 'recordings/raw/P04a.mp4'
file 'recordings/raw/P04b.mp4'
file 'recordings/raw/P04c.mp4'
```

```powershell
ffmpeg -y -f concat -safe 0 -i concat.txt -c copy "out\promo-rough.mp4"
```

如果各段编码参数不一致，先统一转成同规格再拼；否则 `-c copy` 会花屏或音画不同步。

## 6. 变速（保留真实过程，压缩等待）

```powershell
# 2 倍速，无声
ffmpeg -y -i "in.mp4" -vf "setpts=0.5*PTS,fps=30" -an `
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p "out.mp4"
```

> 只对“等待模型/检索”的段落变速；不要对冲突选择、用户点击变速，避免看起来像自动完成。

## 7. 放大到 1080p

```powershell
ffmpeg -y -i "1440x900.mp4" `
  -vf "scale=1920:1200:flags=lanczos,crop=1920:1080:0:60,unsharp=5:5:0.4:5:5:0" `
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p "1080p.mp4"
```

- 1440×900 是 16:10；裁成 16:9 会切掉上下各 60px。先确认顶部导航和底部页脚没被切。
- 更稳的做法：录制时就用 1920×1080 视口；1440×900 只作为“窗口感”素材。

## 8. 烧字幕

见 `SUBTITLES.md`。核心：

```powershell
ffmpeg -y -i "in.mp4" `
  -vf "subtitles=video/subtitles/promo.zh.srt:force_style='FontName=Noto Sans SC,FontSize=22,MarginV=44,Alignment=2'" `
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -c:a copy "out.mp4"
```

## 9. 旁白 + BGM 混音

```powershell
ffmpeg -y -i "vo.wav" -i "bgm.mp3" -i "video.mp4" `
  -filter_complex "[0:a]loudnorm=I=-16:TP=-1.5:LRA=11[vo];[1:a]volume=0.18,afade=t=in:st=0:d=1.5,afade=t=out:st=103:d=2[bg];[vo][bg]amix=inputs=2:duration=first:dropout_transition=2[a]" `
  -map 2:v -map "[a]" -c:v copy -c:a aac -b:a 192k -ar 48000 -shortest "out.mp4"
```

- 先单独给 VO 做 loudnorm，再与 BGM 混；不要直接把 BGM 拉到 -30 dB 了事。
- 终混目标：整体 -16 LUFS，真峰值 -1.5 dBTP。

## 10. 常用检查

```powershell
# 看关键帧/帧率/时长
ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,avg_frame_rate,nb_frames,duration -of default=noprint_wrappers=1 "out.mp4"

# 抽一帧检查字幕/构图
ffmpeg -y -ss 00:00:42.000 -i "out.mp4" -frames:v 1 "stills/42s.png"

# 检查音轨是否存在
ffprobe -v error -select_streams a -show_entries stream=codec_name,channels,sample_rate -of default=noprint_wrappers=1 "out.mp4"
```

## 11. 交付编码（Remotion 母版 → 平台）

> **Remotion 直出是 full-range（yuvj420p / pc），不要直接上传平台。**
> 小红书等平台按 limited range + bt709 解码，纸底 `#F7F5F1` 会被裁成纯白（过曝），色域也会错。

保留 Remotion 母版，另跑一遍交付编码：

```powershell
cd video/remotion
npm run render            # 输出 ../out/promo-v5-master.mp4（Remotion 母版）
npm run encode:delivery   # 输出 ../out/promo-v5.mp4（平台交付版）
```

其他版本：

```powershell
npm run encode:delivery -- ../out/promo-v6-master.mp4 ../out/promo-v6.mp4
```

交付版规格：

- 视频：`yuv420p` / `color_range=tv` / `bt709` / `bt709` / `bt709`；10 Mbps CBR；High@4.1。
- 音频：AAC 192k。
- 输入母版：yuvj420p / pc / 容器常写 bt470bg（实际 RGB→YUV 是 BT.709）。
- 关键点：`in_color_matrix=bt709`。按容器里的 bt470bg 当 bt601 转会轻微偏色（纸底 246/244/241 → 243/243/238）；按 bt709 转后是 245/243/241。
- 关键点：`-x264-params colorprim=bt709:transfer=bt709:colormatrix=bt709` 必须写，否则 ffprobe 的 `color_transfer` / `color_primaries` 还是 `unknown`。
- 不用 CRF 16：本片大面积静态 UI，CRF 16 只有约 2.4 Mbps，达不到 8–12 Mbps 的交付目标；用 10 Mbps CBR。

验收：

```powershell
ffprobe -v error -select_streams v:0 -show_entries stream=pix_fmt,color_range,color_space,color_transfer,color_primaries,bit_rate -of default=noprint_wrappers=1 "out/promo-v5.mp4"
# 期望：yuv420p / tv / bt709 / bt709 / bt709 / 约 10 Mbps

# 纸底采样（Python + Pillow）
uv run --with pillow python -c "from PIL import Image, ImageStat; im=Image.open('out/v5-delivery-120.png').convert('RGB'); print(ImageStat.Stat(im.crop((80,80,140,140))).mean)"
# 期望：约 245/243/241，不能是 255/255/255
```
