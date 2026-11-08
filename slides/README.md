# 到点 · 评审演示（HTML 幻灯片）

单文件 HTML + CSS，16:9（1280×720 / 13.333×7.5in），共 10 页。所有截图取自本地运行的真实界面，活动内容为演示数据。

## 导出

```powershell
# PDF（Edge 无头，@page 已设为 13.333in × 7.5in，margin 0）
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" `
  --headless --disable-gpu --no-pdf-header-footer `
  --print-to-pdf="slides\out\ontime-deck.pdf" `
  "slides\slides.html"

# 第 5 页单页 PNG（1280×720，slides.html#p5 只渲染第 5 页）
& "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" `
  --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 `
  --window-size=1280,720 `
  --screenshot="slides\out\page-05.png" `
  "file:///S:/Stellar/ASUS/ontime-wt-slides/slides/slides.html#p5"
```

也可用同一条 Edge 命令逐页截图复核：把 `#p5` 换成对应页（当前脚本只对 `#p5` 生效，其余页直接看 PDF）。

## 每页要点

| 页 | 标题 | 要点 |
| --- | --- | --- |
| 1 | 封面 | 多来源校园信息行动台；官网 / 邮件 / 聊天截图汇成有据可查的清单 |
| 2 | 信息不是没有，是散着 | 官网通知、群聊截图、报名截止三种来源各自失守 |
| 3 | 记下了，但没有依据 | 截图、备忘录、日历都做了，仍答不出「几点 / 在哪 / 交什么」 |
| 4 | 三条原则 | 字段级来源、不静默覆盖、未确认就直说 |
| 5 | 从一张截图，到一份行动清单 | 六步闭环，两行三列；见下 |
| 6 | 每个字段，都连回原文 | 字段挂出处引文，点击定位，原文改动可发现 |
| 7 | 冲突并排，裁决由人，历史只追加 | 同一字段两种说法并排，不自动覆盖 |
| 8 | 有依据带原文，没依据直说 | 搜索无果显示「未找到明确适用的官方依据」；贴官方链接则逐字段给引文 |
| 9 | 现在做到哪，就说到哪 | 已实现 / 演示暂未接入 / 规划 三列能力矩阵 |
| 10 | 收尾 | 现场演示路径与行动台截图 |

## 第 5 页版式

- 两行三列：第一行 Step 1–3，第二行 Step 4–6。
- 每格截图 360px 宽（1280 画布下 3×360 + 2×32 = 1144，左右各 68）。
- 行间用折返箭头连接 Step 3 → Step 4，保持 1→6 的阅读顺序。
- 截图不是整页缩小，而是按步骤裁切后放大：
  - `assets/p5/step1.png` 上传区
  - `assets/p5/step2.png` 字段行
  - `assets/p5/step3.png` 合并建议卡
  - `assets/p5/step4.png` 同一字段的两个候选
  - `assets/p5/step5.png` 核实结论 + 一条原文引文
  - `assets/p5/step6.png` 近 7 天行动清单
- 底注收为一行 17px。

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

`assets/p5/*.png` 均由上述原图裁切，未改内容。

## 已知缺口

- 第 5 页 Step 1 原素材没有「识别进度」状态，只展示上传区与粘贴入口，未补造进度条。
- 截图中的活动为演示 fixtures，页脚标注「真实界面」指界面真实，不表示活动信息真实。
