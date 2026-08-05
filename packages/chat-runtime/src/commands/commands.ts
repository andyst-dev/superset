import { randomUUID } from "node:crypto";
import type {
	CancelTurnInput,
	Cursor,
	GetItemsInput,
	GetSessionInput,
	ListSessionsInput,
	PromptInput,
	RespondToApprovalInput,
	SetModeInput,
} from "@superset/chat/protocol";
import {
	cancelTurnInputSchema,
	createSessionInputSchema,
	getItemsInputSchema,
	getSessionInputSchema,
	listSessionsInputSchema,
	promptInputSchema,
	respondToApprovalInputSchema,
	setModeInputSchema,
} from "@superset/chat/protocol";
import { z } from "zod";
import type { ChatQueries } from "../db/queries";
import type { ChatSessionRow } from "../db/schema";
import type { ChatJournal } from "../journal/journal";
import type { PageResult } from "../journal/replay";
import { readPage } from "../journal/replay";
import type { ChatSessionStore } from "../journal/sessions";
import type { PromptResult } from "../sessions/liveSession";
import type { LiveSessionRegistry } from "../sessions/registry";

export const createSessionCommandSchema = createSessionInputSchema.extend({
	cwd: z.string().min(1),
});
export type CreateSessionCommandInput = z.input<
	typeof createSessionCommandSchema
>;

export type CreateSessionResult = {
	sessionId: string;
	epoch: string;
};

export type GetSessionResult = {
	session: ChatSessionRow | null;
	cursor: Cursor | null;
};

export type ChatCommands = {
	createSession(input: CreateSessionCommandInput): CreateSessionResult;
	prompt(input: PromptInput): PromptResult;
	cancelTurn(input: CancelTurnInput): void;
	respondToApproval(input: RespondToApprovalInput): void;
	setMode(input: SetModeInput): void;
	getSession(input: GetSessionInput): GetSessionResult;
	listSessions(
		input: z.input<typeof listSessionsInputSchema>,
	): ChatSessionRow[];
	getItems(input: z.input<typeof getItemsInputSchema>): PageResult;
};

export type CommandsOptions = {
	journal: ChatJournal;
	queries: ChatQueries;
	sessions: ChatSessionStore;
	live: LiveSessionRegistry;
	dedupe: { run<T>(commandId: string, execute: () => T): T };
	mintSessionId?: () => string;
};

export function createCommands(options: CommandsOptions): ChatCommands {
	const mintSessionId = options.mintSessionId ?? randomUUID;

	const listSessions = (
		input: z.input<typeof listSessionsInputSchema>,
	): ChatSessionRow[] => {
		const parsed: ListSessionsInput = listSessionsInputSchema.parse(input);
		const rows = parsed.workspaceId
			? options.sessions.listByWorkspace(parsed.workspaceId)
			: options.sessions.list();
		return rows.slice(0, parsed.limit);
	};

	return {
		createSession(input) {
			const parsed = createSessionCommandSchema.parse(input);
			return options.dedupe.run(parsed.commandId, () => {
				const sessionId = mintSessionId();
				const opened = options.journal.open({
					sessionId,
					workspaceId: parsed.workspaceId,
					harness: parsed.harness,
				});
				options.live.create({
					sessionId,
					workspaceId: parsed.workspaceId,
					harness: parsed.harness,
					cwd: parsed.cwd,
					modeId: parsed.modeId,
					modelId: parsed.modelId,
				});
				return { sessionId, epoch: opened.epoch };
			});
		},

		prompt(input) {
			const parsed: PromptInput = promptInputSchema.parse(input);
			return options.dedupe.run(parsed.commandId, () =>
				options.live
					.require(parsed.sessionId)
					.prompt(parsed.content, parsed.clientId),
			);
		},

		cancelTurn(input) {
			const parsed: CancelTurnInput = cancelTurnInputSchema.parse(input);
			options.dedupe.run(parsed.commandId, () => {
				options.live.require(parsed.sessionId).cancelTurn(parsed.turnId);
			});
		},

		respondToApproval(input) {
			const parsed: RespondToApprovalInput =
				respondToApprovalInputSchema.parse(input);
			options.dedupe.run(parsed.commandId, () => {
				options.live
					.require(parsed.sessionId)
					.respondToApproval(parsed.approvalId, parsed.decision);
			});
		},

		setMode(input) {
			const parsed: SetModeInput = setModeInputSchema.parse(input);
			options.dedupe.run(parsed.commandId, () => {
				options.live.require(parsed.sessionId).setMode(parsed.modeId);
			});
		},

		getSession(input) {
			const parsed: GetSessionInput = getSessionInputSchema.parse(input);
			const session = options.sessions.get(parsed.sessionId);
			return {
				session,
				cursor: session
					? {
							epoch: session.epoch,
							seq: options.journal.cursor(parsed.sessionId).seq,
						}
					: null,
			};
		},

		listSessions,

		getItems(input) {
			const parsed: GetItemsInput = getItemsInputSchema.parse(input);
			return readPage(options.queries, parsed.sessionId, {
				before: parsed.before,
				limit: parsed.limit,
			});
		},
	};
}
