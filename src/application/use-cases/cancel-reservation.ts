import {
  PaymentReversalError,
  ReservationForbiddenError,
  ReservationNotCancellableError,
  ReservationNotFoundError,
} from "@/domain/errors";
import type { PaymentGateway } from "@/application/ports/payment-gateway";
import type { PaymentRepository } from "@/application/ports/payment-repository";
import type { ReservationRepository } from "@/application/ports/reservation-repository";

export interface CancelReservationInput {
  userId: string;
  reservationId: string;
}

export type CancelOutcome = "VOIDED" | "REFUNDED";

/**
 * Cancels a CONFIRMED reservation: reverse the AXS payment (void-first,
 * refund-on-failure — TSD/1.6 §4.6), then release the seat.
 */
export class CancelReservationUseCase {
  constructor(
    private readonly reservations: ReservationRepository,
    private readonly payments: PaymentRepository,
    private readonly gateway: PaymentGateway,
  ) {}

  async execute(input: CancelReservationInput): Promise<CancelOutcome> {
    const reservation = await this.reservations.findById(input.reservationId);
    if (!reservation) throw new ReservationNotFoundError(input.reservationId);
    if (reservation.userId !== input.userId) throw new ReservationForbiddenError();
    if (reservation.status !== "CONFIRMED") throw new ReservationNotCancellableError();

    const payment = await this.payments.findByReservationId(input.reservationId);
    if (!payment?.axsTransactionRef) {
      throw new PaymentReversalError("No AXS transaction reference on payment");
    }

    try {
      const outcome = await this.gateway.reversePayment(
        payment.axsTransactionRef,
        payment.id,
        payment.amountCents,
      );
      await this.reservations.cancelConfirmedAndReleaseSeat(input.reservationId, outcome);
      return outcome;
    } catch (cause) {
      if (cause instanceof PaymentReversalError) throw cause;
      throw new PaymentReversalError(cause instanceof Error ? cause.message : undefined);
    }
  }
}
