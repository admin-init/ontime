# 录制环境与操作手册

版本：v0.1｜日期：2026-11-08｜对应：`SHOTLIST.md` / `TRIAL.md`

---

## 1. 环境自检结论（2026-11-08）

| 项 | 结果 |
|---|---|
| 前端 | `http://127.0.0.1:5173` 可访问（主工作区，最新界面） |
| 后端 | `http://127.0.0.1:8000` 可访问，`/api/health` 为 `ok=true`，模型 `deepseek-flash` |
| 录屏 | Playwright（复用参考工程 `S:\Sarah\ASUS\baoyan-demo\node_modules\playwright`）可用 |
| 浏览器 | `C:\Users\stellarz\AppData\Local\ms-playwright\chromium-1254\chrome-win64\chrome.exe` |
| ffmpeg | `9.0.2-full_build`（scoop），`ffprobe` 可用 |
| OBS | `C:\Users\stellarz\scoop\apps\obs-studio\33.0.1\bin\64bit\obs64.exe`（未使用；备选） |
| 磁盘 | C: 剩余 187.5 GB；S: 剩余 80.0 GB |
| 帧率 | 源 Playwright webm 25fps → 输出 CFR 30fps；测试片段帧数无缺口 |

### 试拍文件

| 文件 | 时长 | 分辨率 | 帧率 | 帧数 | 体积 | 说明 |
|---|---|---|---|---|---|---|
| `recordings/_selftest/selftest.mp4` | 14.333s | 1440×900 | 30fps | 430 | 0.41 MB | 自检页，含运动条；帧数 430 = 14.333×30，无掉帧 |
| `recordings/_selftest/app-home.mp4` | 20.133s | 1440×900 | 30fps | 604 | 0.21 MB | 真实行动台，静态为主 |
| `recordings/_selftest/app-event.mp4` | 16.433s | 1440×900 | 30fps | 493 | 0.08 MB | 真实事件详情（当时事件已被重置，画面是“事件不存在”） |

> 完整流程试片见 `TRIAL.md`：9 段主流程 + 1 段补录，合计约 156 秒，全部 30fps。

---

## 2. 推荐录制方式

### A. Playwright 页面录制（默认，最干净）

适合：所有 App 内镜头。
优点：只录页面，不带桌面、书签栏、通知；视口固定 1440×900。
代价：源视频 25fps；需要 ffmpeg 转 30fps；没有真实鼠标光标（后期可注入圆点光标）。

```powershell
# 环境
$env:PATH = "C:\Users\stellarz\AppData\Roaming\fnm\node-versions\v22.23.4\installation;$env:PATH"

# 单段页面录制（默认录自检页）
node video\tools\record-page.mjs

# 录真实页面
$env:CAPTURE_URL="http://127.0.0.1:5173/"
$env:CAPTURE_SECONDS="15"
$env:CAPTURE_NAME="app-home"
node video\tools\record-page.mjs

# 完整 9 步试片
node video\tools\record-trial.mjs
```

产物：`recordings/_selftest/*.mp4` 或 `recordings/_trial/*.mp4`，报告 JSON 同目录。

### B. ffmpeg gdigrab 桌面 30fps（备用，需要真实光标时）

```powershell
# Chrome 全屏、隐藏书签栏、关闭通知后
ffmpeg -y -f gdigrab -framerate 30 -i desktop -t 20 `
  -c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p `
  "recordings\raw\screen-test-30fps.mp4"
```

- 优点：真实 30fps、真实光标。
- 缺点：会录到桌面和通知；必须确认没有密钥、私人聊天、邮箱。
- 结束按 `q`，不要直接关窗口。

### C. OBS（备选）

- 路径：`C:\Users\stellarz\scoop\apps\obs-studio\33.0.1\bin\64bit\obs64.exe`。
- 本轮未配置 OBS 场景；如果 Playwright/gdigrab 都出问题，再用 OBS 的“窗口采集 + 30fps + CQP 18”。
- 录制前把输出目录设为 `recordings/raw/`，不要设到 C 盘临时目录。

---

## 3. 开录前 5 分钟检查

1. `5173` / `8000` 都能打开；`/api/health` 的 `model.ok = true`。
2. **重置数据**：设置 → 重置演示数据 → 确认清空；或装载 Agent 恢复快照。
3. 确认当前状态符合 `UI-STATES.md`：
   - 目标 1 处地点冲突，不要标题/适用对象冲突；
   - 「报名」任务截止为“待确认”；
   - 行动台没有已勾选的任务（除非镜头需要）。
4. 浏览器：1440×900、缩放 100%、隐藏书签栏、关闭通知、关闭深色模式。
5. 关闭其他窗口/聊天软件；Windows 通知设为勿扰。
6. 固定时钟：如果录制日晚于 2026-11-10，设置 `DEMO_NOW=2026-11-08T21:00:00+08:00`（样例/回放模式）。
7. 磁盘：至少留 5 GB；当前 C/S 都充足。
8. 声音：先录一段 10 秒测试，确认没有电流声/爆音；TTS 或真人再开录。

---

## 4. 分段与命名

- 目录：`recordings/raw/<镜号>-<动作>-<日期>-<序号>.webm`
  - 例：`recordings/raw/P04a-capture-notice-20261108-01.webm`
- 每段只做一个动作；切点见 `SHOTLIST.md` 的 CP 点。
- 每段开头留 1 秒静止，结尾留 1 秒静止，方便剪辑。
- 不要覆盖旧片段；同一动作拍 2–3 条，选最好的一条。
- `recordings/` 已通过 `recordings/.gitignore` 全部忽略；不要 `git add` 原始素材。

---

## 5. 失败与重拍

- 模型失败/超时：不要剪成成功；重拍，或使用真实的错误态镜头并说明“网络波动，重试即可”。
- 检索失败：可以重试；仍失败就拍“未找到明确适用的官方依据”，不要伪造结果。
- 回放：只在断网/答辩兜底时使用；画面角标「缓存回放，非实时」，片尾统一说明。
- 下载：无头浏览器不显示下载架；正式录制用有头 Chrome，或等 App 加“已导出日历”提示。
- 任何“入口/示意/规划”镜头，拍摄板上写标签，后期不要忘记角标。

---

## 6. 当前已知限制

1. 本 worktree 的 `frontend/node_modules` 未安装；不要在这里 `npm install` 改前端。录制直接用主工作区的 `5173`。
2. Playwright 录屏没有鼠标光标；需要光标时用 gdigrab，或在后期加圆点光标。
3. 模型耗时波动大：通知 29.3s、群聊 48.6s（本次试片）；剪辑必须准备加速方案。
4. 搜索 5.3s、链接核对 7.3s；比技术方案写的 8–20s 快，但仍要在片子里标注“实际耗时”。
5. 当前没有 BGM 与旁白；字幕是草稿，TTS/真人后要重新对时。
