import type { ChatQueries } from "../db/queries";
import type { ChatSessionRow } from "../db/schema";

export class ChatSessionStore {
	constructor(private readonly queries: ChatQueries) {}

	get(sessionId: string): ChatSessionRow | null {
		return this.queries.session(sessionId);
	}

	list(): ChatSessionRow[] {
		return this.queries.listSessions();
	}

	listByWorkspace(workspaceId: string): ChatSessionRow[] {
		return this.queries.listSessionsByWorkspace(workspaceId);
	}

	setHarnessSessionId(
		sessionId: string,
		harnessSessionId: string | null,
	): void {
		this.queries.setHarnessSessionId(sessionId, harnessSessionId, Date.now());
	}
}
