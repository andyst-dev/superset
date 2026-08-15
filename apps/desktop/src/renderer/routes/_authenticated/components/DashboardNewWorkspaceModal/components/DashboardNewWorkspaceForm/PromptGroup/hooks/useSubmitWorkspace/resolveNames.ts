import { sanitizeUserBranchName } from "@superset/shared/workspace-launch";
import type { DashboardNewWorkspaceDraft } from "../../../../../DashboardNewWorkspaceDraftContext";

interface ResolvedNames {
	/** User-typed (sanitized) branch, or null when not typed. */
	branchName: string | null;
	/** User-typed workspace name, or null when not typed. */
	workspaceName: string | null;
}

/**
 * Returns the user-typed names; null otherwise. An explicitly seeded or
 * edited branch wins; otherwise a manually entered workspace name is also
 * sent as the branch candidate so the host does not truncate or reinterpret
 * it through its generated-name path.
 */
export function resolveNames(draft: DashboardNewWorkspaceDraft): ResolvedNames {
	const explicitBranchName =
		draft.branchNameEdited && draft.branchName.trim()
			? sanitizeUserBranchName(draft.branchName.trim())
			: null;

	const workspaceName =
		draft.workspaceNameEdited && draft.workspaceName.trim()
			? draft.workspaceName.trim()
			: null;
	const branchName =
		explicitBranchName ??
		(workspaceName ? sanitizeUserBranchName(workspaceName) : null);

	return { branchName, workspaceName };
}
