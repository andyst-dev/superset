import { z } from "zod";

export const CHAT_DB_FILENAME = "chat.db";

export const BOOTSTRAP_STATEMENTS = [
	`CREATE TABLE IF NOT EXISTS chat_journal (
		session_id TEXT NOT NULL,
		epoch TEXT NOT NULL,
		seq INTEGER NOT NULL,
		ts INTEGER NOT NULL,
		event_json TEXT NOT NULL,
		PRIMARY KEY (session_id, epoch, seq)
	)`,
	`CREATE TABLE IF NOT EXISTS chat_sessions_local (
		session_id TEXT PRIMARY KEY,
		workspace_id TEXT NOT NULL,
		harness TEXT NOT NULL,
		harness_session_id TEXT,
		epoch TEXT NOT NULL,
		status TEXT NOT NULL,
		title TEXT,
		queued_count INTEGER NOT NULL DEFAULT 0,
		updated_at INTEGER NOT NULL
	)`,
	`CREATE INDEX IF NOT EXISTS chat_sessions_local_workspace_id_idx
		ON chat_sessions_local (workspace_id)`,
] as const;

export const journalRowSchema = z.object({
	epoch: z.string().min(1),
	seq: z.number().int().nonnegative(),
	ts: z.number().int(),
	eventJson: z.string(),
});
export type JournalRow = z.infer<typeof journalRowSchema>;

export const chatSessionRowSchema = z.object({
	sessionId: z.string().min(1),
	workspaceId: z.string(),
	harness: z.string(),
	harnessSessionId: z.string().nullable(),
	epoch: z.string().min(1),
	status: z.string(),
	title: z.string().nullable(),
	queuedCount: z.number().int().nonnegative(),
	updatedAt: z.number().int(),
});
export type ChatSessionRow = z.infer<typeof chatSessionRowSchema>;
