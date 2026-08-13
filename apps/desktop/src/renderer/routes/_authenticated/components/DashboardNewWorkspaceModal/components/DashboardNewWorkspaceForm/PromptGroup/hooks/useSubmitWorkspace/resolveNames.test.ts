import { describe, expect, test } from "bun:test";
import type { DashboardNewWorkspaceDraft } from "../../../../../DashboardNewWorkspaceDraftContext";
import { resolveNames } from "./resolveNames";

function draft(
	overrides: Partial<DashboardNewWorkspaceDraft> = {},
): DashboardNewWorkspaceDraft {
	return {
		selectedProjectId: null,
		isSession: false,
		hostId: null,
		prompt: "",
		baseBranch: null,
		baseBranchSource: null,
		workspaceName: "",
		workspaceNameEdited: false,
		branchName: "",
		branchNameEdited: false,
		branchNameFromProvider: false,
		linkedIssues: [],
		linkedPR: null,
		selectedAgentId: null,
		attachments: [],
		...overrides,
	};
}

describe("resolveNames", () => {
	test("returns null name when nothing was typed", () => {
		const names = resolveNames(draft());
		expect(names.workspaceName).toBeNull();
		expect(names.branchName).toBeNull();
	});

	test("returns a user-typed workspace name (not an AI hint)", () => {
		const names = resolveNames(
			draft({ workspaceName: "my-remix", workspaceNameEdited: true }),
		);
		expect(names.workspaceName).toBe("my-remix");
	});

	test("ignores a workspace name that was not edited (e.g. AI-suggested)", () => {
		const names = resolveNames(draft({ workspaceName: "suggested" }));
		expect(names.workspaceName).toBeNull();
	});

	test("returns a sanitized typed branch name (preserves spaces)", () => {
		const names = resolveNames(
			draft({
				branchName: "Fix UI bug",
				branchNameEdited: true,
			}),
		);
		// sanitizeUserBranchName only strips git-forbidden chars; it preserves
		// case and spaces (the UI slugifies spaces on the way in).
		expect(names.branchName).toBe("Fix UI bug");
		// A typed name seeds a branch slug; the workspace name comes straight through.
		expect(names.workspaceName).toBeNull();
	});

	test("typed name and typed branch both resolve", () => {
		const names = resolveNames(
			draft({
				workspaceName: "My Workspace",
				workspaceNameEdited: true,
				branchName: "feature/new-pane",
				branchNameEdited: true,
			}),
		);
		expect(names.workspaceName).toBe("My Workspace");
		expect(names.branchName).toBe("feature/new-pane");
	});
});
