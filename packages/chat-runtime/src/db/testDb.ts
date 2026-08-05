import { Database as BunDatabase } from "bun:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type ChatRuntime,
	type ChatRuntimeOptions,
	createChatRuntime,
} from "../index";
import type { SqliteDatabase } from "./db";

export function openBunSqlite(filePath: string): SqliteDatabase {
	return new BunDatabase(filePath, { create: true, readwrite: true });
}

export function createTestRuntime(
	options: Omit<ChatRuntimeOptions, "dataDir" | "openDatabase"> = {},
): ChatRuntime {
	const dataDir = mkdtempSync(join(tmpdir(), "chat-runtime-"));
	return createChatRuntime({
		dataDir,
		openDatabase: openBunSqlite,
		...options,
	});
}
