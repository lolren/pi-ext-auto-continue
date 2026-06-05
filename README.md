# pi-ext-auto-continue

A [pi](https://github.com/earendil-works/pi-coding-agent) extension that automatically sends follow-up messages to keep the conversation going — with Escape-to-pause safety, custom messages, and a live footer status indicator.

## Features

- **Auto-loop** — `/continue 5` tells the agent to respond 5 times in a row
- **Custom messages** — `/continue 3 "keep going"` sends "keep going" instead of "continue"
- **Pause anytime** — press `Ctrl+Alt+P` to stop the loop at any time (cancels pending messages too)
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
2. After each agent turn completes (`agent_end` event), the extension starts a **3-second settle timer**. If another `agent_end` fires (another turn), the timer resets. Only when no `agent_end` fires for 3 seconds — meaning all turns and tool calls are truly done — does it proceed
3. It then waits **10 seconds** (`LOOP_DELAY_MS`) for good measure, then sends the next message
4. The footer status updates in real time: `auto-continue ◉ 3`
5. Pressing `Ctrl+Alt+P` calls `stop()`, which cancels the pending timer and resets state — no more messages are sent

## Safety

- **Never fires between tool calls** — uses a 3-second settle debounce on `agent_end`; continuation only triggers after turns stop arriving
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
| `Ctrl+Alt+P` | Pause the loop (cancels pending messages) |

## Requirements

- [pi](https://github.com/earendil-works/pi-coding-agent) (the coding agent TUI)
- Node.js 18+

## License

MIT
