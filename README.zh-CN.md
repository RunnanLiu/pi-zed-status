# pi-zed-status

[English](README.md) | 简体中文

让 [Pi coding agent](https://pi.dev) 在 Zed Terminal Threads 中获得即时状态反馈——单文件、零依赖、Zed 侧零配置。

- **终端标题** — 空闲显示 `∏ <会话名>`；agent 工作时标签页以 Pi 官方盲文帧旋转（`⠋⠙⠹…`，80ms/帧——与 Pi TUI 内部 spinner 同帧同速）。首字符 `∏` 会占据 Zed 侧栏线程图标位。
- **通知** — 一次运行真正落定后（重试/压缩/排队续跑全部结束）或 Pi 阻塞等待确认时响铃；终端失焦时 Zed 弹通知 + 蓝点。
- **自愈** — 标题每秒至少重写一次，任何外部覆盖（pi 原生标题、npm 检查等）≤1s 自动恢复。

## 安装

拷贝到 Pi 用户扩展目录后重启 pi（或执行 `/reload`）：

```sh
cp pi-zed-status.ts ~/.pi/agent/extensions/
# Windows: C:\Users\<你>\.pi\agent\extensions\
```

免安装试用一次：`pi --extension ./pi-zed-status.ts`

> **勿双装**：扩展目录副本与 `pi install` 包同时存在会双写标题、双响铃。

## 使用

在 Zed Terminal Thread 中正常使用 pi 即可。无会话名时标题回退为目录名；超过 40 字符截断。

Zed 无需任何设置。若响铃从不通知：在终端线程里跑 `printf '\a'`——Zed 无反应则在 `settings.json` 加 `"terminal": { "bell": "system" }`。

给爱折腾的人：Zed 只把**符号类**首字符提升到图标位——所以本扩展用 `∏`（U+220F）而非字母 `π`。设计依据见 [`.agents/plan.md`](.agents/plan.md)。

## 禁用 / 卸载

- 临时禁用：启动前设置 `PI_ZED_STATUS_DISABLE=1`
- 彻底卸载：删除 `~/.pi/agent/extensions/pi-zed-status.ts` 并重启

## 许可

MIT
