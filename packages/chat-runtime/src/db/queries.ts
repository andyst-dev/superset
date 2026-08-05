import { z } from "zod";
import type { SqliteDatabase, SqliteStatement } from "./db";
import {
	type ChatSessionRow,
	chatSessionRowSchema,
	type JournalRow,
	journalRowSchema,
} from "./schema";

const JOURNAL_COLUMNS = "epoch, seq, ts, event_json AS eventJson";

const SESSION_COLUMNS = `session_id AS sessionId, workspace_id AS workspaceId,
	harness, harness_session_id AS harnessSessionId, epoch, status, title,
	queued_count AS queuedCount, updated_at AS updatedAt`;

const maxSeqSchema = z.object({ value: z.number().int().nullable() });

export type JournalInsert = {
	sessionId: string;
	epoch: string;
	seq: number;
	ts: number;
	eventJson: string;
};

export type SessionInsert = {
	sessionId: string;
	workspaceId: string;
	harness: string;
	harnessSessionId: string | null;
	epoch: string;
	status: string;
	title: string | null;
	updatedAt: number;
};

export type ProjectionUpdate = {
	status: string;
	title: string | null;
	queuedCount: number;
	updatedAt: number;
};

export class ChatQueries {
	private readonly insertJournal: SqliteStatement;
	private readonly selectSinceStatement: SqliteStatement;
	private readonly selectNewestStatement: SqliteStatement;
	private readonly selectBeforeStatement: SqliteStatement;
	private readonly maxSeqStatement: SqliteStatement;
	private readonly insertSessionStatement: SqliteStatement;
	private readonly selectSessionStatement: SqliteStatement;
	private readonly listSessionsStatement: SqliteStatement;
	private readonly listByWorkspaceStatement: SqliteStatement;
	private readonly updateEpochStatement: SqliteStatement;
	private readonly updateProjectionStatement: SqliteStatement;
	private readonly updateHarnessSessionStatement: SqliteStatement;

	constructor(private readonly db: SqliteDatabase) {
		this.insertJournal = db.prepare(
			`INSERT INTO chat_journal (session_id, epoch, seq, ts, event_json)
			 VALUES (?, ?, ?, ?, ?)`,
		);
		this.selectSinceStatement = db.prepare(
			`SELECT ${JOURNAL_COLUMNS} FROM chat_journal
			 WHERE session_id = ? AND epoch = ? AND seq > ?
			 ORDER BY seq ASC`,
		);
		this.selectNewestStatement = db.prepare(
			`SELECT ${JOURNAL_COLUMNS} FROM chat_journal
			 WHERE session_id = ? AND epoch = ?
			 ORDER BY seq DESC LIMIT ?`,
		);
		this.selectBeforeStatement = db.prepare(
			`SELECT ${JOURNAL_COLUMNS} FROM chat_journal
			 WHERE session_id = ? AND epoch = ? AND seq < ?
			 ORDER BY seq DESC LIMIT ?`,
		);
		this.maxSeqStatement = db.prepare(
			`SELECT MAX(seq) AS value FROM chat_journal
			 WHERE session_id = ? AND epoch = ?`,
		);
		this.insertSessionStatement = db.prepare(
			`INSERT INTO chat_sessions_local (session_id, workspace_id, harness,
				harness_session_id, epoch, status, title, queued_count, updated_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
		);
		this.selectSessionStatement = db.prepare(
			`SELECT ${SESSION_COLUMNS} FROM chat_sessions_local WHERE session_id = ?`,
		);
		this.listSessionsStatement = db.prepare(
			`SELECT ${SESSION_COLUMNS} FROM chat_sessions_local
			 ORDER BY updated_at DESC`,
		);
		this.listByWorkspaceStatement = db.prepare(
			`SELECT ${SESSION_COLUMNS} FROM chat_sessions_local
			 WHERE workspace_id = ? ORDER BY updated_at DESC`,
		);
		this.updateEpochStatement = db.prepare(
			`UPDATE chat_sessions_local SET epoch = ?, updated_at = ?
			 WHERE session_id = ?`,
		);
		this.updateProjectionStatement = db.prepare(
			`UPDATE chat_sessions_local
			 SET status = ?, title = ?, queued_count = ?, updated_at = ?
			 WHERE session_id = ?`,
		);
		this.updateHarnessSessionStatement = db.prepare(
			`UPDATE chat_sessions_local SET harness_session_id = ?, updated_at = ?
			 WHERE session_id = ?`,
		);
	}

	transaction<T>(run: () => T): T {
		return this.db.transaction(run)();
	}

	appendJournalRow(row: JournalInsert): void {
		this.insertJournal.run(
			row.sessionId,
			row.epoch,
			row.seq,
			row.ts,
			row.eventJson,
		);
	}

	rowsSince(sessionId: string, epoch: string, afterSeq: number): JournalRow[] {
		return this.parseJournalRows(
			this.selectSinceStatement.all(sessionId, epoch, afterSeq),
		);
	}

	rowsBefore(
		sessionId: string,
		epoch: string,
		beforeSeq: number | null,
		limit: number,
	): JournalRow[] {
		const rows =
			beforeSeq === null
				? this.selectNewestStatement.all(sessionId, epoch, limit)
				: this.selectBeforeStatement.all(sessionId, epoch, beforeSeq, limit);
		return this.parseJournalRows(rows);
	}

	latestSeq(sessionId: string, epoch: string): number {
		const row = maxSeqSchema.parse(
			this.maxSeqStatement.get(sessionId, epoch) ?? { value: null },
		);
		return row.value ?? 0;
	}

	insertSession(row: SessionInsert): void {
		this.insertSessionStatement.run(
			row.sessionId,
			row.workspaceId,
			row.harness,
			row.harnessSessionId,
			row.epoch,
			row.status,
			row.title,
			row.updatedAt,
		);
	}

	session(sessionId: string): ChatSessionRow | null {
		const row = this.selectSessionStatement.get(sessionId);
		return row === undefined || row === null
			? null
			: chatSessionRowSchema.parse(row);
	}

	listSessions(): ChatSessionRow[] {
		return this.parseSessionRows(this.listSessionsStatement.all());
	}

	listSessionsByWorkspace(workspaceId: string): ChatSessionRow[] {
		return this.parseSessionRows(
			this.listByWorkspaceStatement.all(workspaceId),
		);
	}

	setEpoch(sessionId: string, epoch: string, updatedAt: number): void {
		this.updateEpochStatement.run(epoch, updatedAt, sessionId);
	}

	setProjection(sessionId: string, update: ProjectionUpdate): void {
		this.updateProjectionStatement.run(
			update.status,
			update.title,
			update.queuedCount,
			update.updatedAt,
			sessionId,
		);
	}

	setHarnessSessionId(
		sessionId: string,
		harnessSessionId: string | null,
		updatedAt: number,
	): void {
		this.updateHarnessSessionStatement.run(
			harnessSessionId,
			updatedAt,
			sessionId,
		);
	}

	private parseJournalRows(rows: unknown[]): JournalRow[] {
		return rows.map((row) => journalRowSchema.parse(row));
	}

	private parseSessionRows(rows: unknown[]): ChatSessionRow[] {
		return rows.map((row) => chatSessionRowSchema.parse(row));
	}
}
