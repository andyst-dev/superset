import { CommandDedupe } from "./commands/commandDedupe";
import type { ChatCommands } from "./commands/commands";
import { createCommands } from "./commands/commands";
import type { OpenDatabase, SqliteDatabase } from "./db/db";
import { openChatDb } from "./db/db";
import { ChatQueries } from "./db/queries";
import { ChatJournal } from "./journal/journal";
import { ChatSessionStore } from "./journal/sessions";
import type { HarnessRegistry } from "./sessions/registry";
import { LiveSessionRegistry } from "./sessions/registry";
import type {
	Schedule,
	Sink,
	SubscribeOptions,
	Subscription,
} from "./stream/subscriptions";
import { SubscriptionHub } from "./stream/subscriptions";

export { CommandDedupe } from "./commands/commandDedupe";
export type {
	ChatCommands,
	CommandsOptions,
	CreateSessionCommandInput,
	CreateSessionResult,
	GetSessionResult,
} from "./commands/commands";
export {
	createCommands,
	createSessionCommandSchema,
} from "./commands/commands";
export type {
	OpenDatabase,
	SqliteDatabase,
	SqliteStatement,
	SqlValue,
} from "./db/db";
export { openBetterSqlite3, openChatDb } from "./db/db";
export { ChatQueries } from "./db/queries";
export type { ChatSessionRow, JournalRow } from "./db/schema";
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
export type { LiveSessionOptions, PromptResult } from "./sessions/liveSession";
export { LiveSession } from "./sessions/liveSession";
export type {
	HarnessFactory,
	HarnessFactoryOptions,
	HarnessRegistry,
} from "./sessions/registry";
export { LiveSessionRegistry } from "./sessions/registry";
export type {
	Schedule,
	Sink,
	SubscribeOptions,
	Subscription,
	SubscriptionHubOptions,
} from "./stream/subscriptions";
export { SubscriptionHub } from "./stream/subscriptions";

export type ChatRuntimeOptions = {
	dataDir: string;
	openDatabase?: OpenDatabase;
	harnesses?: HarnessRegistry;
	schedule?: Schedule;
	bootstrapLimit?: number;
	dedupeCapacity?: number;
};

export type ChatRuntime = {
	journal: ChatJournal;
	sessions: ChatSessionStore;
	queries: ChatQueries;
	db: SqliteDatabase;
	live: LiveSessionRegistry;
	subscriptions: SubscriptionHub;
	commands: ChatCommands;
	subscribe(
		sessionId: string,
		options: SubscribeOptions,
		sink: Sink,
	): Subscription;
	dispose(): Promise<void>;
};

export function createChatRuntime(options: ChatRuntimeOptions): ChatRuntime {
	const db = openChatDb(options.dataDir, options.openDatabase);
	const queries = new ChatQueries(db);
	const journal = new ChatJournal(queries);
	const sessions = new ChatSessionStore(queries);
	const subscriptions = new SubscriptionHub(queries, {
		schedule: options.schedule,
		bootstrapLimit: options.bootstrapLimit,
	});
	const live = new LiveSessionRegistry({
		journal,
		publish: (envelope) => subscriptions.publish(envelope),
		harnesses: options.harnesses ?? new Map(),
	});
	const commands = createCommands({
		journal,
		queries,
		sessions,
		live,
		dedupe: new CommandDedupe(options.dedupeCapacity),
	});

	return {
		journal,
		sessions,
		queries,
		db,
		live,
		subscriptions,
		commands,
		subscribe: (sessionId, subscribeOptions, sink) =>
			subscriptions.subscribe(sessionId, subscribeOptions, sink),
		dispose: async () => {
			await live.disposeAll();
			subscriptions.dispose();
			db.close();
		},
	};
}
