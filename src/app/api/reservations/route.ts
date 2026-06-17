import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { container } from "@/container";
import { toHttpError } from "@/lib/http/errors";

const bodySchema = z.object({ seatId: z.number().int().positive() });

// POST /api/reservations — JWT required (middleware sets x-user-id).
export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get("x-user-id");
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
    }

    const parsed = bodySchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", code: "UNPROCESSABLE" },
        { status: 422 },
      );
    }

    const result = await container.reserveSeat.execute({ userId, seatId: parsed.data.seatId });

    return NextResponse.json(
      {
        reservation: {
          id: result.reservation.id,
          seatId: result.reservation.seatId,
          status: result.reservation.status,
          expiresAt: result.reservation.expiresAt.toISOString(),
        },
        payment: { id: result.paymentId, status: "INITIATED" },
        redirectUrl: result.redirectUrl,
      },
      { status: 201 },
    );
  } catch (err) {
    return toHttpError(err);
  }
}
