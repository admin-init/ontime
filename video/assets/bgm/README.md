# BGM 放这里

把选好的 `bgm.mp3` 放到本目录，然后在 `video/remotion/` 运行：

```powershell
npm run bgm
npm run render
```

`npm run bgm` 会把它复制到 `video/remotion/public/bgm.mp3` 并打开音频开关；成片里音量 0.30，最后 2 秒淡出。没有文件时渲染无声版本，不会阻塞。
