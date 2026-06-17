import { NextResponse, type NextRequest } from "next/server";
import { container } from "@/container";
import { toHttpError } from "@/lib/http/errors";

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

    return NextResponse.json({
      reservation: { id: params.id, status: "CANCELLED" },
      payment: { status: paymentStatus },
      seat: { status: "AVAILABLE" },
    });
  } catch (err) {
    return toHttpError(err);
  }
}
