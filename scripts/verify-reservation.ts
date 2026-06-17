/**
 * Integration check for PrismaReservationRepository against a real Postgres.
 * Run: docker compose up -d postgres && npm run db:deploy && npm run db:seed
 *      dotenv -e .env.local -- tsx scripts/verify-reservation.ts
 * Throwaway: creates + cleans up its own users/reservations.
 */
import { prisma } from "@/infrastructure/persistence/prisma-client";
import { PrismaReservationRepository } from "@/infrastructure/persistence/prisma-reservation-repository";
import {
  DuplicateReservationError,
  SeatNotAvailableError,
} from "@/domain/errors";

const repo = new PrismaReservationRepository(prisma);
let failures = 0;

function ok(name: string, cond: boolean) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
}

async function expectThrows(name: string, fn: () => Promise<unknown>, type: Function) {
  try {
    await fn();
    ok(`${name} (expected ${type.name})`, false);
  } catch (e) {
    ok(name, e instanceof type);
  }
}

function in15min() {
  return new Date(Date.now() + 15 * 60_000);
}

async function resetState() {
  await prisma.payment.deleteMany({});
  await prisma.reservation.deleteMany({});
  await prisma.seat.updateMany({ data: { status: "AVAILABLE" } });
  await prisma.user.deleteMany({ where: { email: { endsWith: "@verify.test" } } });
}

async function makeUser(tag: string) {
  return prisma.user.create({
    data: { keycloakId: `kc-${tag}-${Date.now()}`, email: `${tag}@verify.test` },
  });
}

async function main() {
  await resetState();
  const [a, b, c, d] = await Promise.all([
    makeUser("a"),
    makeUser("b"),
    makeUser("c"),
    makeUser("d"),
  ]);

  // T1 — create PENDING on seat 1
  const created = await repo.createPendingForSeat({
    userId: a.id,
    seatId: 1,
    amountCents: 1000,
    expiresAt: in15min(),
  });
  const seat1 = await prisma.seat.findUnique({ where: { id: 1 } });
  const pay1 = await prisma.payment.findUnique({ where: { reservationId: created.reservation.id } });
  ok("T1 reservation PENDING", created.reservation.status === "PENDING");
  ok("T1 seat -> PENDING", seat1?.status === "PENDING");
  ok("T1 payment INITIATED", pay1?.status === "INITIATED" && pay1?.amountCents === 1000);

  // T2 — same seat, different user -> SeatNotAvailableError (status guard)
  await expectThrows(
    "T2 seat taken -> SeatNotAvailableError",
    () => repo.createPendingForSeat({ userId: b.id, seatId: 1, amountCents: 1000, expiresAt: in15min() }),
    SeatNotAvailableError,
  );

  // T3 — same user, different seat -> DuplicateReservationError (partial unique index)
  await expectThrows(
    "T3 dup user -> DuplicateReservationError",
    () => repo.createPendingForSeat({ userId: a.id, seatId: 2, amountCents: 1000, expiresAt: in15min() }),
    DuplicateReservationError,
  );
  const seat2AfterT3 = await prisma.seat.findUnique({ where: { id: 2 } });
  ok("T3 rolled back -> seat 2 still AVAILABLE", seat2AfterT3?.status === "AVAILABLE");

  // T4 — confirm payment
  await repo.confirmAndReserveSeat(created.reservation.id, "axs-ref-123");
  const seat1C = await prisma.seat.findUnique({ where: { id: 1 } });
  const resC = await prisma.reservation.findUnique({ where: { id: created.reservation.id } });
  const payC = await prisma.payment.findUnique({ where: { reservationId: created.reservation.id } });
  ok("T4 seat -> RESERVED", seat1C?.status === "RESERVED");
  ok("T4 reservation -> CONFIRMED", resC?.status === "CONFIRMED");
  ok(
    "T4 payment -> SUCCESS + ref + completedAt",
    payC?.status === "SUCCESS" && payC?.axsTransactionRef === "axs-ref-123" && payC?.completedAt != null,
  );

  // T5 — cancel confirmed (void)
  await repo.cancelConfirmedAndReleaseSeat(created.reservation.id, "VOIDED");
  const seat1X = await prisma.seat.findUnique({ where: { id: 1 } });
  const resX = await prisma.reservation.findUnique({ where: { id: created.reservation.id } });
  const payX = await prisma.payment.findUnique({ where: { reservationId: created.reservation.id } });
  ok("T5 seat -> AVAILABLE", seat1X?.status === "AVAILABLE");
  ok("T5 reservation -> CANCELLED", resX?.status === "CANCELLED");
  ok("T5 payment -> VOIDED", payX?.status === "VOIDED");

  // T6 — fail/expire path on seat 2
  const created2 = await repo.createPendingForSeat({
    userId: b.id,
    seatId: 2,
    amountCents: 1000,
    expiresAt: in15min(),
  });
  await repo.failAndReleaseSeat(created2.reservation.id, "EXPIRED");
  const seat2X = await prisma.seat.findUnique({ where: { id: 2 } });
  const pay2X = await prisma.payment.findUnique({ where: { reservationId: created2.reservation.id } });
  ok("T6 seat -> AVAILABLE", seat2X?.status === "AVAILABLE");
  ok("T6 payment -> EXPIRED", pay2X?.status === "EXPIRED");

  // T7 — idempotency: calling fail again is a no-op (no throw, state unchanged)
  await repo.failAndReleaseSeat(created2.reservation.id, "EXPIRED");
  ok("T7 fail is idempotent (no throw)", true);

  // T8 — concurrent double-booking on seat 3: exactly one succeeds
  const results = await Promise.allSettled([
    repo.createPendingForSeat({ userId: c.id, seatId: 3, amountCents: 1000, expiresAt: in15min() }),
    repo.createPendingForSeat({ userId: d.id, seatId: 3, amountCents: 1000, expiresAt: in15min() }),
  ]);
  const fulfilled = results.filter((r) => r.status === "fulfilled").length;
  const rejected = results.filter(
    (r) => r.status === "rejected" && r.reason instanceof SeatNotAvailableError,
  ).length;
  const seat3 = await prisma.seat.findUnique({ where: { id: 3 } });
  ok("T8 exactly one concurrent reserve wins", fulfilled === 1 && rejected === 1);
  ok("T8 seat 3 -> PENDING", seat3?.status === "PENDING");

  await resetState();
  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
