# BGM / SFX

已提供：

- `bgm-main.mp3`：主片用，Kevin MacLeod《Continue Life》，CC BY 4.0，114.024s，已归一化 -20 LUFS。
- `bgm-alt.mp3`：备用，本轮未用。
- `../sfx/whoosh-transition.mp3`：转场 whoosh，本轮用在 18s / 40s / 62s。

在 `video/remotion/` 运行：

```powershell
npm run prepare-audio   # 复制到 public/audio 并写 src/audio-manifest.json
npm run render          # 会自动先跑 prepare-audio
```

主片参数：BGM 入点 9s，0.5s 淡入，最后 2s 淡出，音量 0.30；whoosh 0.12，提前 1.1s 起，峰值落在切点上。

BGM/SFX 文件不入库（`assets/bgm/*.mp3`、`assets/sfx/*.mp3`、`public/audio/` 已忽略）。
