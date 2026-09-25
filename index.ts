/**
 * pi-zed-status — Zed Terminal Threads status feedback for the Pi coding agent.
 *
 * Terminal title (OSC 0 via ctx.ui.setTitle; Zed shows the first char in the
 * thread sidebar icon slot):
 *   idle: `∏ <session name ?? cwd basename>`  (∏ U+220F n-ary product = capital Π symbol;
 *        symbol-class first char takes Zed's thread icon slot, unlike letter-class π/𝛑)
 *   busy: `<frame> <name>` braille spinner (⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏, 80ms/frame) — identical
 *        frames and cadence to Pi's built-in TUI loader
 *   Self-healing: the full title is rewritten on change or at least every 1s,
 *   so any external overwrite (pi native title, npm check, …) recovers in ≤1s.
 *
 * Bell (BEL \x07; Zed raises a notification when the terminal is unfocused):
 *   agent_settled   — run fully settled (retries/compaction/queued work done)
 *   ui_prompt_start — Pi blocked on a user-facing prompt (permission gate etc.)
 *
 * Disable with PI_ZED_STATUS_DISABLE=1.
 * Design rationale: .agents/plan.md (port of OC-Zed-Status, official APIs only).
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { basename } from "node:path";

const GLYPH = "∏";
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const TICK_MS = 80;
const REFRESH_MS = 1000;
const MAX_TITLE = 40;

export default function piZedStatus(pi: ExtensionAPI) {
  if (process.env.PI_ZED_STATUS_DISABLE) return;

  // Terminal writes belong to the one interactive session only:
  // not sub-agent sessions (no UI), not print/JSON/RPC modes.
  const active = (ctx: ExtensionContext) => ctx.mode === "tui" && ctx.hasUI;

  let timer: ReturnType<typeof setInterval> | null = null;
  let frame = 0;
  let lastWritten: string | null = null;
  let lastWriteAt = 0;

  const tick = (ctx: ExtensionContext) => {
    try {
      const busy = !ctx.isIdle();
      const name = pi.getSessionName() || basename(ctx.cwd);
      const shown = name.length > MAX_TITLE ? `${name.slice(0, MAX_TITLE - 3)}...` : name;
      const title = busy ? `${FRAMES[frame++ % FRAMES.length]} ${shown}` : `${GLYPH} ${shown}`;
      if (!busy) frame = 0;
      const now = Date.now();
      if (title === lastWritten && now - lastWriteAt < REFRESH_MS) return; // dedup + 1s backstop
      lastWritten = title;
      lastWriteAt = now;
      ctx.ui.setTitle(title);
    } catch {
      // Status feedback must never break the agent.
    }
  };

  pi.on("session_start", (_event, ctx) => {
    if (!active(ctx)) return;
    if (timer) clearInterval(timer); // defensive: pair missed shutdown with a new start
    timer = setInterval(() => tick(ctx), TICK_MS);
    tick(ctx);
  });

  pi.on("session_shutdown", () => {
    if (timer) clearInterval(timer); // covers quit / reload / new / resume / fork
    timer = null;
  });

  const bell = (ctx: ExtensionContext) => {
    if (active(ctx)) process.stdout.write("\x07");
  };

  pi.on("agent_settled", (_event, ctx) => bell(ctx));
  pi.on("ui_prompt_start", (_event, ctx) => bell(ctx));
}
