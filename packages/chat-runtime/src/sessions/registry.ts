import type { Envelope } from "@superset/chat/protocol";
import type { HarnessAdapter } from "../harness/types";
import type { ChatJournal } from "../journal/journal";
import { LiveSession } from "./liveSession";

export type HarnessFactoryOptions = {
	sessionId: string;
	workspaceId: string;
	harness: string;
	cwd: string;
	modeId?: string;
	modelId?: string;
	resume?: { harnessSessionId: string };
};

export type HarnessFactory = (options: HarnessFactoryOptions) => HarnessAdapter;

export type HarnessRegistry = Map<string, HarnessFactory>;

export type LiveSessionRegistryOptions = {
	journal: ChatJournal;
	publish: (envelope: Envelope) => void;
	harnesses: HarnessRegistry;
	mintId?: () => string;
	now?: () => number;
};

export class LiveSessionRegistry {
	private readonly live = new Map<string, LiveSession>();

	constructor(private readonly options: LiveSessionRegistryOptions) {}

	create(options: HarnessFactoryOptions): LiveSession {
		const factory = this.options.harnesses.get(options.harness);
		if (!factory) throw new Error(`unknown harness ${options.harness}`);

		const session = new LiveSession({
			sessionId: options.sessionId,
			workspaceId: options.workspaceId,
			harness: options.harness,
			journal: this.options.journal,
			publish: this.options.publish,
			adapter: factory(options),
			mintId: this.options.mintId,
			now: this.options.now,
		});
		this.live.set(options.sessionId, session);
		session.start({
			cwd: options.cwd,
			modeId: options.modeId,
			modelId: options.modelId,
			resume: options.resume,
		});
		return session;
	}

	get(sessionId: string): LiveSession | null {
		return this.live.get(sessionId) ?? null;
	}

	require(sessionId: string): LiveSession {
		const session = this.live.get(sessionId);
		if (!session) throw new Error(`chat session ${sessionId} is not running`);
		return session;
	}

	async dispose(sessionId: string): Promise<void> {
		const session = this.live.get(sessionId);
		if (!session) return;
		this.live.delete(sessionId);
		await session.dispose();
	}

	async disposeAll(): Promise<void> {
		const sessions = [...this.live.values()];
		this.live.clear();
		await Promise.all(sessions.map((session) => session.dispose()));
	}
}
