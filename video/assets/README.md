# 视频素材库 — 宣传片 BGM 与音效

本目录存放「到点」105 秒产品 Demo 宣传片的背景音乐与音效。
所有文件均为**免费、可商用、可用于线上视频发布与比赛投稿**的授权素材，已按统一响度处理，可直接拖进时间线。

| 文件 | 用途 | 时长 | 响度 (Integrated) | 大小 |
| --- | --- | --- | --- | --- |
| `bgm/bgm-main.mp3` | **主用 BGM** — Continue Life (Kevin MacLeod) | 114.02 s | -20.3 LUFS | 2.61 MB |
| `bgm/bgm-alt.mp3` | **备选 BGM** — Dim The Lights (Ahjay Stelino) | 124.93 s | -20.3 LUFS | 2.86 MB |
| `sfx/whoosh-transition.mp3` | 镜头/段落切换 whoosh | 1.33 s | 峰值 -3 dBFS | 34 KB |
| `sfx/whoosh-air.mp3` | 轻量空气感位移音效 | 2.32 s | 峰值 -3 dBFS | 57 KB |

音频规格统一：**44 100 Hz / 立体声 / MP3 192 kbps CBR**；BGM 用两遍 `loudnorm` 做**纯线性增益**归一化（不做压缩，保留原曲动态），两首之间响度差 0.01 LU。

---

## 1. 主用 BGM — `bgm/bgm-main.mp3`

| 项 | 内容 |
| --- | --- |
| 曲名 | **Continue Life** |
| 作者 | Kevin MacLeod（incompetech.com） |
| 专辑 | Elegant Piano |
| 来源页面 | https://incompetech.com/music/royalty-free/index.html?isinfinite=true#Continue%20Life |
| 原始文件直链 | https://incompetech.com/music/royalty-free/mp3-royaltyfree/Continue%20Life.mp3 |
| 许可证 | **Creative Commons: By Attribution 4.0（CC BY 4.0）** |
| 许可证链接 | https://creativecommons.org/licenses/by/4.0/ |
| 作者许可页 | https://incompetech.com/music/royalty-free/licenses/ |
| ISRC | USUAN1100282 |
| 下载日期 | 2026-11-08 |
| 原曲时长 / 规格 | 1:54.1（114.05 s）/ 44 100 Hz 立体声 / VBR ≈ 265 kbps |

**署名文案（必须出现在片尾字幕或说明页，作者官方模板原文）：**

```
"Continue Life" Kevin MacLeod (incompetech.com)
Licensed under Creative Commons: By Attribution 4.0 License
http://creativecommons.org/licenses/by/4.0/
```

### 为什么选它

- **调性对得上**：作者官方标注为 *Solo new-age piano*，情绪标签 *Relaxed, Calming, Uplifting*。纯钢琴独奏，没有鼓组推进、没有 drop、没有喜剧感，正是"克制、清醒、可信"需要的底子，不会把静态界面 + 推近的画面带成宣传片广告。
- **音量动态小**：实测 LRA（响度范围）仅 **8.9 LU**，整条曲线没有超过 9 dB 的单秒突降，不存在"突然变响"。压到 -20 LUFS 铺底后不会被抢注意力。
- **结构不断裂**：逐秒包络显示 0:21 之后是一条连续的琴声线，全程无段落切换；`0:09` 处有一次自然呼吸（比峰值低约 20 dB），适合作为入点；结尾 1:51→1:54 是原曲自带的自然收尾，直接可以当淡出用。
- **留白够**：开头 20 秒是稀疏的单音钢琴，对应片头标题与首屏；0:21 起音乐铺开，正好对应"截图 → 结构化事件"的叙事启动。中段（40–80 s）音量抬升约 3 dB，属于"一点点推进感"，没有明显断点。
- **许可最干净**：CC BY 4.0 是 OSI 认可的自由许可，允许商业使用、改编、二次分发与广播，唯一义务是署名——比赛投稿无风险。

### 推荐入点 / 出点

- **入点 0:09，出点 1:54（片尾）** → 105.0 s，与片子等长。
  - 0:09 落在原曲的一次呼吸上，入点不突兀；建议在时间线上给这段加 **0.8 s 淡入**。
  - 出点直接用文件自带结尾：原曲自然收尾与文件内烘焙的 1.5 s 淡出重叠，**不需要再手动加淡出**。

### 音量建议

- 文件已归一化到 **-20.3 LUFS**，直接铺底即可。
- 若成片有旁白／配音：把音乐降到 **-26 ~ -30 LUFS**（相对本文件再减 6 ~ 10 dB）。
- **不要**再串压缩器/限幅，原始动态已经合适；如确需贴底，只做静态衰减。

---

## 2. 备选 BGM — `bgm/bgm-alt.mp3`

| 项 | 内容 |
| --- | --- |
| 曲名 | **Dim The Lights** |
| 作者 | Ahjay Stelino |
| 来源页面 | https://mixkit.co/free-stock-music/discover/dim-the-lights/ （同曲亦列于 https://mixkit.co/free-stock-music/corporate-music/ 与 https://mixkit.co/free-stock-music/chillout/） |
| 原始文件直链 | https://assets.mixkit.co/music/97/97.mp3 |
| 许可证 | **Mixkit Stock Music Free License**（免费，无需注册／付费） |
| 许可证链接 | https://mixkit.co/license/#musicFree |
| 下载日期 | 2026-11-08 |
| 原曲时长 / 规格 | 2:04.9（124.93 s）/ 44 100 Hz 立体声 / 256 kbps |

**署名文案（Mixkit 该许可不强制署名，建议保留）：**

```
Music: "Dim The Lights" by Ahjay Stelino — Mixkit (https://mixkit.co),
used under the Mixkit Stock Music Free License
```

### 为什么选它当备选

- **更平、更"不抢戏"**：实测 LRA 仅 **4.0 LU**，整条逐秒包络长期稳定在峰值的 −0.5 ~ −5 dB 区间，接近无缝底噪式铺底。想让画面（大量静态界面 + 推近）绝对主导时用这首。
- **没有段落断裂**：0:00→2:00 只有开头一次织体变化（0:16 附近由拨弦进入持续铺底），属于一次性的"落座"，不是段落切换。
- **换作者、换许可**：与主用曲分属不同作者和不同许可，降低单点许可风险。
- **许可用途边界要留意**：Mixkit 音乐免费许可允许 **YouTube 视频、社交媒体视频、播客、线上广告、教育用途、商业／非商业项目**；但**明确禁止**用于电视与电台广播、电子游戏、CD/DVD，也不得把音乐单独再分发或登记到版权管理服务。
  - → **线上发布与线上比赛投稿没有问题。**
  - → **若入围后需要电视/电台播出或线下放映广播，请改用主用曲（CC BY 4.0 允许广播），本曲仅作线上版备选。**

### 推荐入点 / 出点

- **方案 A（推荐）**：入点 0:00，出点 1:45 → 105.0 s。曲子本身非常平稳，入点加 **0.6 s 淡入**、出点加 **1.5 s 淡出**（硬切会听得出接缝）。
- **方案 B**：入点 0:16，出点 2:01 → 105.0 s，正好骑在原曲自带的自然淡出上（原曲 2:01 起落），**不需要手动加淡出**。

### 音量建议

- 同样已归一化到 **-20.3 LUFS**。因为动态更平，建议比主用曲再降 **2 ~ 3 dB** 使用，会更"沉底"。
- 有人声时同样压到 **-26 ~ -30 LUFS**。

---

## 3. 音效（可选，2 个）— `sfx/`

两段都来自 Mixkit 免费音效库，许可是 **Mixkit Sound Effects Free License**：允许 YouTube 视频、社交媒体视频、线上广告、教育用途、音乐视频、商业项目、影视制作，**并明确允许电视与电台广播**、电子游戏、CD/DVD。用途比音乐那条宽松得多。

| 文件 | 原曲 | 来源页面 | 原始文件直链 | 许可 | 下载日期 |
| --- | --- | --- | --- | --- | --- |
| `sfx/whoosh-transition.mp3` | Cinematic whoosh fast transition | https://mixkit.co/free-sound-effects/cinematic-whoosh-fast-transition-1492/ | https://assets.mixkit.co/active_storage/sfx/1492/1492.wav | Mixkit Sound Effects Free License — https://mixkit.co/license/#sfxFree | 2026-11-08 |
| `sfx/whoosh-air.mp3` | Air whoosh | https://mixkit.co/free-sound-effects/air-woosh-1489/ | https://assets.mixkit.co/active_storage/sfx/1489/1489.wav | Mixkit Sound Effects Free License — https://mixkit.co/license/#sfxFree | 2026-11-08 |

**用法建议**

- `whoosh-transition.mp3`（1.33 s，上扬型）：段落／镜头切换时用。
- `whoosh-air.mp3`（2.32 s，空气感）：界面元素出现、推近开始前的轻微位移用，比上一条更轻。
- 两段都已峰值归一到 **-3 dBFS**；在成片里建议比音乐再低 **8 ~ 10 dB**（约 -12 dBFS 峰值）使用。
- 全片最多 1~2 处使用，**不要每个镜头都上**，音效一多就会破坏"克制"的基调。
- Mixkit 音效许可**不要求署名**，但建议片尾一并写上来源。

---

## 4. 验证记录

### 4.1 ffprobe（成片文件）

```
===== video/assets/bgm/bgm-main.mp3
codec_name=mp3        codec_type=audio
sample_rate=44100     channels=2      channel_layout=stereo
duration=114.024490   bit_rate=192127  size=2738405
--- video/assets/bgm/bgm-alt.mp3
codec_name=mp3        codec_type=audio
sample_rate=44100     channels=2      channel_layout=stereo
duration=124.928571   bit_rate=192139  size=3000461
--- video/assets/sfx/whoosh-transition.mp3
codec_name=mp3        codec_type=audio
sample_rate=44100     channels=2      channel_layout=stereo
duration=1.334127     bit_rate=205647  size=34295
--- video/assets/sfx/whoosh-air.mp3
codec_name=mp3        codec_type=audio
sample_rate=44100     channels=2      channel_layout=stereo
duration=2.320658     bit_rate=198036  size=57447
```

单首 BGM 均 ≤ 6 MB。

### 4.2 响度（ffmpeg `loudnorm` 分析模式，双遍线性归一化后复测）

| 文件 | 原始 I (LUFS) | 原始 LRA (LU) | 原始 TP (dBTP) | 成片 I (LUFS) | 成片 LRA (LU) | 成片 TP (dBTP) |
| --- | --- | --- | --- | --- | --- | --- |
| bgm-main.mp3 | -20.24 | 9.00 | -4.16 | **-20.27** | 8.90 | -4.20 |
| bgm-alt.mp3 | -10.34 | 3.90 | -0.27 | **-20.26** | 4.00 | -9.55 |

归一化后两首相差 0.01 LU，可直接互切；LRA 基本不变，说明没有引入压缩。

### 4.3 可播放性

- `ffmpeg -i <file> -f null NUL` 全量解码：4 个文件均 **exit=0，无报错**。
- `ffplay -autoexit -nodisp -t 2 <file>`：两个 BGM 均 **exit=0，正常起播**。

### 4.4 选曲方法与**未验证项**（请注意）

选曲不是靠试听，而是靠**来源方元数据 + 客观音频测量**：

- 依据 1：来源方自己的标签——Kevin MacLeod 站点的曲目元数据（乐器 "Piano"、情绪 "Relaxed, Calming, Uplifting"、描述 "Solo new-age piano."）与 Mixkit 的分类标签（Corporate Music / chillout / minimalism）。
- 依据 2：客观测量——`loudnorm` 响度分析（LRA / True Peak）、`astats` 逐秒 RMS 包络（用于判断有无段落断裂与突降）、`showwavespic` 波形图与 `showspectrumpic` 频谱图（用于判断织体变化与无人声共振峰结构）。

**因此以下几项未经人耳确认，请剪辑同学在成片前自行试听确认：**

1. **实际听感未验证**——没有戴耳机听过，不宣称"已试听"。请务必自己过一遍，尤其确认钢琴是否觉得太"空"、Mixkit 那首是否够克制。
2. **"无 vocals" 是依据元数据与频谱推断，不是听感确认。** Kevin MacLeod 官方条目写明为纯钢琴独奏；Mixkit 那首依据其分类与频谱图判断（未见语音共振峰）。若发现有人声，Mixkit 那首直接弃用即可。
3. **"无强 drop、无喜剧感" 同上**，依据的是包络无突降 + 元数据标签，非听感判断。

### 4.5 被排除的来源（如实记录，未当作"已获取"）

| 来源 | 结果 |
| --- | --- |
| Pixabay | Cloudflare 拦截：curl 返回 **403**，浏览器进入 "Performing security verification" → 未采用 |
| Free Music Archive | 下载需登录（`/download/` 302 到 `/login`）→ 不符合"无需登录" → 未采用 |
| ccMixter | 页面可达，但下载入口需登录 → 未采用 |
| Uppbeat | HTTP **429**（限流）→ 未采用 |
| FreePD | 站点已关闭（"FreePD.com - Site Closed"）→ 未采用 |
| Scott Buckley | 站点返回 HTTP **406** → 未采用 |

以上均**未**被当作已获取素材写入交付物。最终只采用两条链路：**incompetech.com（CC BY 4.0，直连下载）** 与 **mixkit.co（免费许可，直连下载）**，两者均无需注册、无需付费。

### 4.6 保险方案（本次未交付，仅备查）

若比赛要求电视/电台播出，或需要第三首备选，可用同一来源的另一首 CC BY 4.0 曲目（已下载分析过，指标同样合格）：

- **Sapphire Isle** — Kevin MacLeod，CC BY 4.0，2:11.5，LRA 7.0 LU，钢琴／"Relaxed, Calming, Uplifting"，0:00 起音偏弱、约 1:00 处有一次自然抬升、结尾自带淡出。
  直链：https://incompetech.com/music/royalty-free/mp3-royaltyfree/Sapphire%20Isle.mp3 ｜ ISRC USUAN1100087

---

## 5. 处理记录

- 下载：2026-11-08，直接从来源站点下载原始文件，未使用任何第三方合集。
- 处理链：`ffmpeg` 两遍 `loudnorm`（`linear=true`，纯增益，不压缩）→ `afade` 0.3 s 淡入 / 1.5 s 淡出 → 重采样 44 100 Hz → 立体声 → `libmp3lame` 192 kbps CBR → 写入 ID3 标签（含作者、许可链接、来源页、ISRC、处理说明）。
- 已剥离原始文件内嵌的封面图（mjpeg/png）与过期的 iTunes 归一化标签，成品为**单音频流**，任何 NLE 导入都不会出现杂轨。
- 原始下载文件与中间产物不入库，本目录只保留最终交付文件。
