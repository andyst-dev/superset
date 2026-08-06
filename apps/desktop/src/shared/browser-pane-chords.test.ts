import { describe, expect, test } from "bun:test";
import {
	BROWSER_PANE_EXCLUDED_CHORDS,
	canonicalizeChord,
	chordToEventInit,
	inputToChord,
	matchAppChord,
	normalizeToken,
	tokenToCode,
} from "./browser-pane-chords";

const CHORDS = new Set(
	["meta+b", "meta+l", "meta+w", "meta+shift+k", "meta+alt+arrowleft"].map(
		canonicalizeChord,
	),
);

describe("inputToChord", () => {
	test("matches ⌘B by physical position", () => {
		expect(inputToChord({ type: "keyDown", code: "KeyB", meta: true })).toBe(
			"meta+b",
		);
	});

	test("anchors to physical position, not produced character (Dvorak ⌘W)", () => {
		// Dvorak: physical KeyW prints ","
		expect(
			inputToChord({ type: "keyDown", code: "KeyW", key: ",", meta: true }),
		).toBe("meta+w");
	});

	test("includes shift and alt modifiers", () => {
		expect(
			inputToChord({
				type: "keyDown",
				code: "KeyK",
				meta: true,
				shift: true,
			}),
		).toBe("meta+shift+k");
		expect(
			inputToChord({
				type: "keyDown",
				code: "ArrowLeft",
				meta: true,
				alt: true,
			}),
		).toBe("alt+meta+arrowleft");
	});

	test("returns null for modifier-only presses", () => {
		expect(
			inputToChord({ type: "keyDown", code: "MetaLeft", meta: true }),
		).toBeNull();
	});

	test("returns null for non-keyDown types", () => {
		expect(
			inputToChord({ type: "keyUp", code: "KeyB", meta: true }),
		).toBeNull();
	});
});

describe("matchAppChord", () => {
	test("matches a registered chord", () => {
		expect(
			matchAppChord({ type: "keyDown", code: "KeyB", meta: true }, CHORDS),
		).toBe("meta+b");
	});

	test("returns null for unregistered chords", () => {
		expect(
			matchAppChord({ type: "keyDown", code: "KeyX", meta: true }, CHORDS),
		).toBeNull();
	});

	test("leaves page find to the guest (⌘F excluded)", () => {
		expect(
			matchAppChord({ type: "keyDown", code: "KeyF", meta: true }, CHORDS),
		).toBeNull();
		expect(BROWSER_PANE_EXCLUDED_CHORDS.has("meta+f")).toBeTrue();
	});

	test("leaves page print to the guest (⌘P excluded)", () => {
		expect(
			matchAppChord({ type: "keyDown", code: "KeyP", meta: true }, CHORDS),
		).toBeNull();
	});

	test("empty chord index never matches", () => {
		expect(
			matchAppChord({ type: "keyDown", code: "KeyB", meta: true }, new Set()),
		).toBeNull();
	});
});

describe("tokenToCode / chordToEventInit", () => {
	test("tokenToCode round-trips letters, digits, named keys, F-keys", () => {
		expect(tokenToCode("b")).toBe("KeyB");
		expect(tokenToCode("1")).toBe("Digit1");
		expect(tokenToCode("arrowleft")).toBe("ArrowLeft");
		expect(tokenToCode("f5")).toBe("F5");
		expect(tokenToCode("space")).toBe("Space");
	});

	test("chordToEventInit produces a re-dispatchable keydown init", () => {
		const init = chordToEventInit("meta+b");
		expect(init).not.toBeNull();
		expect(init?.code).toBe("KeyB");
		expect(init?.metaKey).toBeTrue();
		expect(init?.bubbles).toBeTrue();
	});

	test("chordToEventInit maps modifiers from the canonical chord", () => {
		const init = chordToEventInit("meta+shift+k");
		expect(init?.code).toBe("KeyK");
		expect(init?.metaKey).toBeTrue();
		expect(init?.shiftKey).toBeTrue();
		expect(init?.ctrlKey).toBeFalse();
	});

	test("chordToEventInit tolerates alias modifier order", () => {
		const init = chordToEventInit("alt+meta+arrowleft");
		expect(init?.code).toBe("ArrowLeft");
		expect(init?.metaKey).toBeTrue();
		expect(init?.altKey).toBeTrue();
	});

	test("chordToEventInit returns null for modifier-only chords", () => {
		expect(chordToEventInit("meta+shift")).toBeNull();
	});

	test("normalizeToken matches the renderer alias table", () => {
		expect(normalizeToken("KeyB")).toBe("b");
		expect(normalizeToken("Digit3")).toBe("3");
		expect(normalizeToken("ControlLeft")).toBe("ctrl");
	});
});
