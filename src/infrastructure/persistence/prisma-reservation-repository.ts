import { Prisma, type PrismaClient } from "@prisma/client";
import type { Reservation } from "@/domain/reservation";
import {
  DuplicateReservationError,
  ReservationNotFoundError,
  SeatNotAvailableError,
  SeatNotFoundError,
} from "@/domain/errors";
import type {
  CreatePendingInput,
  CreatePendingResult,
  ReservationRepository,
} from "@/application/ports/reservation-repository";

/**
 * Owns the reservation transactions (TSD/1.3 §1.5, flows TSD/2.3 / 2.4).
 * Concurrency safety comes from a `SELECT ... FOR UPDATE` lock on the seat row
 * under the default READ COMMITTED isolation; the partial unique indexes
 * (uq_user_active_reservation / uq_seat_active_reservation) are the last-resort
 * guard, surfaced here as domain errors.
 */
export class PrismaReservationRepository implements ReservationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Reservation | null> {
    const r = await this.prisma.reservation.findUnique({ where: { id } });
    return r ? toDomain(r) : null;
  }

  async createPendingForSeat(input: CreatePendingInput): Promise<CreatePendingResult> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        // Lock the seat row — blocks concurrent reservation attempts on the same seat.
        const rows = await tx.$queryRaw<Array<{ id: number; status: string }>>`
          SELECT id, status FROM seats WHERE id = ${input.seatId} FOR UPDATE
        `;
        const seat = rows[0];
        if (!seat) throw new SeatNotFoundError(input.seatId);
        if (seat.status !== "AVAILABLE") throw new SeatNotAvailableError(input.seatId);

        const reservation = await tx.reservation.create({
          data: {
            userId: input.userId,
            seatId: input.seatId,
            status: "PENDING",
            expiresAt: input.expiresAt,
          },
        });

        await tx.seat.update({ where: { id: input.seatId }, data: { status: "PENDING" } });

        const payment = await tx.payment.create({
          data: {
            reservationId: reservation.id,
            amountCents: input.amountCents,
            currency: "SGD",
            status: "INITIATED",
          },
        });

        return { reservation: toDomain(reservation), paymentId: payment.id };
      });
    } catch (err) {
      throw mapCreateError(err, input.seatId);
    }
  }

  async confirmAndReserveSeat(reservationId: string, axsTransactionRef: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.reservation.findUnique({ where: { id: reservationId } });
      if (!r) throw new ReservationNotFoundError(reservationId);
      if (r.status !== "PENDING") return; // idempotent: already confirmed/cancelled

      await tx.reservation.update({ where: { id: reservationId }, data: { status: "CONFIRMED" } });
      await tx.payment.update({
        where: { reservationId },
        data: { status: "SUCCESS", axsTransactionRef, completedAt: new Date() },
      });
      await tx.seat.update({ where: { id: r.seatId }, data: { status: "RESERVED" } });
    });
  }

  async failAndReleaseSeat(
    reservationId: string,
    paymentStatus: "FAILED" | "EXPIRED",
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.reservation.findUnique({ where: { id: reservationId } });
      if (!r) throw new ReservationNotFoundError(reservationId);
      if (r.status !== "PENDING") return; // idempotent

      await tx.reservation.update({ where: { id: reservationId }, data: { status: "CANCELLED" } });
      await tx.payment.update({
        where: { reservationId },
        data: { status: paymentStatus, completedAt: new Date() },
      });
      await tx.seat.update({ where: { id: r.seatId }, data: { status: "AVAILABLE" } });
    });
  }

  async cancelConfirmedAndReleaseSeat(
    reservationId: string,
    paymentStatus: "VOIDED" | "REFUNDED",
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const r = await tx.reservation.findUnique({ where: { id: reservationId } });
      if (!r) throw new ReservationNotFoundError(reservationId);
      if (r.status !== "CONFIRMED") return; // idempotent: already cancelled

      await tx.reservation.update({ where: { id: reservationId }, data: { status: "CANCELLED" } });
      await tx.payment.update({
        where: { reservationId },
        data: { status: paymentStatus, completedAt: new Date() },
      });
      await tx.seat.update({ where: { id: r.seatId }, data: { status: "AVAILABLE" } });
    });
  }

  async expireOverdue(): Promise<number> {
    // Single atomic CTE: snapshot expired rows, then update payments →
    // reservations → seats in one statement (TSD/1.3 §1.6).
    // SKIP LOCKED prevents blocking if two job instances overlap.
    const affected = await this.prisma.$executeRaw`
      WITH expired AS (
        SELECT id, seat_id
        FROM   reservations
        WHERE  status = 'PENDING'
          AND  expires_at < now()
        FOR UPDATE SKIP LOCKED
      ),
      _payments AS (
        UPDATE payments
        SET    status = 'EXPIRED', completed_at = now()
        WHERE  status = 'INITIATED'
          AND  reservation_id IN (SELECT id FROM expired)
      ),
      _reservations AS (
        UPDATE reservations
        SET    status = 'CANCELLED', updated_at = now()
        WHERE  id IN (SELECT id FROM expired)
      )
      UPDATE seats
      SET    status = 'AVAILABLE', updated_at = now()
      WHERE  id IN (SELECT seat_id FROM expired)
    `;
    return affected;
  }
}

function toDomain(r: {
  id: string;
  userId: string;
  seatId: number;
  status: Reservation["status"];
  expiresAt: Date;
  createdAt: Date;
}): Reservation {
  return {
    id: r.id,
    userId: r.userId,
    seatId: r.seatId,
    status: r.status,
    expiresAt: r.expiresAt,
    createdAt: r.createdAt,
  };
}

// Map the partial-unique-index violation (last-resort guard) to a domain error.
function mapCreateError(err: unknown, seatId: number): unknown {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
    const target = String((err.meta as { target?: unknown } | undefined)?.target ?? "");
    return target.includes("seat")
      ? new SeatNotAvailableError(seatId)
      : new DuplicateReservationError();
  }
  return err; // domain errors (Seat*/Reservation*) and anything else pass through unchanged
}
