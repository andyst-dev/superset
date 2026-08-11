import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

// The minted-JWT cache is module-level and shared across tests in this file;
// reset it by importing fresh in each test is not enough (Bun caches modules),
// so we drive assertions via fetch call counts instead of the cache internals.
mock.module("./config", () => ({
	getApiUrl: () => "https://api.example.com",
}));

const { getHostJwt } = await import("./host-jwt");

const realFetch = globalThis.fetch;
let fetchCalls: Array<{ url: string; init?: RequestInit }> = [];

beforeEach(() => {
	fetchCalls = [];
});

afterEach(() => {
	globalThis.fetch = realFetch;
});

function stubFetch(ok: boolean, body: unknown = { token: "minted-jwt" }): void {
	globalThis.fetch = (async (url: string, init?: RequestInit) => {
		fetchCalls.push({ url, init });
		return {
			ok,
			status: ok ? 200 : 401,
			json: async () => body,
		} as Response;
	}) as typeof fetch;
}

function apiKeyHeaderOf(url: string): string | undefined {
	const call = fetchCalls.find((c) => c.url === url);
	const headers = call?.init?.headers as Record<string, string> | undefined;
	return headers?.["x-api-key"];
}

describe("getHostJwt", () => {
	it("passes an OAuth JWT through without an exchange", async () => {
		const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signature";
		const result = await getHostJwt(jwt);
		expect(result).toBe(jwt);
		expect(fetchCalls).toHaveLength(0);
	});

	it("exchanges an sk_live_ API key for a JWT via x-api-key", async () => {
		stubFetch(true);
		const result = await getHostJwt("sk_live_abc123");
		expect(result).toBe("minted-jwt");
		expect(fetchCalls).toHaveLength(1);
		const url = fetchCalls[0]!.url;
		expect(url).toBe("https://api.example.com/api/auth/token");
		expect(apiKeyHeaderOf(url)).toBe("sk_live_abc123");
	});

	it("exchanges an sk_test_ API key the same way", async () => {
		stubFetch(true);
		const result = await getHostJwt("sk_test_xyz");
		expect(result).toBe("minted-jwt");
		expect(fetchCalls).toHaveLength(1);
		const url = fetchCalls[0]!.url;
		expect(url).toContain("/api/auth/token");
		expect(apiKeyHeaderOf(url)).toBe("sk_test_xyz");
	});

	it("caches the minted JWT per key and reuses it", async () => {
		stubFetch(true);
		await getHostJwt("sk_live_cache1");
		await getHostJwt("sk_live_cache1");
		expect(fetchCalls).toHaveLength(1);
	});

	it("does not share a minted JWT across different keys", async () => {
		stubFetch(true);
		await getHostJwt("sk_live_keyA");
		await getHostJwt("sk_live_keyB");
		expect(fetchCalls).toHaveLength(2);
	});

	it("throws when the exchange fails", async () => {
		stubFetch(false);
		await expect(getHostJwt("sk_live_fail")).rejects.toThrow(
			/Failed to authenticate API key/,
		);
	});

	it("throws without caching when a 2xx response has no token", async () => {
		stubFetch(true, {});
		await expect(getHostJwt("sk_live_notoken")).rejects.toThrow(
			/without a token value/,
		);
		// The bad response must not be cached: a retry hits the endpoint again.
		stubFetch(true, { token: "minted-jwt" });
		const result = await getHostJwt("sk_live_notoken");
		expect(result).toBe("minted-jwt");
		expect(fetchCalls).toHaveLength(2);
	});

	it("throws when the token field is not a string", async () => {
		stubFetch(true, { token: 12345 });
		await expect(getHostJwt("sk_live_badtoken")).rejects.toThrow(
			/without a token value/,
		);
	});

	it("passes an abort signal so a stalled fetch cannot hang", async () => {
		stubFetch(true);
		await getHostJwt("sk_live_signal");
		const init = fetchCalls[0]!.init;
		expect(init?.signal).toBeDefined();
	});
});
