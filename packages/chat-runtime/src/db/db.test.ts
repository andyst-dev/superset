import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { agentMessage } from "../fixtures";
import { createChatRuntime } from "../index";
import { readSince } from "../journal/replay";
import { CHAT_DB_FILENAME } from "./schema";
import { openBunSqlite } from "./testDb";

const SESSION = "session-1";

function init() {
	return { sessionId: SESSION, workspaceId: "workspace-1", harness: "fake" };
}

describe("chat.db bootstrap", () => {
	test("creates its own db file under dataDir and survives reopen", () => {
		const dataDir = mkdtempSync(join(tmpdir(), "chat-runtime-"));

		const first = createChatRuntime({ dataDir, openDatabase: openBunSqlite });
		const opened = first.journal.open(init());
		first.journal.append(SESSION, {
			type: "item",
			item: agentMessage("a", "hello"),
			turnId: "turn-1",
		});
		first.dispose();

		expect(existsSync(join(dataDir, CHAT_DB_FILENAME))).toBe(true);

		const second = createChatRuntime({ dataDir, openDatabase: openBunSqlite });
		expect(second.journal.open(init())).toEqual({
			sessionId: SESSION,
			epoch: opened.epoch,
			lastSeq: 1,
			queuedCount: 0,
		});
		const replay = readSince(second.queries, SESSION, {
			epoch: opened.epoch,
			seq: 0,
		});
		expect(replay.ok).toBe(true);
		if (!replay.ok) return;
		expect(replay.envelopes).toHaveLength(1);
		second.dispose();
	});

	test("creates dataDir when it does not exist", () => {
		const dataDir = join(
			mkdtempSync(join(tmpdir(), "chat-runtime-")),
			"nested",
		);
		const runtime = createChatRuntime({ dataDir, openDatabase: openBunSqlite });
		expect(existsSync(join(dataDir, CHAT_DB_FILENAME))).toBe(true);
		runtime.dispose();
	});
});
