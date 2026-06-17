import { CompactEncrypt, compactDecrypt } from "jose";
import { randomBytes } from "node:crypto";
import { required } from "@/config/env";
import { PaymentReversalError } from "@/domain/errors";
import type {
  AXSWebhookPayload,
  BuildPaymentPageInput,
  PaymentGateway,
} from "@/application/ports/payment-gateway";

export class AxsPaymentGateway implements PaymentGateway {
  async buildPaymentPageUrl(input: BuildPaymentPageInput): Promise<string> {
    const secret = new TextEncoder().encode(required("AXS_API_SECRET"));
    const clientId = required("AXS_CLIENT_ID");
    const checkoutUrl = required("AXS_CHECKOUT_URL");
    const merchantLinkId = required("AXS_MERCHANT_LINK_ID");

    const payload = {
      clientId,
      amount: input.amountCents,
      currency: "SGD",
      merchantRef: input.paymentId,
      webhookUrl: `${input.baseUrl}/api/public/payment/callback`,
      successUrl: `${input.baseUrl}/reservation/confirmed?id=${input.reservationId}`,
      failUrl: `${input.baseUrl}/seats?error=payment_failed`,
    };

    const jwe = await new CompactEncrypt(
      new TextEncoder().encode(JSON.stringify(payload)),
    )
      .setProtectedHeader({
        alg: "PBES2-HS512+A256KW",
        enc: "A256GCM",
        // Random 16-byte salt per request as required by the AXS spec.
        p2s: randomBytes(16),
        p2c: 1000,
        kid: clientId,
      })
      .encrypt(secret);

    return `${checkoutUrl}/hpp/checkout/${merchantLinkId}?data=${encodeURIComponent(jwe)}`;
  }

  async decryptWebhook(rawBody: string): Promise<AXSWebhookPayload> {
    const secret = new TextEncoder().encode(required("AXS_API_SECRET"));

    const { plaintext } = await compactDecrypt(rawBody.trim(), secret);
    const payload = JSON.parse(new TextDecoder().decode(plaintext)) as AXSWebhookPayload;

    if (!payload.transactionRef || !payload.merchantRef || !payload.status) {
      throw new Error("Invalid AXS webhook payload: missing required fields");
    }

    return payload;
  }

  async reversePayment(
    transactionRef: string,
    paymentId: string,
    amountCents: number,
  ): Promise<"VOIDED" | "REFUNDED"> {
    const apiKey = required("AXS_API_KEY");
    const baseUrl = required("AXS_API_BASE_URL");
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    };

    // Attempt void first (pre-settlement reversal).
    const voidRes = await fetch(`${baseUrl}/transactions/${transactionRef}/void`, {
      method: "POST",
      headers,
      body: JSON.stringify({ merchantRef: paymentId }),
    });
    if (voidRes.ok) return "VOIDED";

    // Void rejected — payment likely settled; fall back to full refund.
    const refundRes = await fetch(`${baseUrl}/transactions/${transactionRef}/refund`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        merchantRef: paymentId,
        amount: (amountCents / 100).toFixed(2),
      }),
    });
    if (refundRes.ok) return "REFUNDED";

    throw new PaymentReversalError(
      `Void failed (${voidRes.status}) and refund failed (${refundRes.status})`,
    );
  }
}
