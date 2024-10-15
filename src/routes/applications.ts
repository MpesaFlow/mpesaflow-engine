import { Hono } from "hono";
import { env } from "hono/adapter";
import { unkey, type UnkeyContext } from "@unkey/hono";
import { convexMutation, convexQuery } from "@/config/Convex";
import type { Binding } from "@/types/honoTypes";
import { formatDate } from "@/config/date-formater";
import { createApplicationSchema } from "@/sandbox-api/src/schema/applicationSchema";

const applications = new Hono<{
	Bindings: Binding;
	Variables: { unkey: UnkeyContext };
}>();

applications.use(
	"*",
	unkey({
		apiId: (c: any) => {
			const { UNKEY_ROOT_ID } = env<Binding>(c);
			return UNKEY_ROOT_ID;
		},
	})
);

applications.post("/create", async (c) => {
	try {
		const unkeyContext = c.get("unkey");
		if (!unkeyContext?.valid || unkeyContext.meta?.type !== "root") {
			return c.json({ error: "Unauthorized. Root key required." }, 401);
		}

		const body = await c.req.json();
		const result = createApplicationSchema.safeParse(body);

		if (!result.success) {
			return c.json(
				{
					error: "Validation failed",
					details: result.error.issues,
				},
				400
			);
		}

		const {
			name,
			environment,
			ConsumerKey,
			ConsumerSecret,
			BusinessShortCode,
		} = result.data;

		const { CONVEX_URL } = env(c);
		const formattedDate = formatDate(new Date());
		const appId = crypto.randomUUID();

		const applicationId = await convexMutation(
			CONVEX_URL,
			"applications:create",
			{
				userId: unkeyContext.ownerId,
				name,
				createdAt: formattedDate,
				environment,
				applicationId: appId,
				ConsumerKey: environment === "production" ? ConsumerKey : undefined,
				ConsumerSecret:
					environment === "production" ? ConsumerSecret : undefined,
				BusinessShortCode:
					environment === "production" ? BusinessShortCode : undefined,
				environments: [environment],
				currentEnvironment: environment,
			}
		);

		return c.json(
			{ applicationId, message: "Application created successfully" },
			201
		);
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	} catch (error: any) {
		return c.json({ error: error.message }, 500);
	}
});

applications.get("/list", async (c) => {
	try {
		const unkeyContext = c.get("unkey");
		if (!unkeyContext?.valid || unkeyContext.meta?.type !== "root") {
			return c.json({ error: "Unauthorized. Root key required." }, 401);
		}

		const { CONVEX_URL } = env(c);

		const apps = await convexQuery(CONVEX_URL, "applications:list", {
			userId: unkeyContext.ownerId,
		});

		return c.json(apps);
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	} catch (error: any) {
		return c.json({ error: error.message }, 500);
	}
});

applications.delete("/:appId", async (c) => {
	try {
		const unkeyContext = c.get("unkey");
		if (!unkeyContext?.valid || unkeyContext.meta?.type !== "root") {
			return c.json({ error: "Unauthorized. Root key required." }, 401);
		}

		const { appId } = c.req.param();
		const { CONVEX_URL } = env(c);

		await convexMutation(CONVEX_URL, "applications:delete", {
			userId: unkeyContext.ownerId,
			appId,
		});

		return c.json({ message: "Application deleted successfully" });
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	} catch (error: any) {
		return c.json({ error: error.message }, 500);
	}
});

export default applications;
