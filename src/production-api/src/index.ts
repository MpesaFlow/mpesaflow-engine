import { instrument } from "@microlabs/otel-cf-workers";
import { type UnkeyContext, unkey } from "@unkey/hono";
import { Hono } from "hono";
import { env } from "hono/adapter";
import { convexQuery, convexMutation } from "@/config/Convex";
import { fetchWithErrorHandling } from "@/config/ErrorHandlingFetch";
import { generateTransactionId } from "@/config/generateTransactionId";
import { config } from "@/config/obesrvability.js";
import type { Binding } from "@/types/honoTypes.js";
import { queryTransactionStatus } from "@/config/QueryTransaction";
import { getMpesaToken } from "@/config/GetMpesaToken";

const app = new Hono<{
	Bindings: Binding;
	Variables: { unkey: UnkeyContext };
}>().basePath("/v1");

app.use(
	"*",
	unkey({
		apiId: (c) => {
			const { UNKEY_API_ID } = env<Binding>(c);
			return UNKEY_API_ID;
		},
	})
);

async function getMpesaToken(consumerKey: string, consumerSecret: string) {
	const auth = btoa(`${consumerKey}:${consumerSecret}`);
	const response = await fetchWithErrorHandling(
		"https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
		{
			method: "GET",
			headers: {
				Authorization: `Basic ${auth}`,
			},
		}
	);

	if (!response.access_token) {
		throw new Error(
			"Failed to obtain M-Pesa token. Please check your credentials."
		);
	}

	return response.access_token;
}

async function queryTransactionStatus(token: string, body: any, url: string) {
	const response = await fetchWithErrorHandling(url, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
		},
		body: JSON.stringify(body),
	});

	if (response.errorCode === "500.001.1001") {
		throw new Error("TRANSACTION_IN_PROCESS");
	}

	return response;
}

app.post("/paybill", async (c) => {
	try {
		const unkeyContext = c.get("unkey");

		if (!unkeyContext?.valid) {
			return c.json(
				{ error: "Unauthorized. Please provide a valid API key." },
				401
			);
		}

		if (unkeyContext.environment !== "production") {
			return c.json(
				{ error: "Unauthorized. Please provide a Production API key." },
				401
			);
		}

		const { CONVEX_URL } = env(c);

		// Fetch user's M-Pesa credentials from the database
		const credentials = await convexQuery(
			CONVEX_URL,
			"applications:getApplicationData",
			{
				applicationId: unkeyContext.meta?.appId,
				userId: unkeyContext.ownerId,
			}
		);

		if (
			!credentials ||
			!credentials.ConsumerKey ||
			!credentials.ConsumerSecret ||
			!credentials.passKey ||
			!credentials.BusinessShortCode
		) {
			return c.json(
				{ error: "M-Pesa credentials not found or incomplete." },
				400
			);
		}

		// Get M-Pesa token using user's credentials
		let token;
		try {
			token = await getMpesaToken(
				credentials.ConsumerKey,
				credentials.ConsumerSecret
			);
		} catch (error) {
			return c.json(
				{
					error:
						"Failed to authenticate with M-Pesa. Please check your credentials.",
				},
				401
			);
		}

		const body = await c.req.json();
		const timestamp = new Date()
			.toISOString()
			.replace(/[^0-9]/g, "")
			.slice(0, -3);
		const password = btoa(
			`${credentials.BusinessShortCode}${credentials.passKey}${timestamp}`
		);

		const transactionId = generateTransactionId();

		const mpesaRequestBody = {
			BusinessShortCode: credentials.BusinessShortCode,
			Password: password,
			Timestamp: timestamp,
			TransactionType: "CustomerPayBillOnline",
			Amount: body.amount,
			PartyA: body.phoneNumber,
			PartyB: credentials.BusinessShortCode,
			PhoneNumber: body.phoneNumber,
			CallBackURL: `${c.req.url.split("/paybill")[0]}/mpesa-callback`,
			AccountReference: body.accountReference,
			TransactionDesc: body.transactionDesc,
		};

		const mpesaData = await fetchWithErrorHandling(
			"https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token}`,
				},
				body: JSON.stringify(mpesaRequestBody),
			}
		);

		if (!mpesaData.CheckoutRequestID) {
			throw new Error("Failed to initiate M-Pesa transaction.");
		}

		await convexMutation(CONVEX_URL, "transactions:create", {
			KeyId: unkeyContext.keyId,
			BusinessShortCode: credentials.BusinessShortCode,
			transactionId: transactionId,
			amount: Number(body.amount),
			phoneNumber: body.phoneNumber,
			accountReference: body.accountReference,
			transactionDesc: body.transactionDesc,
			mpesaRequestId: mpesaData.CheckoutRequestID,
			status: "pending",
			resultDesc: "",
			date_created: timestamp,
		});

		// Polling for transaction status
		const statusBody = {
			BusinessShortCode: credentials.BusinessShortCode,
			Password: password,
			Timestamp: timestamp,
			CheckoutRequestID: mpesaData.CheckoutRequestID,
		};

		let statusData;
		let attempts = 0;
		const maxAttempts = 5;
		const pollingInterval = 5000; // 5 seconds

		while (attempts < maxAttempts) {
			try {
				statusData = await queryTransactionStatus(
					token,
					statusBody,
					"https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query"
				);
				break;
			} catch (error: any) {
				if (error.message === "TRANSACTION_IN_PROCESS") {
					console.log(
						`Transaction still processing. Attempt ${
							attempts + 1
						} of ${maxAttempts}`
					);
					await new Promise((resolve) => setTimeout(resolve, pollingInterval));
					attempts++;
				} else {
					throw error;
				}
			}
		}

		if (!statusData || statusData.ResultCode === "1032") {
			// 1032 is the code for "Request cancelled by user"
			await convexMutation(CONVEX_URL, "transactions:updateStatus", {
				transactionId,
				status: "pending",
				resultDesc:
					"Transaction status could not be determined after multiple attempts",
			});
			return c.json(
				{
					transactionId: transactionId,
					mpesaRequestId: mpesaData.CheckoutRequestID,
					status: "pending",
					message:
						"Transaction is still being processed. Please check back later.",
				},
				202
			);
		}

		await convexMutation(CONVEX_URL, "transactions:updateStatus", {
			transactionId,
			status: statusData.ResultCode === "0" ? "completed" : "failed",
			resultDesc: statusData.ResultDesc,
		});

		return c.json(
			{
				transactionId: transactionId,
				mpesaRequestId: mpesaData.CheckoutRequestID,
				mpesaStatus: statusData,
			},
			200
		);
	} catch (error: any) {
		console.error("Error processing M-Pesa request:", error);
		return c.json({ error: error.message }, 500);
	}
});

app.post("/mpesa-callback", async (c) => {
	try {
		const callbackData = await c.req.json();
		console.log("Received M-Pesa callback:", callbackData);

		const { ResultCode, ResultDesc, CheckoutRequestID } =
			callbackData.Body.stkCallback;

		const { CONVEX_URL } = env(c);
		await convexMutation(CONVEX_URL, "transactions:updateStatus", {
			mpesaRequestId: CheckoutRequestID,
			status: ResultCode === "0" ? "completed" : "failed",
			resultDesc: ResultDesc,
		});

		return c.json({
			ResultCode: "0",
			ResultDesc: "Callback received successfully",
		});
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	} catch (error: any) {
		console.error("Error processing M-Pesa callback:", error);
		return c.json(
			{ ResultCode: "1", ResultDesc: "Error processing callback" },
			500
		);
	}
});

app.get("/transaction-status/:transactionId", async (c) => {
	try {
		const { transactionId } = c.req.param();
		const { CONVEX_URL } = env(c);

		const unkeyContext = c.get("unkey");
		if (!unkeyContext?.valid) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		if (unkeyContext.environment === "development") {
			return c.json({ error: "This API is for production only" }, 401);
		}

		const transactionStatus = await convexMutation(
			CONVEX_URL,
			"transactions:getStatus",
			{
				transactionId: transactionId,
				KeyId: unkeyContext.keyId,
			}
		);

		if (!transactionStatus) {
			return c.json({ error: "Transaction not found" }, 404);
		}

		return c.json(transactionStatus);
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	} catch (error: any) {
		console.error("Error fetching transaction status:", error);
		return c.json({ error: error.message }, 500);
	}
});

app.get("/health", async (c) => {
	const unkeyContext = c.get("unkey");

	if (!unkeyContext?.valid) {
		return c.json({ error: "Unauthorized" }, 401);
	}
	if (unkeyContext.environment === "development") {
		return c.json({ error: "This API is for production only" }, 401);
	}

	const headers = c.req.header("User-Agent");

	if (headers === "betterstack") {
		return c.text("OK", 200);
	}
	return c.text("Not OK", 500);
});

app.get("/transactions", async (c) => {
	try {
		const { CONVEX_URL } = env(c);
		const unkeyContext = c.get("unkey");
		if (!unkeyContext?.valid) {
			return c.json({ error: "Unauthorized" }, 401);
		}

		if (unkeyContext.environment === "development") {
			return c.json({ error: "This API is for production only" }, 401);
		}

		const transactions = await convexQuery(
			CONVEX_URL,
			"transactions:getTransactions",
			{
				KeyId: unkeyContext.keyId,
			}
		);

		return c.json(transactions);
		// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	} catch (error: any) {
		console.error("Error fetching transactions:", error);
		return c.json({ error: error.message }, 500);
	}
});

export default instrument(app, config);
