export type Binding = {
  CONSUMER_AUTH: string;
  MPESA_OAUTH_URL: string;
  MPESA_PROCESS_URL: string;
  MPESA_QUERY_URL: string;
  BUSINESS_SHORT_CODE: string;
  PASS_KEY: string;
  CONVEX_URL: string;
  UNKEY_API_ID: string;
  ALLOWED_ORIGIN: string;
  BASELIME_API_KEY: string;
  SERVICE_NAME: string;
  UPSTASH_WORKFLOW_URL: string;
  ENVIRONMENT: string;
};

export interface MpesaData {
  Amount: number;
  CheckoutRequestID: string;
  ResultCode: string;
  ResultDesc: string;
  TransactionDesc: string;
}
