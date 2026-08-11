import { CLIError } from "@superset/cli-framework";
import type { AppRouter as HostServiceRouter } from "@superset/host-service/trpc";
import { getHostId } from "@superset/shared/host-info";
import { buildHostRoutingKey } from "@superset/shared/host-routing";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import SuperJSON from "superjson";
import type { ApiClient } from "../api-client";
import { isProcessAlive, readManifest } from "../host/manifest";
import { getRelayUrl } from "../host/relay-url";
import { getHostJwt } from "../host-jwt";

export type HostServiceClient = ReturnType<
	typeof createTRPCClient<HostServiceRouter>
>;

export type ResolvedHostTarget =
	| {
			kind: "local";
			hostId: string;
			client: HostServiceClient;
	  }
	| {
			kind: "remote";
			hostId: string;
			client: HostServiceClient;
	  };

export interface ResolveHostTargetOptions {
	/**
	 * Always a concrete host id — callers decide explicitly (requireHostTarget,
	 * a resource's hostId, or getHostId() when local is the documented
	 * behavior). There is deliberately no implicit local fallback.
	 */
	requestedHostId: string;
	organizationId: string;
	userJwt: string;
	/** Resolves the relay a remote host is on; unused for local targets. */
	api: ApiClient;
}

export async function resolveHostTarget(
	options: ResolveHostTargetOptions,
): Promise<ResolvedHostTarget> {
	const localHostId = getHostId();
	const targetHostId = options.requestedHostId;

	if (targetHostId === localHostId) {
		const manifest = readManifest(options.organizationId);
		if (!manifest) {
			throw new CLIError(
				"Host service for this machine isn't running",
				"Run: superset start",
			);
		}
		if (!isProcessAlive(manifest.pid)) {
			throw new CLIError(
				"Host service manifest is stale (recorded PID is dead)",
				"Run: superset start",
			);
		}
		return {
			kind: "local",
			hostId: localHostId,
			client: createTRPCClient<HostServiceRouter>({
				links: [
					httpBatchLink({
						url: `${manifest.endpoint}/trpc`,
						transformer: SuperJSON,
						headers: {
							Authorization: `Bearer ${manifest.authToken}`,
							"x-superset-client-machine-id": localHostId,
						},
					}),
				],
			}),
		};
	}

	const routingKey = buildHostRoutingKey(options.organizationId, targetHostId);
	const relayUrl = await getRelayUrl(options.api);
	return {
		kind: "remote",
		hostId: targetHostId,
		client: createTRPCClient<HostServiceRouter>({
			links: [
				httpBatchLink({
					url: `${relayUrl}/hosts/${routingKey}/trpc`,
					transformer: SuperJSON,
					// The relay only verifies a JWKS-signed JWT. The raw bearer
					// may be an `sk_live_…` API key (from --api-key /
					// SUPERSET_API_KEY), which must first be exchanged for a JWT
					// — sending it raw makes the relay return UNAUTHORIZED, which
					// the CLI renders as the misleading "Session expired" (#6315).
					async headers() {
						return {
							Authorization: `Bearer ${await getHostJwt(options.userJwt)}`,
							"x-superset-client-machine-id": localHostId,
						};
					},
				}),
			],
		}),
	};
}
