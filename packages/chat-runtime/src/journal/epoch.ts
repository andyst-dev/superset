import { randomUUID } from "node:crypto";
import type { ChatQueries } from "../db/queries";

export type ChatSessionInit = {
	sessionId: string;
	workspaceId: string;
	harness: string;
	harnessSessionId?: string | null;
	status?: string;
	title?: string | null;
};

export type OpenedEpoch = {
	epoch: string;
	minted: boolean;
};

export function mintEpoch(): string {
	return randomUUID();
}

export function openEpoch(
	queries: ChatQueries,
	init: ChatSessionInit,
): OpenedEpoch {
	const row = queries.session(init.sessionId);

	if (!row) {
		const epoch = mintEpoch();
		queries.insertSession({
			sessionId: init.sessionId,
			workspaceId: init.workspaceId,
			harness: init.harness,
			harnessSessionId: init.harnessSessionId ?? null,
			epoch,
			status: init.status ?? "starting",
			title: init.title ?? null,
			updatedAt: Date.now(),
		});
		return { epoch, minted: true };
	}

	if (queries.latestSeq(init.sessionId, row.epoch) > 0) {
		return { epoch: row.epoch, minted: false };
	}

	const epoch = mintEpoch();
	queries.setEpoch(init.sessionId, epoch, Date.now());
	return { epoch, minted: true };
}
