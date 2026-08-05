import type { OpenDatabase, SqliteDatabase } from "./db/db";
import { openChatDb } from "./db/db";
import { ChatQueries } from "./db/queries";
import { ChatJournal } from "./journal/journal";
import { ChatSessionStore } from "./journal/sessions";

export type {
	OpenDatabase,
	SqliteDatabase,
	SqliteStatement,
	SqlValue,
} from "./db/db";
export { openBetterSqlite3, openChatDb } from "./db/db";
export { ChatQueries } from "./db/queries";
export type {
	ChatSessionRow,
	JournalRow,
} from "./db/schema";
export { CHAT_DB_FILENAME } from "./db/schema";
export type {
	FakeHarnessScript,
	ScriptedEvent,
} from "./harness/fake/fakeHarness";
export { FakeHarness } from "./harness/fake/fakeHarness";
export type {
	AdapterEvent,
	HarnessAdapter,
	HarnessStartOptions,
} from "./harness/types";
export type { ChatSessionInit, OpenedEpoch } from "./journal/epoch";
export { mintEpoch, openEpoch } from "./journal/epoch";
export type { OpenedSession } from "./journal/journal";
export { ChatJournal } from "./journal/journal";
export type {
	ChatResetReason,
	PageResult,
	ReplayResult,
} from "./journal/replay";
export { readPage, readSince } from "./journal/replay";
export { ChatSessionStore } from "./journal/sessions";

export type ChatRuntimeOptions = {
	dataDir: string;
	openDatabase?: OpenDatabase;
};

export type ChatRuntime = {
	journal: ChatJournal;
	sessions: ChatSessionStore;
	queries: ChatQueries;
	db: SqliteDatabase;
	dispose(): void;
};

export function createChatRuntime(options: ChatRuntimeOptions): ChatRuntime {
	const db = openChatDb(options.dataDir, options.openDatabase);
	const queries = new ChatQueries(db);
	return {
		journal: new ChatJournal(queries),
		sessions: new ChatSessionStore(queries),
		queries,
		db,
		dispose: () => db.close(),
	};
}
