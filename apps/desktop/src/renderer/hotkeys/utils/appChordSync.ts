export const APP_CHORD_SYNC_RETRY_DELAYS_MS = [
	250, 500, 1_000, 2_000, 4_000, 8_000, 16_000, 30_000,
] as const;

interface CreateAppChordSyncOptions {
	cancelRetry?: (retry: unknown) => void;
	getChords: () => string[];
	onError?: (error: unknown) => void;
	push: (chords: string[]) => Promise<unknown>;
	retryDelaysMs?: readonly number[];
	scheduleRetry?: (callback: () => void, delayMs: number) => unknown;
}

export interface AppChordSync {
	dispose: () => void;
	request: () => void;
}

/**
 * Pushes the latest renderer chord index to main with capped retry backoff.
 * A new request cancels any stale delayed retry and resets the budget. If state
 * changes while a mutation is in flight, the newest snapshot is sent as soon
 * as that mutation settles rather than waiting for its old backoff.
 */
export function createAppChordSync({
	cancelRetry = (retry) => clearTimeout(retry as ReturnType<typeof setTimeout>),
	getChords,
	onError,
	push,
	retryDelaysMs = APP_CHORD_SYNC_RETRY_DELAYS_MS,
	scheduleRetry = (callback, delayMs) => setTimeout(callback, delayMs),
}: CreateAppChordSyncOptions): AppChordSync {
	let disposed = false;
	let inFlight = false;
	let requestedRevision = 0;
	let retryIndex = 0;
	let retryTimer: unknown | null = null;

	const flush = async (): Promise<void> => {
		if (disposed || inFlight) return;

		inFlight = true;
		const revision = requestedRevision;
		try {
			await push(getChords());
			if (revision === requestedRevision) retryIndex = 0;
		} catch (error) {
			if (!disposed) {
				if (revision !== requestedRevision) {
					// A newer request is already queued. Give it a fresh budget and run
					// it immediately from finally instead of retrying this snapshot.
					retryIndex = 0;
					onError?.(error);
				} else {
					const delayMs =
						retryDelaysMs[
							Math.min(retryIndex, Math.max(0, retryDelaysMs.length - 1))
						];
					if (delayMs === undefined) {
						onError?.(error);
					} else {
						retryIndex = Math.min(retryIndex + 1, retryDelaysMs.length - 1);
						retryTimer = scheduleRetry(() => {
							retryTimer = null;
							void flush();
						}, delayMs);
						onError?.(error);
					}
				}
			}
		} finally {
			inFlight = false;
			if (!disposed && revision !== requestedRevision && retryTimer === null) {
				void flush();
			}
		}
	};

	return {
		dispose: () => {
			disposed = true;
			if (retryTimer !== null) cancelRetry(retryTimer);
			retryTimer = null;
		},
		request: () => {
			if (disposed) return;
			requestedRevision += 1;
			retryIndex = 0;
			if (retryTimer !== null) cancelRetry(retryTimer);
			retryTimer = null;
			void flush();
		},
	};
}
