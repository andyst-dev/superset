import { beforeEach, describe, expect, it, mock } from "bun:test";
import { NextRequest } from "next/server";

mock.module("next/headers", () => ({
	headers: () => new Headers({ "content-type": "application/json" }),
}));

// Proxy only needs auth.api.getSession; force it to return null so most
// requests below are treated as unauthenticated (the failing CLI / remote-host
// case from #7072). Valid-session cases override it per-test.
const getSession = mock(async () => null);
mock.module("@superset/auth/server", () => ({
	auth: { api: { getSession } },
}));

const { default: proxy } = await import("./proxy");

describe("proxy: unauthenticated API requests return JSON 401, never a sign-in redirect", () => {
	beforeEach(() => {
		getSession.mockClear();
	});

	it("answers /api/trpc/* with a JSON 401 instead of a 307 redirect (#7072)", async () => {
		const res = await proxy(
			new NextRequest("https://app.superset.sh/api/trpc/user.me", {
				headers: { authorization: "Bearer stale-token" },
			}),
		);

		expect(res.status).toBe(401);
		expect(res.headers.get("content-type")).toContain("application/json");
		const body = await res.json();
		expect(body).toEqual({ error: "Unauthorized" });
	});

	it("answers bare /trpc/* with a JSON 401 too", async () => {
		const res = await proxy(
			new NextRequest("https://app.superset.sh/trpc/user.me?batch=1"),
		);

		expect(res.status).toBe(401);
	});

	it("still redirects unauthenticated page routes to /sign-in", async () => {
		const res = await proxy(
			new NextRequest("https://app.superset.sh/dashboard"),
		);

		// Not an API route: the historical page-redirect behaviour is preserved.
		expect(res.status).toBe(307);
		expect(res.headers.get("location")).toContain("/sign-in");
	});

	it("does not treat /apiary or /trpcfoo as API routes (slash-delimited child only)", async () => {
		// P2 (cubic) + coderabbit: only exact /api|/trpc or /api/|/trpc/ match.
		const apiary = await proxy(
			new NextRequest("https://app.superset.sh/apiary"),
		);
		const trpcfoo = await proxy(
			new NextRequest("https://app.superset.sh/trpcfoo"),
		);

		// These are page routes — keep the historical /sign-in redirect, no JSON 401.
		expect(apiary.status).toBe(307);
		expect(apiary.headers.get("location")).toContain("/sign-in");
		expect(trpcfoo.status).toBe(307);
		expect(trpcfoo.headers.get("location")).toContain("/sign-in");
	});

	it("leaves public API routes (e.g. /api/auth/desktop) reachable unauthenticated", async () => {
		// P1 (cubic): /api/auth/desktop is the desktop OAuth start and is public;
		// it must not fall into the JSON-401 gate.
		const res = await proxy(
			new NextRequest("https://app.superset.sh/api/auth/desktop"),
		);

		expect(res.status).not.toBe(401);
		expect(res.status).not.toBe(307);
	});

	it("passes a valid authenticated request through without 401 or redirect", async () => {
		// coderabbit: a valid Bearer session must not be rejected by the gate.
		getSession.mockReturnValueOnce({
			user: { email: "dev@app.superset.sh", deletionRequestedAt: null },
		});
		const res = await proxy(
			new NextRequest("https://app.superset.sh/api/trpc/user.me", {
				headers: { authorization: "Bearer valid-token" },
			}),
		);

		expect(res.status).not.toBe(401);
		expect(res.status).not.toBe(307);
		expect(res.status).toBe(200); // NextResponse.next()
	});
});
