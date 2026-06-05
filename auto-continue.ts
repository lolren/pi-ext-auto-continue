import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const MAX_ITERATIONS = 100;
const LOOP_DELAY_MS = 10_000;
/** How long to wait after the last agent_end before considering the prompt fully settled. */
const SETTLE_MS = 30_000;

export default function autoContinue(pi: ExtensionAPI) {
	let remaining = 0;
	let active = false;
	let customMessage: string | null = null;
	let pendingTimer: ReturnType<typeof setTimeout> | null = null;
	let settleTimer: ReturnType<typeof setTimeout> | null = null;

	function statusLabel(): string {
		if (!active) return "";
		const msgPart =
			customMessage !== null && customMessage !== "continue"
				? ` \u201C${customMessage}\u201D`
				: "";
		return `auto-continue \u25C9 ${remaining}${msgPart}`;
	}

	function clearStatus(ctx: {
		ui: { setStatus: (key: string, val: string) => void };
	}) {
		ctx.ui.setStatus("auto-continue", "");
	}

	function updateStatus(ctx: {
		ui: {
			setStatus: (key: string, val: string) => void;
			theme: { fg: (style: string, text: string) => string };
		};
	}) {
		const label = statusLabel();
		if (label) {
			ctx.ui.setStatus("auto-continue", ctx.ui.theme.fg("accent", label));
		} else {
			ctx.ui.setStatus("auto-continue", "");
		}
	}

	function cancelAllTimers() {
		if (pendingTimer !== null) {
			clearTimeout(pendingTimer);
			pendingTimer = null;
		}
		if (settleTimer !== null) {
			clearTimeout(settleTimer);
			settleTimer = null;
		}
	}
	// Alias so old call sites don't silently break
	const cancelPendingTimer = cancelAllTimers;

	function reset(ctx?: {
		ui: { setStatus: (key: string, val: string) => void };
	}) {
		cancelAllTimers();
		remaining = 0;
		active = false;
		customMessage = null;
		if (ctx) clearStatus(ctx);
	}

	function stop(
		reason: string,
		ctx?: {
			ui: {
				setStatus: (key: string, val: string) => void;
				notify: (msg: string, level: string) => void;
			};
		},
	) {
		cancelAllTimers();
		remaining = 0;
		active = false;
		customMessage = null;
		if (ctx) clearStatus(ctx);
		console.log(`[auto-continue] Loop stopped: ${reason}`);
	}

	/**
	 * Parse /continue arguments in the form:
	 *   /continue [N] ["message"]
	 *
	 * N and "message" are optional and can appear in either order.
	 * Returns null on invalid input.
	 */
	function parseContinueArgs(raw: string): {
		count: number | null;
		message: string | null;
	} | null {
		let count: number | null = null;
		let message: string | null = null;

		// Match quoted string (double or single quotes)
		const quotedRe = /["']([^"']*)["']/;
		const quotedMatch = raw.match(quotedRe);
		if (quotedMatch) {
			const extracted = quotedMatch[1];
			// Reject empty quotes "" or ''
			if (extracted.length === 0) return null;
			message = extracted;
			// Remove the quoted part from the raw string for further parsing
			raw = raw.replace(quotedRe, "").trim();
		}

		// Remaining should be a number if present
		if (raw) {
			const n = parseInt(raw, 10);
			if (isNaN(n) || n <= 0) return null;
			if (n > MAX_ITERATIONS) return null;
			count = n;
		}

		return { count, message };
	}

	pi.registerCommand("continue", {
		description:
			"Auto-continue loop: /continue [N] [\"message\"] | /continue stop|clear",
		handler: async (args, ctx) => {
			const trimmed = args.trim();
			const lower = trimmed.toLowerCase();

			if (lower === "stop" || lower === "clear") {
				stop("manual stop/clear", ctx);
				ctx.ui.notify("Auto-continuation stopped", "info");
				return;
			}

			if (trimmed === "") {
				remaining = 10;
				active = true;
				customMessage = null;
			} else {
				const parsed = parseContinueArgs(trimmed);

				if (parsed === null) {
					ctx.ui.notify(
						`Invalid argument: "${trimmed}". Use /continue [N] [\"message\"] or /continue stop|clear` +
							` (max: ${MAX_ITERATIONS}, no empty quotes)`,
						"error",
					);
					return;
				}

				remaining = parsed.count ?? 10;
				customMessage = parsed.message ?? null;
				active = true;
			}

			const msgDetail = customMessage
				? `, message: "${customMessage}"`
				: "";
			console.log(
				`[auto-continue] Loop started with ${remaining} iteration(s)${msgDetail}`,
			);
			ctx.ui.notify(
				`Auto-continuation started: ${remaining} iteration(s)${msgDetail}`,
				"info",
			);
			updateStatus(ctx);

			// Kick the settle timer immediately — if the agent is already idle,
			// we'd never get an agent_end to start the loop.
			onAgentEnd(ctx);
		},
	});

	pi.registerCommand("status", {
		description: "Show remaining auto-continuation iterations",
		handler: async (_args, ctx) => {
			if (active) {
				const msgDetail = customMessage
					? `, message: "${customMessage}"`
					: "";
				const msg = `Auto-continuation active: ${remaining} iteration(s) remaining${msgDetail}`;
				console.log(`[auto-continue] ${msg}`);
				ctx.ui.notify(msg, "info");
				updateStatus(ctx);
			} else {
				const msg = "No auto-continuation loop running";
				console.log(`[auto-continue] ${msg}`);
				ctx.ui.notify(msg, "info");
				clearStatus(ctx);
			}
		},
	});

	// Ctrl+Alt+P to pause the loop (Escape is reserved by built-in app.interrupt)
	pi.registerShortcut("ctrl+alt+p", {
		description: "Pause auto-continuation loop",
		handler: async (ctx) => {
			if (active) {
				stop("pause shortcut", ctx);
				console.log("[auto-continue] Loop paused via Ctrl+Alt+P");
				ctx.ui.notify("Auto-continuation paused (Ctrl+Alt+P)", "info");
			}
		},
	});

	/**
	 * Schedule the next continuation message.
	 * Only called after the settle window expires (no new agent_end events).
	 */
	function scheduleNext(ctx: {
		ui: {
			setStatus: (key: string, val: string) => void;
			notify: (msg: string, level: string) => void;
			theme: { fg: (style: string, text: string) => string };
		};
	}) {
		settleTimer = null;

		if (!active || remaining <= 0) return;

		remaining--;
		const msg = customMessage ?? "continue";
		console.log(`[auto-continue] Sending "${msg}", ${remaining} remaining`);

		if (remaining === 0) {
			active = false;
			customMessage = null;
			console.log("[auto-continue] Loop completed successfully");
			ctx.ui.setStatus("auto-continue", "");
			ctx.ui.notify("Auto-continuation completed", "info");
			return;
		}

		updateStatus(ctx);
		cancelAllTimers();

		pendingTimer = setTimeout(() => {
			pendingTimer = null;
			if (!active || remaining <= 0) return;
			pi.sendUserMessage(msg, { deliverAs: "followUp" });
		}, LOOP_DELAY_MS);
	}

	/**
	 * Kick the settle timer. Each agent_end resets it.
	 * Only when no agent_end fires within SETTLE_MS do we actually schedule
	 * the next continuation — this prevents firing between rapid turns/tool calls.
	 */
	function onAgentEnd(ctx: {
		ui: {
			setStatus: (key: string, val: string) => void;
			notify: (msg: string, level: string) => void;
			theme: { fg: (style: string, text: string) => string };
		};
	}) {
		if (!active || remaining <= 0) return;

		// Reset settle timer on each agent_end
		if (settleTimer !== null) {
			clearTimeout(settleTimer);
		}
		settleTimer = setTimeout(() => {
			scheduleNext(ctx);
		}, SETTLE_MS);
	}

	// agent_end fires after each turn within a prompt. We debounce it with a
	// settle timer so the continuation only fires after ALL turns settle.
	pi.on("agent_end", async (_event, _ctx) => {
		onAgentEnd(_ctx);
	});

	pi.on("session_start", async (_event, ctx) => {
		reset(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		reset(ctx);
	});
}
