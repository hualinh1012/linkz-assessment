import type { Reservation } from "@/domain/reservation";

export interface CreatePendingInput {
  userId: string;
  seatId: number;
  amountCents: number;
  expiresAt: Date;
}

export interface CreatePendingResult {
  reservation: Reservation;
  paymentId: string;
}

/**
 * Owns the multi-table reservation transactions. Implementations MUST run these
 * inside a `SELECT FOR UPDATE` transaction on the seat row (see TSD/1.3 §1.5).
 */
export interface ReservationRepository {
  findById(id: string): Promise<Reservation | null>;

  /** Returns the user's active (PENDING or CONFIRMED) reservation, or null. */
  findActiveByUserId(userId: string): Promise<Reservation | null>;

  /**
   * Atomically: lock the seat row, verify it is AVAILABLE, create a PENDING
   * reservation + INITIATED payment, and set the seat to PENDING.
   * Throws SeatNotAvailableError / DuplicateReservationError on violation.
   */
  createPendingForSeat(input: CreatePendingInput): Promise<CreatePendingResult>;

  /** PENDING → CONFIRMED, payment → SUCCESS, seat → RESERVED. Idempotent. */
  confirmAndReserveSeat(reservationId: string, axsTransactionRef: string): Promise<void>;

  /** PENDING → CANCELLED, payment → FAILED|EXPIRED, seat → AVAILABLE. Idempotent. */
  failAndReleaseSeat(reservationId: string, paymentStatus: "FAILED" | "EXPIRED"): Promise<void>;

  /** CONFIRMED → CANCELLED, payment → VOIDED|REFUNDED, seat → AVAILABLE. */
  cancelConfirmedAndReleaseSeat(
    reservationId: string,
    paymentStatus: "VOIDED" | "REFUNDED",
  ): Promise<void>;

  /**
   * Atomically expires all overdue PENDING reservations (expires_at < now()):
   * payment → EXPIRED, reservation → CANCELLED, seat → AVAILABLE.
   * Idempotent — safe to call concurrently (uses FOR UPDATE SKIP LOCKED).
   * Returns the count of reservations released.
   */
  expireOverdue(): Promise<number>;
}
