import { prisma } from "./prisma-client";

/**
 * Test-only: free all seats back to AVAILABLE in one transaction (TSD/2.6).
 * Gated by the route handler (non-production + secret token) — never call in prod.
 */
export async function resetAllSeats(): Promise<number> {
  return prisma.$transaction(async (tx) => {
    await tx.payment.updateMany({
      where: { status: { in: ["INITIATED", "SUCCESS"] } },
      data: { status: "EXPIRED", completedAt: new Date() },
    });
    await tx.reservation.updateMany({
      where: { status: { in: ["PENDING", "CONFIRMED"] } },
      data: { status: "CANCELLED" },
    });
    const released = await tx.seat.updateMany({ data: { status: "AVAILABLE" } });
    return released.count;
  });
}
