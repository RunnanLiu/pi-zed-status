# 实施方案：消除通知中的盲文残留（v0.1.3）

> **状态：已发布（npm 0.1.3 / tag v0.1.3，2026-09-29），待用户升级验收。**

> 问题：`agent_settled` 响铃时标题仍是最新的盲文帧，Zed 通知快照取到 `⠋ 会话名` 而非 `∏ 会话名`。
> 根因：标题与响铃是两条无顺序约束的副作用链路；标题靠 ≤80ms 后的 tick 追赶。
> 解法：提取唯一标题写者 `writeTitle(ctx, busy)`；settled 处理器内**同步先写 ∏ 标题、后写 BEL**，顺序成为结构属性。
> 本文件是唯一定稿方案。实施时逐项打勾；偏离先修订本文件。

---

## 1. 设计不变量

> **INV：任何 BEL 写入 stdout 时，标题状态必须已反映"落定"（∏ 形态）。**

- 标题的**唯一写者**是 `writeTitle()`（组装/帧归零/去抖/兜底状态全部收敛于此）
- `agent_settled` 处理器 = 原子序列 `writeTitle(ctx,false) → BEL`（同一同步块，无窗口）
- `ui_prompt_start` 只响铃不改标题（spinner 继续转 = "任务进行中等人"的正确语义，与 OC 行为一致）

## 2. 代码变更（index.ts，净 diff ≈ +6 行）

### 2.1 替换 tick 为 writeTitle + 一行 tick

删除现 tick 函数体（第 41–54 行），替换为：

```ts
  // Single writer for the terminal title: compose → dedup/backstop → write.
  // Shared by the poll loop (tick) and event handlers (agent_settled).
  const writeTitle = (ctx: ExtensionContext, busy: boolean) => {
    const name = pi.getSessionName() || basename(ctx.cwd);
    const shown = name.length > MAX_TITLE ? `${name.slice(0, MAX_TITLE - 3)}...` : name;
    const title = busy ? `${FRAMES[frame++ % FRAMES.length]} ${shown}` : `${GLYPH} ${shown}`;
    if (!busy) frame = 0;
    const now = Date.now();
    if (title === lastWritten && now - lastWriteAt < REFRESH_MS) return; // dedup + 1s backstop
    lastWritten = title;
    lastWriteAt = now;
    ctx.ui.setTitle(title);
  };

  const tick = (ctx: ExtensionContext) => writeTitle(ctx, !ctx.isIdle());
```

（try/catch 保留：tick 的调用点 `setInterval(() => tick(ctx), TICK_MS)` 改为
`setInterval(() => { try { tick(ctx); } catch {} }, TICK_MS)`，或保留 tick 内部 try/catch —— 采用后者，tick 仍自带容错：

```ts
  const tick = (ctx: ExtensionContext) => {
    try {
      writeTitle(ctx, !ctx.isIdle());
    } catch {
      // Status feedback must never break the agent.
    }
  };
```

）

### 2.2 重写两个响铃 handler，删除 bell 辅助函数

删除：

```ts
  const bell = (ctx: ExtensionContext) => {
    if (active(ctx)) process.stdout.write("\x07");
  };

  pi.on("agent_settled", (_event, ctx) => bell(ctx));
  pi.on("ui_prompt_start", (_event, ctx) => bell(ctx));
```

替换为：

```ts
  // INV: the title already shows the settled ∏ form before the bell rings,
  // so Zed's notification snapshot never captures a spinner frame.
  pi.on("agent_settled", (_event, ctx) => {
    if (!active(ctx)) return;
    writeTitle(ctx, false); // explicit idle — do not depend on isIdle() timing here
    process.stdout.write("\x07");
  });

  pi.on("ui_prompt_start", (_event, ctx) => {
    if (active(ctx)) process.stdout.write("\x07"); // spinner keeps running: task paused, waiting for the user
  });
```

### 2.3 头部注释补一行 INV 说明

在 Bell 段注释追加：

```
 *   Ordering invariant: on agent_settled the ∏ title is written synchronously
 *   before the BEL, so the notification snapshot never shows a spinner frame.
```

## 3. 冒烟测试变更（test-pzs.mjs）

1. 现有断言 [2]–[7] 全部保持不变（行为兼容）
2. 新增 [8] 顺序断言：驱动 busy spinner 数帧后调用 `handlers.agent_settled[0]({}, busyCtx)`，验证：
   - 事件循环内 `titles.at(-1)` === `"∏ 测试会话 Test Session"`
   - 响铃发生在标题写入**之后**：在 mock 的 setTitle 与 stdout.write(\x07) 里推进同一个 `oplog` 数组（如 `oplog.push(["T", title])` / `oplog.push(["B"])`），断言 `oplog` 最后两项 = `[["T","∏ …"], ["B"]]`
3. [9] 回归断言：settled 后 80ms 内 tick 不重复写标题（oplog 无多余 ["T"]）——验证去抖状态被 writeTitle 正确维护

## 4. 版本与发布

| 步骤 | 内容 |
|---|---|
| 4.1 | `package.json` version → `0.1.3` |
| 4.2 | 冒烟全绿后 commit（信息：`Settle title before bell so notifications never show a spinner frame`） |
| 4.3 | `npx --yes npm@11.15.0 publish --access public --json`——**预期触发 2FA**：把 authUrl 转给用户浏览器确认（勾选 trust IP 5 分钟），窗口内重跑 |
| 4.4 | registry 轮询验证 `dist-tags.latest === 0.1.3`（容忍索引传播，≤1 分钟重试循环） |
| 4.5 | ~~本机 remove+install~~ 改为：**用户经提示链路手动升级**——发布且 registry 传播后重启 pi，待更新提示出现，执行 `pi update --extension` 升至 0.1.3（放在全部发布步骤之后、验收之前） |
| 4.6 | push + tag `v0.1.3`（信息：`v0.1.3: settle title before bell (notification snapshot fix)`） |
| 4.7 | plan.md 迭代记录追加一行（v0.1.3：通知快照修复，writeTitle 单一写者重构） |

## 5. 用户验收（真实环境）

1. 重启 pi / `/reload`
2. 触发一个较长任务（busy 期间确认 spinner 正常）
3. 切走焦点等待完成通知 → **通知标题应显示 `∏ 会话名`，无盲文残留**
4. 连续观察 2–3 次完成通知（覆盖 Zed 快照时机的随机性）
5. 若仍偶发残留 → 属 Zed 内部异步快照行为（字节流顺序已保证），记录频率后另议上游 workaround

## 6. 回滚

单 commit revert 即可（无数据/配置迁移）。npm 已发版本不可撤，但 0.1.2 → 0.1.3 为纯修复，无破坏面。

## 7. 任务清单

- [x] 1. index.ts：writeTitle 单一写者 + 一行 tick（含 try/catch 容错）
- [x] 2. index.ts：重写 agent_settled / ui_prompt_start handler，删 bell 辅助函数，补 INV 注释
- [x] 3. test-pzs.mjs：oplog 顺序断言 [8] + 去抖回归 [9]，全量重跑通过（含 [7] 段 mock 污染修复：隔离工厂）
- [x] 4. bump 0.1.3 → commit → publish（重新登录 + 2FA 授权窗口）→ registry 验证（0.1.3 @ 2026-09-29T11:56:32Z）
- [x] 5. push + tag v0.1.3 → plan.md 记录（0b52808；用户后续经提示链路 `pi update --extension` 手动升级）
- [ ] 6. 用户升级 0.1.3 后真实环境验收（§5），plan.md 打勾收尾
