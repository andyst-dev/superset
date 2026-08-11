import type { ChatLaunchConfig } from "shared/tabs-types";

export interface ChatPaneInterfaceProps {
	sessionId: string | null;
	initialLaunchConfig: ChatLaunchConfig | null;
	/**
	 * Called after the ChatPaneInterface successfully auto-submits the
	 * initial launch config so the owning pane can clear its persisted
	 * launchConfig and not re-trigger on re-render.
	 */
	onConsumeLaunchConfig?: () => void;
	workspaceId: string;
	organizationId: string | null;
	cwd: string;
	isFocused: boolean;
	/**
	 * True while this chat pane is the focused/active tab. Gates background
	 * chat polling so idle/background panes stop refetching the full
	 * transcript on a timer (#6339).
	 */
	isActive?: boolean;
	getOrCreateSession: () => Promise<string>;
	onResetSession: () => Promise<void>;
	onUserMessageSubmitted?: (message: string) => void;
}
