import { Hono } from "hono";
import { env } from "hono/adapter";
import { unkey, type UnkeyContext } from "@unkey/hono";
import { convexQuery, convexMutation } from "@/config/Convex";
import { fetchWithErrorHandling } from "@/config/ErrorHandlingFetch";
import { generateTransactionId } from "@/config/generateTransactionId";
import { queryTransactionStatus } from "@/config/QueryTransaction";
import { getMpesaToken } from "@/config/GetMpesaToken";
import type { Binding } from "@/types/honoTypes";
import { formatDate } from "@/config/date-formater";

const transactions = new Hono<{
  Bindings: Binding;
  Variables: { unkey: UnkeyContext };
}>();

transactions.use(
  "*",
  unkey({
    apiId: (c) => {
      const { UNKEY_API_ID } = env<Binding>(c);
      return UNKEY_API_ID;
    },
  })
);

transactions.post("/create", async (c) => {
  try {
    const unkeyContext = c.get("unkey");

    if (!unkeyContext?.valid || unkeyContext.environment !== "development") {
      return c.json(
        { error: "Unauthorized. Valid app-specific API key required." },
        401
      );
    }

    const {
      MPESA_PROCESS_URL,
      MPESA_QUERY_URL,
      BUSINESS_SHORT_CODE,
      PASS_KEY,
      CONVEX_URL,
    } = env(c);

    const token = await getMpesaToken(c);

    const body = await c.req.json();
    const timestamp = new Date()
      .toISOString()
      .replace(/[^0-9]/g, "")
      .slice(0, -3);
    const password = btoa(`${BUSINESS_SHORT_CODE}${PASS_KEY}${timestamp}`);

    const transactionId = generateTransactionId();

    const mpesaRequestBody = {
      BusinessShortCode: BUSINESS_SHORT_CODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: body.amount,
      PartyA: body.phoneNumber,
      PartyB: BUSINESS_SHORT_CODE,
      PhoneNumber: body.phoneNumber,
      CallBackURL: `${c.req.url.split("/create")[0]}/mpesa-callback`,
      AccountReference: body.accountReference,
      TransactionDesc: body.transactionDesc,
    };

    const mpesaData = await fetchWithErrorHandling(MPESA_PROCESS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(mpesaRequestBody),
    });

    const formattedDate = formatDate(new Date());
    const formattedAmount = Number(body.amount);

    await convexMutation(CONVEX_URL, "transactions:create", {
      KeyId: unkeyContext.keyId,
      transactionId: transactionId,
      amount: formattedAmount,
      phoneNumber: body.phoneNumber,
      accountReference: body.accountReference,
      transactionDesc: body.transactionDesc,
      mpesaRequestId: mpesaData.CheckoutRequestID,
      status: "pending",
      resultDesc: "",
      date_created: formattedDate,
    });

    const statusBody = {
      BusinessShortCode: BUSINESS_SHORT_CODE,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: mpesaData.CheckoutRequestID,
    };

    let statusData;
    let attempts = 0;
    const maxAttempts = 5;
    const pollingInterval = 5000;

    while (attempts < maxAttempts) {
      statusData = await queryTransactionStatus(
        token,
        statusBody,
        MPESA_QUERY_URL
      );

      if (statusData.ResultCode !== undefined) {
        break;
      }

      await new Promise((resolve) => setTimeout(resolve, pollingInterval));
      attempts++;
    }

    if (!statusData || statusData.ResultCode === undefined) {
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

transactions.post("/mpesa-callback", async (c) => {
  try {
    const { CONVEX_URL } = env(c);
    const callbackData = await c.req.json();

    // Extract relevant information from the callback data
    const {
      Body: {
        stkCallback: {
          MerchantRequestID,
          CheckoutRequestID,
          ResultCode,
          ResultDesc,
        },
      },
    } = callbackData;

    // Update the transaction status in your database
    await convexMutation(CONVEX_URL, "transactions:updateStatusByMpesaRequestId", {
      mpesaRequestId: CheckoutRequestID,
      status: ResultCode === "0" ? "completed" : "failed",
      resultDesc: ResultDesc,
    });

    // Respond to M-Pesa
    return c.json({ ResultCode: "0", ResultDesc: "Callback received successfully" });
  } catch (error: any) {
    console.error("Error processing M-Pesa callback:", error);
    return c.json({ error: error.message }, 500);
  }
});

transactions.get("/status/:transactionId", async (c) => {
  try {
    const { transactionId } = c.req.param();
    const { CONVEX_URL } = env(c);

    const unkeyContext = c.get("unkey");
    if (!unkeyContext?.valid || unkeyContext.meta?.type !== "app") {
      return c.json(
        { error: "Unauthorized. Valid app-specific API key required." },
        401
      );
    }

    const transactionStatus = await convexQuery(
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
  } catch (error: any) {
    console.error("Error fetching transaction status:", error);
    return c.json({ error: error.message }, 500);
  }
});

transactions.get("/list", async (c) => {
  try {
    const { CONVEX_URL } = env(c);
    const unkeyContext = c.get("unkey");
    if (!unkeyContext?.valid || unkeyContext.meta?.type !== "app") {
      return c.json(
        { error: "Unauthorized. Valid app-specific API key required." },
        401
      );
    }

    const transactions = await convexQuery(
      CONVEX_URL,
      "transactions:getTransactions",
      {
        KeyId: unkeyContext.keyId,
      }
    );

    return c.json(transactions);
  } catch (error: any) {
    console.error("Error fetching transactions:", error);
    return c.json({ error: error.message }, 500);
  }
});

export default transactions;