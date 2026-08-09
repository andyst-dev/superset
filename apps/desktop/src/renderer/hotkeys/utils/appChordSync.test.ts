import { describe, expect, it, mock } from "bun:test";
import {
	APP_CHORD_SYNC_RETRY_DELAYS_MS,
	createAppChordSync,
} from "./appChordSync";

interface ScheduledRetry {
	callback: () => void;
	cancelled: boolean;
	delayMs: number;
}

function createManualScheduler() {
	const scheduled: ScheduledRetry[] = [];
	return {
		cancelRetry: (retry: unknown) => {
			(retry as ScheduledRetry).cancelled = true;
		},
		runNext: () => {
			const retry = scheduled.find(({ cancelled }) => !cancelled);
			if (!retry) throw new Error("No retry is scheduled");
			retry.cancelled = true;
			retry.callback();
		},
		scheduleRetry: (callback: () => void, delayMs: number) => {
			const retry = { callback, cancelled: false, delayMs };
			scheduled.push(retry);
			return retry;
		},
		scheduled,
	};
}

async function settlePromises(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

describe("createAppChordSync", () => {
	it("retries transient failures with bounded backoff until the latest chords sync", async () => {
		const scheduler = createManualScheduler();
		let failuresRemaining = 2;
		const push = mock(async () => {
			if (failuresRemaining > 0) {
				failuresRemaining -= 1;
				throw new Error("IPC not ready");
			}
		});
		const sync = createAppChordSync({
			getChords: () => ["meta+k"],
			push,
			...scheduler,
		});

		sync.request();
		await settlePromises();
		expect(push).toHaveBeenCalledTimes(1);
		expect(scheduler.scheduled[0]?.delayMs).toBe(
			APP_CHORD_SYNC_RETRY_DELAYS_MS[0],
		);

		scheduler.runNext();
		await settlePromises();
		expect(push).toHaveBeenCalledTimes(2);
		expect(scheduler.scheduled[1]?.delayMs).toBe(
			APP_CHORD_SYNC_RETRY_DELAYS_MS[1],
		);

		scheduler.runNext();
		await settlePromises();
		expect(push).toHaveBeenCalledTimes(3);
		expect(
			scheduler.scheduled.filter(({ cancelled }) => !cancelled),
		).toHaveLength(0);
	});

	it("cancels a stale retry and sends the newest state immediately", async () => {
		const scheduler = createManualScheduler();
		let chords = ["meta+k"];
		const pushed: string[][] = [];
		const push = mock(async (nextChords: string[]) => {
			pushed.push(nextChords);
			if (pushed.length === 1) throw new Error("IPC not ready");
		});
		const sync = createAppChordSync({
			getChords: () => chords,
			push,
			...scheduler,
		});

		sync.request();
		await settlePromises();
		expect(
			scheduler.scheduled.filter(({ cancelled }) => !cancelled),
		).toHaveLength(1);

		chords = ["meta+shift+p"];
		sync.request();
		await settlePromises();

		expect(pushed).toEqual([["meta+k"], ["meta+shift+p"]]);
		expect(
			scheduler.scheduled.filter(({ cancelled }) => !cancelled),
		).toHaveLength(0);
	});

	it("sends a newer state immediately after an obsolete in-flight push settles", async () => {
		const scheduler = createManualScheduler();
		let chords = ["meta+k"];
		let rejectFirstPush: ((error: Error) => void) | undefined;
		const pushed: string[][] = [];
		const push = mock((nextChords: string[]) => {
			pushed.push(nextChords);
			if (pushed.length > 1) return Promise.resolve();
			return new Promise<void>((_resolve, reject) => {
				rejectFirstPush = reject;
			});
		});
		const sync = createAppChordSync({
			getChords: () => chords,
			push,
			...scheduler,
		});

		sync.request();
		chords = ["meta+shift+p"];
		sync.request();
		rejectFirstPush?.(new Error("obsolete push failed"));
		await settlePromises();

		expect(pushed).toEqual([["meta+k"], ["meta+shift+p"]]);
		expect(scheduler.scheduled).toHaveLength(0);
	});

	it("caps the backoff and keeps retrying until sync succeeds", async () => {
		const scheduler = createManualScheduler();
		let failuresRemaining = 4;
		const push = mock(async () => {
			if (failuresRemaining > 0) {
				failuresRemaining -= 1;
				throw new Error("IPC unavailable");
			}
		});
		const sync = createAppChordSync({
			getChords: () => ["meta+k"],
			push,
			retryDelaysMs: [10, 20],
			...scheduler,
		});

		sync.request();
		await settlePromises();
		for (const expectedDelay of [10, 20, 20, 20]) {
			const pending = scheduler.scheduled.find(({ cancelled }) => !cancelled);
			expect(pending?.delayMs).toBe(expectedDelay);
			scheduler.runNext();
			await settlePromises();
		}

		expect(push).toHaveBeenCalledTimes(5);
		expect(
			scheduler.scheduled.filter(({ cancelled }) => !cancelled),
		).toHaveLength(0);
	});
});
