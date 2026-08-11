/**
 * Reclaiming TUI-only input-reporting modes leaked into a live shell prompt (#4949).
 *
 * A TUI (mastracode/pi-tui, Claude Code) arms the kitty keyboard protocol / mouse
 * tracking / focus reporting and disarms them on clean exit. Killed uncleanly
 * (SIGKILL, crash) it never writes the restore sequences, so the shell that
 * reclaims the pty inherits them: every keystroke is CSI-u encoded (Ctrl+C ->
 * `^[[99;5u`), mouse moves spray reports, and the terminal is unusable until
 * `reset`.
 *
 * This module owns only the decision logic — a shell-owned epoch (modes armed
 * before the first prompt marker belong to shell init and are never reclaimed)
 * and a mark-then-recheck flush (a mode re-armed before the flush keeps its
 * state). It is transport-agnostic so any surface that can observe the terminal
 * stream can reuse it: the renderer xterm parser today (see
 * renderer/lib/terminal/terminalInputModeReclaimer.ts), a host-side VT scanner
 * later.
 */

const ESC = "\x1b";

/**
 * Superset's app-private prompt marker (`OSC 777;superset-shell-ready`), emitted
 * by the shell wrappers before every prompt. Its arrival means the shell owns the
 * foreground again. Reclaim keys on this — NOT the co-emitted FinalTerm `OSC
 * 133;A` — because 133;A is also emitted by third-party shell integrations and
 * forwarded by tmux for shells Superset did not wrap, so disarming on it would
 * clear a live tmux's own modes. Only Superset's wrappers emit 777.
 */
export const SHELL_READY_OSC_ID = 777;
export const SHELL_READY_MARKER_PAYLOAD = "superset-shell-ready";

/**
 * Kitty keyboard protocol disarm: a stack unwind (`CSI < 255 u` pops more than
 * the stack holds, emptying it) plus an explicit set-to-0 (`CSI = 0 ; 1 u`) that
 * covers flags armed without a push.
 */
export const KITTY_KEYBOARD_DISARM_SEQUENCE = `${ESC}[<255u${ESC}[=0;1u`;

/**
 * Full input-mode reset for an xterm that is about to host a brand-new shell
 * over stale content (cold-restore "Start shell", terminal restart). The
 * replayed scrollback of the old session can contain a TUI's arming sequences
 * (mouse tracking, kitty keyboard, app cursor, bracketed paste), and the fresh
 * PTY knows nothing about them — every scroll would spray SGR mouse reports
 * and every keypress CSI-u codes into the new shell as garbage text. Unlike
 * the marker-based reclaimer below, this is unconditional: at this moment the
 * shell is known to be new, so any armed input mode is stale by definition.
 */
export const FRESH_SHELL_INPUT_MODE_RESET =
	KITTY_KEYBOARD_DISARM_SEQUENCE +
	`${ESC}[?1003l` + // mouse tracking (any level's reset clears the protocol)
	`${ESC}[?1006l` + // SGR mouse encoding
	`${ESC}[?1004l` + // focus reporting
	`${ESC}[?2004l` + // bracketed paste
	`${ESC}[?1l`; // application cursor keys

/** TUI-only input-reporting modes a killed TUI can leak into a shell prompt. */
export type LeakableInputMode = "kitty" | "mouse" | "focus";

/**
 * Disarm bytes per leakable mode. Mouse tracking is one xterm group — any level
 * low (`?1003l`) clears the whole protocol — so a single reset covers 9/1000/
 * 1002/1003. Shells never arm these, so reclaiming them at a prompt is safe.
 */
export const LEAKED_MODE_DISARM: Record<LeakableInputMode, string> = {
	kitty: KITTY_KEYBOARD_DISARM_SEQUENCE,
	mouse: `${ESC}[?1003l`,
	focus: `${ESC}[?1004l`,
};

export interface LeakedInputModeReclaimer {
	/** Record a mode arming (true) or restore (false) seen in the stream. */
	noteArm(mode: LeakableInputMode, armed: boolean): void;
	/**
	 * A shell-ready marker arrived: mark still-armed, non-shell-owned modes as
	 * leaked and clear their shadow (in stream order). Call `collectDisarm` after
	 * the parse settles.
	 */
	noteShellReady(): void;
	/**
	 * Mark this runtime as restored/seeded rather than freshly booted. Input
	 * modes observed before the first shell-ready marker on a restored runtime
	 * were carried over from a possibly-dead session (a persisted snapshot or
	 * the host reattach preamble), NOT armed by a fresh shell — so the
	 * shell-ownership exemption must not apply to them. They stay reclaimable
	 * at the next marker. Shells never arm these modes, so reclaiming is safe.
	 */
	noteRestoreAttach(): void;
	/**
	 * Disarm bytes for modes leaked at the last marker and not re-armed since — so
	 * a live/suspended/racing TUI that owns the foreground keeps its modes.
	 * Consumes the pending set; returns "" when nothing leaked.
	 */
	collectDisarm(): string;
}

/**
 * Create a transport-agnostic reclaimer. Feed it arm/marker events from any
 * source and write whatever `collectDisarm` returns back to the terminal.
 */
export function createLeakedInputModeReclaimer(): LeakedInputModeReclaimer {
	const modeNames: LeakableInputMode[] = ["kitty", "mouse", "focus"];
	const state = new Map<
		LeakableInputMode,
		{ armed: boolean; shellOwned: boolean; pending: boolean }
	>(
		modeNames.map((m) => [
			m,
			{ armed: false, shellOwned: false, pending: false },
		]),
	);
	let sawMarker = false;
	// True once `noteRestoreAttach` runs: this xterm was seeded from a persisted
	// snapshot / sibling serialize / host reattach preamble rather than a fresh
	// shell boot, so pre-marker arms are program-sourced, not shell-init-owned.
	let restoreSourced = false;

	return {
		noteArm(mode, armed) {
			const s = state.get(mode);
			if (!s) return;
			s.armed = armed;
			if (armed) {
				// A re-arm cancels a pending reclaim — the mode is live again.
				s.pending = false;
				// Armed before the first marker → shell init owns it. On a
				// restored/seeded runtime the arms came from the dead session,
				// not shell init, so they stay reclaimable (#6308/#6343).
				if (!sawMarker && !restoreSourced) s.shellOwned = true;
			} else {
				s.shellOwned = false;
			}
		},
		noteRestoreAttach() {
			restoreSourced = true;
			// Any mode that arrived before this point on a restore was the dead
			// session's — undo the shell-ownership exemption so the next marker
			// reclaims it instead of grandfathering it forever.
			for (const s of state.values()) {
				if (s.armed) s.shellOwned = false;
			}
		},
		noteShellReady() {
			sawMarker = true;
			for (const s of state.values()) {
				if (s.armed && !s.shellOwned) {
					s.pending = true;
					s.armed = false;
				}
			}
		},
		collectDisarm() {
			let disarm = "";
			for (const mode of modeNames) {
				const s = state.get(mode);
				if (!s) continue;
				if (s.pending && !s.armed) disarm += LEAKED_MODE_DISARM[mode];
				s.pending = false;
			}
			return disarm;
		},
	};
}
