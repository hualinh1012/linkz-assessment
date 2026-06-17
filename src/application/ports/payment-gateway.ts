// Port for the AXS Checkout integration (see TSD/1.6). The use cases depend on
// this interface; all AXS specifics live in the infrastructure adapter.

export interface BuildPaymentPageInput {
  paymentId: string;        // AXS merchantRef — correlates webhook → payment record
  reservationId: string;    // embedded in successUrl
  amountCents: number;
  baseUrl: string;          // e.g. https://linkz.example.com
}

export interface AXSWebhookPayload {
  transactionRef: string;
  merchantRef: string;      // = our paymentId
  status: "SUCCESS" | "DECLINED" | "EXPIRED";
  amount: string;           // dollar string e.g. "15.00"
  currency: string;
  responseCode: string;
  paymentScheme: string;
  paymentDateTime: string;  // ISO 8601
}

export interface PaymentGateway {
  /** Builds the JWE-encrypted AXS Payment Link URL (TSD/1.6 §4.2). */
  buildPaymentPageUrl(input: BuildPaymentPageInput): Promise<string>;

  /**
   * Decrypts and validates a JWE-encrypted AXS webhook body (TSD/1.6 §4.4).
   * Throws if the payload cannot be decrypted or is structurally invalid.
   */
  decryptWebhook(rawBody: string): Promise<AXSWebhookPayload>;

  /**
   * Reverses a payment: void-first, refund-on-failure (TSD/1.6 §4.6).
   * Returns which operation succeeded.
   */
  reversePayment(
    transactionRef: string,
    paymentId: string,
    amountCents: number,
  ): Promise<"VOIDED" | "REFUNDED">;
}
