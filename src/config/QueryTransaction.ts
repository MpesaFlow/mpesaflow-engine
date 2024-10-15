import { fetchWithErrorHandling } from "./ErrorHandlingFetch.js";

export async function queryTransactionStatus(
  token: string,
  body: any,
  MPESA_QUERY_URL: string,
) {
  console.log("Fetching transaction status from:", MPESA_QUERY_URL);
  const data = await fetchWithErrorHandling(MPESA_QUERY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  console.log("Transaction status response:", data);

  return data;
}
