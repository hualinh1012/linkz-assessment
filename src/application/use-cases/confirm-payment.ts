import { TERMINAL_PAYMENT_STATUSES } from "@/domain/payment";
import { PaymentNotFoundError } from "@/domain/errors";
import type { AXSWebhookPayload } from "@/application/ports/payment-gateway";
import type { PaymentRepository } from "@/application/ports/payment-repository";
import type { ReservationRepository } from "@/application/ports/reservation-repository";

export interface ConfirmPaymentInput {
  paymentId: string;       // webhook merchantRef = our payment ID
  transactionRef: string;
  status: AXSWebhookPayload["status"];
}

export type ConfirmPaymentOutcome = "CONFIRMED" | "RELEASED" | "ALREADY_PROCESSED";

/**
 * Idempotent webhook handler (TSD/2.4 §3).
 * The status comes directly from the decrypted AXS webhook — no secondary
 * Transaction Query API call. Gateway authentication is the webhook JWE decryption
 * that the route handler performs before calling this use case.
 */
export class ConfirmPaymentUseCase {
  constructor(
    private readonly reservations: ReservationRepository,
    private readonly payments: PaymentRepository,
  ) {}

  async execute(input: ConfirmPaymentInput): Promise<ConfirmPaymentOutcome> {
    console.log('input', input)
    const payment = await this.payments.findById(input.paymentId);
    if (!payment) throw new PaymentNotFoundError(input.paymentId);

    // Idempotency: ignore if the payment is already in a terminal state.
    if (TERMINAL_PAYMENT_STATUSES.has(payment.status)) {
      return "ALREADY_PROCESSED";
    }

    switch (input.status) {
      case "SUCCESS":
        await this.reservations.confirmAndReserveSeat(payment.reservationId, input.transactionRef);
        return "CONFIRMED";
      case "DECLINED":
        await this.reservations.failAndReleaseSeat(payment.reservationId, "FAILED");
        return "RELEASED";
      case "EXPIRED":
        // User abandoned the AXS page — same terminal state as the expiry cleanup uses.
        await this.reservations.failAndReleaseSeat(payment.reservationId, "EXPIRED");
        return "RELEASED";
    }
  }
}
