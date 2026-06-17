import { RESERVATION_TTL_MINUTES, type Reservation } from "@/domain/reservation";
import { PaymentInitiationError } from "@/domain/errors";
import type { Clock } from "@/application/ports/clock";
import type { PaymentGateway } from "@/application/ports/payment-gateway";
import type { ReservationRepository } from "@/application/ports/reservation-repository";

export interface ReserveSeatInput {
  userId: string;
  seatId: number;
}

export interface ReserveSeatResult {
  reservation: Reservation;
  paymentId: string;
  redirectUrl: string;
}

/**
 * Creates a PENDING reservation (inside the repository's SELECT FOR UPDATE
 * transaction) and initiates the AXS payment session. See TSD/2.3.
 */
export class ReserveSeatUseCase {
  constructor(
    private readonly reservations: ReservationRepository,
    private readonly gateway: PaymentGateway,
    private readonly clock: Clock,
    private readonly seatPriceCents: number,
    private readonly appUrl: string,
  ) {}

  async execute(input: ReserveSeatInput): Promise<ReserveSeatResult> {
    const expiresAt = new Date(
      this.clock.now().getTime() + RESERVATION_TTL_MINUTES * 60_000,
    );

    // Throws SeatNotFoundError / SeatNotAvailableError / DuplicateReservationError.
    const { reservation, paymentId } = await this.reservations.createPendingForSeat({
      userId: input.userId,
      seatId: input.seatId,
      amountCents: this.seatPriceCents,
      expiresAt,
    });

    let redirectUrl: string;
    try {
      redirectUrl = await this.gateway.buildPaymentPageUrl({
        paymentId,
        reservationId: reservation.id,
        amountCents: this.seatPriceCents,
        baseUrl: this.appUrl,
      });
    } catch (cause) {
      // The reservation is left PENDING and will be released by the expiry
      // cleanup job (TSD/2.3 §5); surface the gateway failure to the caller.
      throw new PaymentInitiationError(
        cause instanceof Error ? cause.message : undefined,
      );
    }

    return { reservation, paymentId, redirectUrl };
  }
}
