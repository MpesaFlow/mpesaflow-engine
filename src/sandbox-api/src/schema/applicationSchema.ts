import { z } from "zod";

export const createApplicationSchema = z
	.object({
		name: z.string().min(1, "Name is required"),
		environment: z.enum(["production", "sandbox"]),
		ConsumerKey: z.string().optional(),
		ConsumerSecret: z.string().optional(),
		BusinessShortCode: z.string().optional(),
	})
	.refine(
		(data) => {
			if (data.environment === "production") {
				return (
					data.ConsumerKey && data.ConsumerSecret && data.BusinessShortCode
				);
			}
			return true;
		},
		{
			message:
				"ConsumerKey, ConsumerSecret, and BusinessShortCode are required for production environment",
			path: ["ConsumerKey", "ConsumerSecret", "BusinessShortCode"],
		}
	);

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;
