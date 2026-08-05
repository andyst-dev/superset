import type {
	Cursor,
	DurableEnvelope,
	RESET_REASONS,
} from "@superset/chat/protocol";
import { envelopeSchema, isDurableEnvelope } from "@superset/chat/protocol";
import type { ChatQueries } from "../db/queries";
import type { JournalRow } from "../db/schema";

export type ChatResetReason = (typeof RESET_REASONS)[number];

export type ReplayResult =
	| { ok: true; envelopes: DurableEnvelope[] }
	| { ok: false; reset: ChatResetReason };

export type PageResult =
	| { ok: true; envelopes: DurableEnvelope[]; nextBefore: Cursor | null }
	| { ok: false; reset: ChatResetReason };

export function parseJournalRow(
	sessionId: string,
	row: JournalRow,
): DurableEnvelope {
	const envelope = envelopeSchema.parse({
		v: 1,
		sessionId,
		cursor: { epoch: row.epoch, seq: row.seq },
		ts: row.ts,
		event: JSON.parse(row.eventJson),
	});
	if (!isDurableEnvelope(envelope)) {
		throw new Error(`chat journal row ${sessionId}:${row.seq} is not durable`);
	}
	return envelope;
}

export function readSince(
	queries: ChatQueries,
	sessionId: string,
	cursor: Cursor,
): ReplayResult {
	const session = queries.session(sessionId);
	if (!session) return { ok: false, reset: "session_not_found" };
	if (session.epoch !== cursor.epoch) {
		return { ok: false, reset: "epoch_changed" };
	}

	const last = queries.latestSeq(sessionId, session.epoch);
	if (last === 0 && cursor.seq > 0) {
		return { ok: false, reset: "journal_missing" };
	}
	if (cursor.seq > last) return { ok: false, reset: "invalid_cursor" };

	const rows = queries.rowsSince(sessionId, session.epoch, cursor.seq);
	return {
		ok: true,
		envelopes: rows.map((row) => parseJournalRow(sessionId, row)),
	};
}

export function readPage(
	queries: ChatQueries,
	sessionId: string,
	options: { before?: Cursor; limit: number },
): PageResult {
	const session = queries.session(sessionId);
	if (!session) return { ok: false, reset: "session_not_found" };
	if (options.before && session.epoch !== options.before.epoch) {
		return { ok: false, reset: "epoch_changed" };
	}
	if (options.limit <= 0) return { ok: true, envelopes: [], nextBefore: null };

	const rows = queries.rowsBefore(
		sessionId,
		session.epoch,
		options.before?.seq ?? null,
		options.limit + 1,
	);
	const page = rows.slice(0, options.limit).reverse();
	const oldest = page[0];
	const nextBefore =
		rows.length > options.limit && oldest
			? { epoch: session.epoch, seq: oldest.seq }
			: null;

	return {
		ok: true,
		envelopes: page.map((row) => parseJournalRow(sessionId, row)),
		nextBefore,
	};
}
