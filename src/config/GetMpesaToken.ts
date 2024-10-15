import { fetchWithErrorHandling } from "./ErrorHandlingFetch.js";
import { env } from "hono/adapter";

export async function getMpesaToken(c: any) {
  const { CONSUMER_AUTH, MPESA_OAUTH_URL } = env(c);
  console.log("Fetching M-Pesa token from:", MPESA_OAUTH_URL);

  const data = await fetchWithErrorHandling(
    `${MPESA_OAUTH_URL}?grant_type=client_credentials`,
    {
      method: "GET",
      headers: {
        Authorization: `Basic ${CONSUMER_AUTH}`,
      },
    },
  );

  console.log("M-Pesa token fetched successfully");
  return data.access_token as string;
}
