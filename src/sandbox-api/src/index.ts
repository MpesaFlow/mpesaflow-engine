import { Hono } from "hono";
import { instrument } from "@microlabs/otel-cf-workers";
import { config } from "@/config/obesrvability";
import type { Binding } from "@/types/honoTypes";
import apiKeys from "@/routes/api-keys";
import applications from "@/routes/applications";
import transactions from "@/routes/transactions";
import { cors } from "hono/cors";

const app = new Hono<{
	Bindings: Binding;
}>();

// CORS middleware
app.use(
	"*",
	cors({
		origin: "https://sandbox-api.mpesaflow.com", // Allow all origins
		allowMethods: ["GET", "POST", "DELETE"],
	})
);

// Mount the route groups
app.route("/api-keys", apiKeys);
app.route("/apps", applications);
app.route("/transactions", transactions);

// Health check route
app.get("/health", (c) => {
	return c.text("OK", 200);
});

export default instrument(app, config);
