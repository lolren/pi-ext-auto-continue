# pi-ext-auto-continue

A [pi](https://github.com/earendil-works/pi-coding-agent) extension that automatically sends follow-up messages to keep the conversation going — with Escape-to-pause safety, custom messages, and a live footer status indicator.

## Features

- **Auto-loop** — `/continue 5` tells the agent to respond 5 times in a row
- **Custom messages** — `/continue 3 "keep going"` sends "keep going" instead of "continue"
- **Escape to pause** — press `Escape` to stop the loop at any time (cancels pending messages too)
- **Live status** — shows `auto-continue ◉ 5` in the TUI footer next to the model name
- **Safe delivery** — uses `followUp` delivery so it doesn't throw if you type while it's running
- **Production-ready** — race-condition-safe timer management, max cap, input validation

## Installation

### Option 1: Copy the file (quick)

```bash
curl -o ~/.pi/agent/extensions/auto-continue.ts \
  https://raw.githubusercontent.com/lolren/pi-ext-auto-continue/main/auto-continue.ts
```

Then reload pi: `/reload`.

### Option 2: Clone the repo

```bash
git clone https://github.com/lolren/pi-ext-auto-continue.git
cp pi-ext-auto-continue/auto-continue.ts ~/.pi/agent/extensions/
```

Then reload pi: `/reload`.

### Option 3: As a pi package (for sharing)

```json
{
  "packages": ["git:github.com/lolren/pi-ext-auto-continue"]
}
```

## Usage

```text
/continue                  Start a 10-iteration loop (sends "continue")
/continue 5                Start a 5-iteration loop
/continue "write more"     Start 10 iterations, sends "write more"
/continue 3 "go deeper"    Start 3 iterations, sends "go deeper"
/continue stop             Stop the loop immediately
/continue clear            Same as stop
/status                    Check remaining iterations
```

Press **Escape** at any time to pause the loop.

## How it works

1. `/continue N "message"` starts a loop that will run `N` times
2. After each agent turn completes (`turn_end` event), the extension checks `ctx.isIdle()`. Only when the agent is truly idle (all turns done, all tool calls resolved) does it proceed
3. It waits **10 seconds** (`LOOP_DELAY_MS`) to give the previous response time to settle, then sends the next message
4. The footer status updates in real time: `auto-continue ◉ 3`
5. Pressing `Escape` calls `stop()`, which cancels the pending timer and resets state — no more messages are sent

## Safety

- **Never fires between tool calls** — uses `turn_end` + `ctx.isIdle()` so continuation only triggers after ALL turns resolve, not after individual tool calls
- **Race-condition safe** — pending timers are cancelled on stop/pause, and the timer callback double-checks state before sending
- **Busy-agent safe** — uses `{ deliverAs: "followUp" }` so it won't throw if you type while messages are queued
- **Max cap** — `N` is capped at 100 iterations
- **Input validation** — empty quotes, invalid numbers, and malformed syntax all show a clear error
- **Session-aware** — state is reset on session start/shutdown

## Commands

| Command | Description |
|---------|-------------|
| `/continue` | Start/stop the auto-continue loop |
| `/status` | Show remaining iterations and current message |

## Shortcuts

| Key | Action |
|-----|--------|
| `Escape` | Pause the loop (cancels pending messages) |

## Requirements

- [pi](https://github.com/earendil-works/pi-coding-agent) (the coding agent TUI)
- Node.js 18+

## License

MIT
