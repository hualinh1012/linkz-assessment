import type { ReservationRepository } from "@/application/ports/reservation-repository";

export class ExpireReservationsUseCase {
  constructor(private readonly reservations: ReservationRepository) {}

  /** Returns the number of reservations released. */
  async execute(): Promise<number> {
    return this.reservations.expireOverdue();
  }
}
