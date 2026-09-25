# pi-zed-status

English | [简体中文](README.zh-CN.md)

Status feedback for the [Pi coding agent](https://pi.dev) inside Zed Terminal Threads — one file, zero dependencies, zero Zed configuration.

- **Terminal title** — idle shows `∏ <session name>`; while the agent works, the tab spins with Pi's own braille loader (`⠋⠙⠹…`, 80 ms/frame — the same spinner, at the same speed, as inside the Pi TUI). The leading `∏` takes Zed's thread icon slot in the sidebar.
- **Notifications** — a terminal bell rings when a run fully settles (after retries/compaction/queued work) or when Pi is blocked waiting on a confirmation. Zed pops a notification with a blue dot while the terminal is unfocused.
- **Self-healing** — the title is rewritten at least once per second, so any external overwrite (Pi's native title, npm checks, …) recovers within 1s.

## Install

**Via pi package** (installs and updates through Pi's package system):

```sh
pi install npm:@ryanliu0126/pi-zed-status
# or straight from git: pi install git:github.com/RunnanLiu/pi-zed-status
```

**Manual copy** — put the file into Pi's user extensions directory, then restart Pi (or run `/reload`):

```sh
cp pi-zed-status.ts ~/.pi/agent/extensions/
# Windows: C:\Users\<you>\.pi\agent\extensions\
```

To try it once without installing: `pi --extension ./pi-zed-status.ts`

> **Don't double-install.** A `pi install` package and an extensions-dir copy would both run — double title writes, double bells. Pick one.

## Usage

Just run `pi` in a Zed Terminal Thread. No session name yet? The title falls back to the working directory name. Titles are truncated at 40 characters.

Zed needs no settings. If the bell never notifies: run `printf '\a'` in the thread — if Zed doesn't react, add `"terminal": { "bell": "system" }` to Zed's `settings.json`.

Notes for tinkerers: Zed only promotes a *symbol-class* first character to the icon slot — that's why this extension uses `∏` (U+220F) rather than the letter `π`. Design rationale lives in [`.agents/plan.md`](.agents/plan.md).

## Disable / uninstall

- Temporarily: `PI_ZED_STATUS_DISABLE=1` before starting Pi.
- Permanently: delete `~/.pi/agent/extensions/pi-zed-status.ts` and restart.

## License

MIT
