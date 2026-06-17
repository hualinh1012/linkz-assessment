import { NextResponse, type NextRequest } from "next/server";
import { container } from "@/container";
import { toHttpError } from "@/lib/http/errors";
import type { GetReservationResponse, CancelReservationResponse } from "@/lib/http/dto";

// GET /api/reservations/:id — returns current status for the confirmed page to poll.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    const reservation = await container.reservationRepo.findById(params.id);
    if (!reservation) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 });
    }
    if (reservation.userId !== userId) {
      return NextResponse.json({ error: "Forbidden", code: "FORBIDDEN" }, { status: 403 });
    }

    const payment = await container.paymentRepo.findByReservationId(params.id);

    const body: GetReservationResponse = {
      reservation: {
        id: reservation.id,
        seatId: reservation.seatId,
        status: reservation.status,
        expiresAt: reservation.expiresAt.toISOString(),
      },
      payment: payment
        ? { id: payment.id, status: payment.status, amountCents: payment.amountCents }
        : null,
    };
    return NextResponse.json(body);
  } catch (err) {
    return toHttpError(err);
  }
}

// DELETE /api/reservations/:id — JWT required. Cancels a CONFIRMED reservation,
// voids/refunds via AXS, releases the seat (TSD/2.4 §6).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    const paymentStatus = await container.cancelReservation.execute({
      userId,
      reservationId: params.id,
    });

    const body: CancelReservationResponse = {
      reservation: { id: params.id, status: "CANCELLED" },
      payment: { status: paymentStatus },
      seat: { status: "AVAILABLE" },
    };
    return NextResponse.json(body);
  } catch (err) {
    return toHttpError(err);
  }
}
