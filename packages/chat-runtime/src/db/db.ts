import { mkdirSync } from "node:fs";
import { join } from "node:path";
import Database from "better-sqlite3";
import { BOOTSTRAP_STATEMENTS, CHAT_DB_FILENAME } from "./schema";

export type SqlValue = string | number | null;

export interface SqliteStatement {
	run(...params: SqlValue[]): unknown;
	get(...params: SqlValue[]): unknown;
	all(...params: SqlValue[]): unknown[];
}

export interface SqliteDatabase {
	exec(sql: string): unknown;
	prepare(sql: string): SqliteStatement;
	transaction<T>(fn: () => T): () => T;
	close(): void;
}

export type OpenDatabase = (filePath: string) => SqliteDatabase;

export function openBetterSqlite3(filePath: string): SqliteDatabase {
	return new Database(filePath);
}

export function openChatDb(
	dataDir: string,
	openDatabase: OpenDatabase = openBetterSqlite3,
): SqliteDatabase {
	mkdirSync(dataDir, { recursive: true });
	const db = openDatabase(join(dataDir, CHAT_DB_FILENAME));
	db.exec("PRAGMA journal_mode = WAL");
	db.exec("PRAGMA busy_timeout = 5000");
	db.exec("PRAGMA foreign_keys = ON");
	for (const statement of BOOTSTRAP_STATEMENTS) db.exec(statement);
	return db;
}
