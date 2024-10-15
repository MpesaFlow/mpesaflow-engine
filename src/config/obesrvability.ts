import type { Binding } from "../production-api/src/types/honoTypes.js";
import { ResolveConfigFn } from "@microlabs/otel-cf-workers";

export const config: ResolveConfigFn = (env: Binding, _trigger) => {
	return {
		exporter: {
			url: "https://otel.baselime.io/v1",
			headers: { "x-api-key": env.BASELIME_API_KEY },
		},
		service: { name: env.SERVICE_NAME },
	};
};
