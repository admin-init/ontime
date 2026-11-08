# BGM / SFX

已提供：

- `bgm-main.mp3`：主片用，Kevin MacLeod《Continue Life》，CC BY 4.0，114.024s，已归一化 -20 LUFS。
- `bgm-alt.mp3`：备用，本轮未用。
- `../sfx/whoosh-transition.mp3`：转场 whoosh，本轮用在 21s / 43s / 65s。

在 `video/remotion/` 运行：

```powershell
npm run prepare-audio   # 建 bgm-v3.mp3 床、复制 SFX、写 src/audio-manifest.json
npm run render          # 会自动先跑 prepare-audio
```

v3 声音：

- BGM 在片子 **0:12** 进（标题卡 0–3s + 痛点段留白），0.5s 淡入、最后 2s 淡出、音量 0.30。
- `bgm-v3.mp3` = 原曲 0:09–1:54（105s）+ 原曲前 27s，0.5s 交叉淡化，131.5s 床；覆盖 130.4s 成片。
- whoosh 0.12，提前 1.1s 起，峰值落在 21s / 43s / 65s 切点。
- 片尾署名：`Music: "Continue Life" — Kevin MacLeod (incompetech.com), CC BY 4.0`。

BGM/SFX 文件不入库（`assets/bgm/*.mp3`、`assets/sfx/*.mp3`、`public/audio/` 已忽略）。
