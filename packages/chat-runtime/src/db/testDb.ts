import { Database as BunDatabase } from "bun:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type ChatRuntime, createChatRuntime } from "../index";
import type { SqliteDatabase } from "./db";

export function openBunSqlite(filePath: string): SqliteDatabase {
	return new BunDatabase(filePath, { create: true, readwrite: true });
}

export function createTestRuntime(): ChatRuntime {
	const dataDir = mkdtempSync(join(tmpdir(), "chat-runtime-"));
	return createChatRuntime({ dataDir, openDatabase: openBunSqlite });
}
