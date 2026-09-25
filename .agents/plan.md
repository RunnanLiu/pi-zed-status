# pi-zed-status 实施方案（Plan）

> 目标：为 [pi coding agent](https://pi.dev) 提供 OC-Zed-Status 同款 Zed Terminal Threads 可视化反馈——idle 静态图标 `▣` + busy 四象限 spinner（终端标题）+ 完成/等待确认响铃（BEL）。
> 本文件是唯一定稿方案。实施时按任务列表逐项打勾（`- [ ]` → `- [x]`），不偏离方案；发现方案与实际不符时，先修订本文件再继续。
>
> **状态（2026-09-25）：任务 1-12 全部完成并通过验证（含人工实测），项目交付。仅剩可选任务 13（发布准备）未启动。**
>
> **UI 迭代记录**：2026-09-25 idle `▣` → `𝛑`（字母类被 Zed 当正文，弃）→ `∏`（U+220F 符号类大写 Π，占图标位）；busy `▘▝▗▖` → `◐◑◒◓` 画圆（试用后弃）→ `⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏` 盲文 @80ms（pi TUI 内置 Loader 同帧同速）；标题格式 `∏ pi \| 名字` → `∏ 名字`（去品牌词，定稿）。图标位规则与备选清单见 README。

---

## 1. 设计裁决（官方优先，三方仅参考）

| 需求 | 采用 | 依据 | 弃用 |
|---|---|---|---|
| 写标题 | `ctx.ui.setTitle()`（→ OSC 0） | pi 官方扩展 UI API | monkey-patch stdout、裸写 `\x1b]2;` |
| busy 判定 | `ctx.isIdle()` 轮询 | 官方 ctx 接口 | 事件驱动的 busy 状态机 |
| 完成铃 | `agent_settled` | pi 官方示例 `notify.ts`（agent_end 会因 retry/compaction/排队续跑多次触发） | `agent_end`（Zed 文档极简 demo 用它，语义不精准） |
| 等待铃 | `ui_prompt_start` | 官方事件：阻塞在等用户的 UI 提示 | — |
| 子代理隔离 | `ctx.hasUI` 守卫 + 子代理本为独立进程 | pi-zed-plugin 经验 | opencode 式 parentID 过滤 |
| timer 生命周期 | factory 零副作用；`session_start` 起、`session_shutdown` 清 | extensions.md 明文约束 | factory 内 setInterval |
| 非 TUI 模式 | `ctx.mode === "tui"` 守卫 | extensions.md 明文 | — |
| 标题被覆盖恢复 | 1s 无条件兜底重写 | OC-Zed-Status 实战验证（REFRESH_MS） | stdout 拦截、依赖事件顺序重写 |
| Zed 侧配置 | **零配置**（BEL→失焦通知为内置行为） | OC 零配置可用即证明 | 预置 settings 要求 |

## 2. 架构（定稿，约 60 行单文件）

```
pi-zed-status.ts（零依赖，仅 node:path）
│
│  常量：GLYPH="▣"  FRAMES=["▘","▝","▗","▖"]
│        TICK_MS=200  REFRESH_MS=1000  MAX_TITLE=40
│
├─ factory(pi)                            # 唯一副作用：注册 4 个 handler
│   │   process.env.PI_ZED_STATUS_DISABLE → 直接 return
│   │
│   ├─ pi.on("session_start")             # 守卫：ctx.mode==="tui" && ctx.hasUI
│   │     → 防御性清旧 timer → setInterval(() => tick(ctx), 200)
│   ├─ pi.on("session_shutdown")          # clearInterval（幂等：quit/reload/new/resume/fork 全覆盖）
│   ├─ pi.on("agent_settled")             # 守卫同上 → process.stdout.write("\x07")
│   └─ pi.on("ui_prompt_start")           # 守卫同上 → 同上
│
└─ tick(ctx)  每 200ms，整体 try/catch（静默容错）
      busy  = !ctx.isIdle()
      base  = "pi | " + truncate(pi.getSessionName() ?? basename(ctx.cwd), 40)
      title = busy ? `${FRAMES[f++ % 4]} ${base}` : `${GLYPH} ${base}`   # idle 时 f=0
      写入条件：title 变化 或 距上次写入 ≥ REFRESH_MS
      → ctx.ui.setTitle(title)
```

**机制分界**：标题 = 纯轮询（每 tick 即完整事实，零状态机、零顺序依赖）；铃 = 独立事件。两条线无共享状态，无第三种结构。

**明确不做**（防过度设计）：AI 命名、设置面板/持久化配置、宿主检测（TERM_PROGRAM/tmux 让位）、stdout 拦截、退出时标题还原、isTTY 双重守卫、双语 README、初期 package.json。

## 3. 效果对照（验收基准）

| 效果 | OC-Zed-Status | 本方案 |
|---|---|---|
| idle | `▣ OC \| 标题`，侧栏图标位 ▣ | `▣ pi \| <会话名 ?? 目录名>` |
| busy | ▘▝▗▖ 200ms/帧 | 完全相同（idle 帧归零） |
| 覆盖恢复 | ≤1s | 相同机制 |
| 完成铃 | session.idle（仅顶层） | agent_settled |
| 等待铃 | permission.asked | ui_prompt_start |
| 禁用 | 环境变量 | `PI_ZED_STATUS_DISABLE=1` |
| Zed 配置 | 零 | 零（仅 `printf '\a'` 无反应时兜底加 `terminal.bell:"system"`） |

## 4. 交付物

```
D:/Artifact/Pi-Custom/pi-zed-status/
├── pi-zed-status.ts    # 全部实现
├── README.md            # 英文主文档（跳转中文版）
├── README.zh-CN.md      # 中文文档
└── .agents/plan.md      # 本文件
```

- 开发验证：`pi --extension ./pi-zed-status.ts`
- 部署：拷入 `~/.pi/agent/extensions/`（与包安装**二选一**，双装会双写/双响）
- 将来发布：加个人 npm scope（如 `@<user>/pi-zed-status`），避开已有的 `@yukikisaku/pi-zed-status`

## 5. 任务列表（逐项打勾，全部完成 = 项目完成）

### 阶段一：实现

- [x] 1. 创建 `pi-zed-status.ts`：factory + 4 个 handler 注册骨架（含 env 禁用开关、`mode==="tui" && hasUI` 合并守卫）
- [x] 2. 实现 tick 标题循环：常量定义、`ctx.isIdle()` busy 判定、`getSessionName() ?? basename(ctx.cwd)`、40 字符截断、帧动画与 idle 归零、写入去抖（变化或 ≥1s）、整体 try/catch
- [x] 3. 实现 bell：`agent_settled` + `ui_prompt_start` → `\x07`（守卫内）
- [x] 4. 实现生命周期：`session_start` 启 timer（防御性清旧）、`session_shutdown` 幂等清 timer
- [x] 5. 编写 `README.md`（中文，含安装/卸载、双装警告、Zed 零配置说明、`printf '\a'` 自检法、禁用开关）

### 阶段二：开发期验证（`pi --extension ./pi-zed-status.ts`）

- [x] 6. idle 状态显示 `▣ pi | <名>`，Zed 标签标题与侧栏图标位正确 ✅ 人工实测通过（2026-09-25）
- [x] 7. busy 状态四象限旋转（200ms/帧），idle 后归零回 ▣ ✅ 人工实测通过（2026-09-25）
- [x] 8. `pi -p`（print 模式）运行无任何终端写入 ✅ 已验证（2026-09-25）：mock 全项通过（4 事件注册/帧动画/守卫/截断/去抖/shutdown 停表）；真实 `pi --no-session --extension ./pi-zed-status.ts -p` 加载正常，输出 0 次 BEL / 0 次 OSC 0

### 阶段三：部署实测（`~/.pi/agent/extensions/`，在 Zed Terminal Thread 中）

- [x] 9. 失焦时任务完成 → Zed 弹通知（bell 链路零配置重接生效）✅ 人工实测通过（2026-09-25）
- [x] 10. 会话改名/切换（`session_info_changed` 触发 pi 原生重写）后 ≤1s 恢复 ▣ 前缀 ✅ 人工实测通过（2026-09-25）
- [x] 11. 制造 API 错误重试场景 → 无提前铃、最终只响一次（验证 settled 选型）✅ 人工实测通过（2026-09-25）
- [x] 12. quit / reload / 切会话 → 无悬挂 timer 报错、无重复动画 ✅ 人工实测通过（2026-09-25）
- [ ] 13. （可选）发布准备：package.json + scope 命名 + `pi install` 验证（未启动，待需要时执行）

## 6. 已知取舍与风险（接受，不为此加码）

- `isIdle()` 在重试/compaction 间隙可能瞬时为 true → spinner 暂闪即恢复（纯视觉；OC 轮询粒度类似）。实测不可接受才考虑补偿，且需先修订本方案
- Zed 版本差异可能影响 bell 默认行为 → 任务 9 已含兜底路径
- 依赖的官方 API：`ctx.ui.setTitle`、`ctx.isIdle`、`pi.getSessionName`、`ctx.mode/hasUI`、事件 `session_start/session_shutdown/agent_settled/ui_prompt_start`——若 pi 升级后行为变化，以官方文档复核为准

## 7. 参考

- 原型：`D:/Artifact/OC-Zed-Status`（zed-title.js 轮询/写入去抖逻辑、zed-bell.js 语义）
- pi 官方：`examples/extensions/notify.ts`（agent_settled 先例）、`docs/extensions.md`（生命周期与 mode 守卫约束）
- 三方参考（仅经验，不采码）：`@yukikisaku/pi-zed-status`（hasUI 守卫、tmux 情报）、`zed-notify`（Zed bell 配置与双装坑）
