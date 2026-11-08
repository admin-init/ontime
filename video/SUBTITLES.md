# 字幕方案

版本：v0.1｜对应：`SHOTLIST.md` / `COPY.md`

## 结论

- **主片与流程片都用中文单语字幕。** 目标评审是中文环境，双语会挤占 1440×900 的画面。
- 如果确认有国际评审，额外输出 `promo.en.srt`（不烧进画面），或单独做中英双行版：中文 32px、英文 20px，行距 1.25。**不要默认双行。**
- 字幕文件：
  - `subtitles/promo.zh.srt` —— 105 秒草稿，26 条；
  - `subtitles/flow.zh.srt` —— 4 分钟草稿，40 条。
- 两版都是 UTF-8 无 BOM。TTS/真人录音后，以最终音轨为准微调时间，不改文案。

## 样式

| 项 | 建议 |
|---|---|
| 字体 | Noto Sans SC Medium（系统已装 Noto Sans SC VF） |
| 字号 | 34–38px（1920×1080 成片）；流程片可 32px |
| 颜色 | 白字，黑色 60% 半透明底；不用描边发光 |
| 位置 | 底部居中，距底 80px；有任务列表/导出按钮时上移到 120px |
| 行宽 | 每行 ≤ 18 个中文字符，最多 2 行 |
| 单条时长 | 2–5 秒；句间 0.2–0.4 秒；不跨镜头断句 |
| 标点 | 中文全角；数字用半角；英文术语前后留空格 |

## 烧录

```powershell
# 105 秒
ffmpeg -y -i out/promo-105.mp4 `
  -vf "subtitles=video/subtitles/promo.zh.srt:force_style='FontName=Noto Sans SC,FontSize=22,PrimaryColour=&H00FFFFFF,BackColour=&H99000000,BorderStyle=3,Outline=0,Shadow=0,MarginV=44,Alignment=2'" `
  -c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p -c:a copy `
  out/promo-105-sub.mp4
```

> Windows 下 `subtitles=` 的路径如果含空格，用单引号包住整个 filter；必要时把 SRT 复制到当前目录再用相对路径，避免盘符冒号被 ffmpeg 当作参数分隔。

## 质检

- [ ] 每条字幕在画面停留至少 1.5 秒，能读完。
- [ ] 字幕不遮挡任务清单、导出按钮、字段状态点。
- [ ] 数字、日期、来源域名与画面一致。
- [ ] “未确认”不被写成“已确认”；“入口”不被写成“已接入”。
- [ ] 片尾能力说明完整保留，不被剪掉。
- [ ] 中英文术语一致（如做英文版）。

## 英文版术语

| 中文 | 英文 |
|---|---|
| 字段级溯源 | field-level provenance |
| 不静默覆盖 | no silent overwrite |
| 未确认 | unconfirmed |
| 合并建议 | suggested merge |
| 冲突 | conflict |
| 行动清单 | action list |
| 官网同步 | website sync |
| 邮箱接入 | email connection |
| 自定义网站查询 | custom site lookup |
| 规划能力 | planned capability |
