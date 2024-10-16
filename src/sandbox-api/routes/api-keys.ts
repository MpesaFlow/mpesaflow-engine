import { Hono } from "hono";
import { env } from "hono/adapter";
import { unkey, type UnkeyContext } from "@unkey/hono";
import { convexMutation, convexQuery } from "@/config/Convex";
import type { Binding } from "@/types/honoTypes";
import { fetchWithErrorHandling } from "@/config/ErrorHandlingFetch";

const apiKeys = new Hono<{
	Bindings: Binding;
	Variables: { unkey: UnkeyContext };
}>();

apiKeys.use(
	"*",
	unkey({
		apiId: (c: any) => {
			const { UNKEY_ROOT_ID } = env<Binding>(c);
			return UNKEY_ROOT_ID;
		},
	})
);

apiKeys.post("/create", async (c) => {
	try {
		const unkeyContext = c.get("unkey");
		if (!unkeyContext?.valid || unkeyContext.meta?.type !== "root") {
			return c.json({ error: "Unauthorized. Root key required." }, 401);
		}

		const { applicationId, keyName } = await c.req.json();
		const { UNKEY_ROOT_KEY, CONVEX_URL } = env(c);

		const response = await fetchWithErrorHandling(
			"https://api.unkey.dev/v1/keys",
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${UNKEY_ROOT_KEY}`,
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					apiId: applicationId,
					prefix: "mpf",
					byteLength: 16,
					ownerId: unkeyContext.ownerId,
					meta: {
						keyName,
						type: "app",
					},
				}),
			}
		);

		if (!response.ok) {
			throw new Error("Failed to generate API key");
		}

		const { key } = await response.json();

		await convexMutation(CONVEX_URL, "apiKeys:create", {
			userId: unkeyContext.ownerId,
			applicationId,
			keyName,
			keyId: key.id,
		});

		return c.json(
			{ apiKey: key.key, message: "API key generated successfully" },
			201
		);
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	} catch (error: any) {
		return c.json({ error: error.message }, 500);
	}
});

apiKeys.get("/list/:applicationId", async (c) => {
	try {
		const unkeyContext = c.get("unkey");
		if (!unkeyContext?.valid || unkeyContext.meta?.type !== "root") {
			return c.json({ error: "Unauthorized. Root key required." }, 401);
		}

		const { applicationId } = c.req.param();
		const { CONVEX_URL } = env(c);

		const apiKeys = await convexQuery(CONVEX_URL, "apiKeys:list", {
			applicationId,
			userId: unkeyContext.ownerId,
		});

		return c.json(apiKeys);
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	} catch (error: any) {
		return c.json({ error: error.message }, 500);
	}
});

apiKeys.delete("/:keyId", async (c) => {
	try {
		const unkeyContext = c.get("unkey");
		if (!unkeyContext?.valid || unkeyContext.meta?.type !== "root") {
			return c.json({ error: "Unauthorized. Root key required." }, 401);
		}

		const { keyId } = c.req.param();
		const { UNKEY_ROOT_KEY, CONVEX_URL } = env(c);

		const response = await fetchWithErrorHandling(
			`https://api.unkey.dev/v1/keys/${keyId}`,
			{
				method: "DELETE",
				headers: {
					Authorization: `Bearer ${UNKEY_ROOT_KEY}`,
				},
			}
		);

		if (!response.ok) {
			throw new Error("Failed to revoke API key");
		}

		await convexMutation(CONVEX_URL, "apiKeys:delete", {
			userId: unkeyContext.ownerId,
			keyId,
		});

		return c.json({ message: "API key revoked successfully" });
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	} catch (error: any) {
		return c.json({ error: error.message }, 500);
	}
});

export default apiKeys;
