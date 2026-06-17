import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { container } from "@/container";
import { CancelButton } from "@/components/cancel-button";

export const dynamic = "force-dynamic";

export default async function ConfirmedPage({
  searchParams,
}: {
  searchParams: { id?: string };
}) {
  const session = await auth();
  if (!session?.user) redirect("/");

  const reservationId = searchParams.id;
  if (!reservationId) redirect("/?error=payment_failed");

  const [reservation, payment, seats] = await Promise.all([
    container.reservationRepo.findById(reservationId),
    container.paymentRepo.findByReservationId(reservationId),
    container.listSeats.execute(),
  ]);

  // Not found or belongs to another user → back to home silently.
  if (!reservation || reservation.userId !== session.user.id) redirect("/");

  // Cancelled → treat as failed payment.
  if (reservation.status === "CANCELLED") redirect("/?error=payment_failed");

  const seat = seats.find((s) => s.id === reservation.seatId);
  const seatLabel = seat?.label ?? `Seat ${reservation.seatId}`;
  const amountSgd = payment ? (payment.amountCents / 100).toFixed(2) : "—";
  const isConfirmed = reservation.status === "CONFIRMED";

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
        ← Back to seats
      </Link>

      <div className="mt-8 rounded-lg border-2 border-gray-200 bg-white p-8">
        {isConfirmed ? (
          <>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-700 text-xl">
                ✓
              </span>
              <h1 className="text-2xl font-bold text-gray-900">Booking Confirmed</h1>
            </div>

            <dl className="mt-6 space-y-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Seat</dt>
                <dd className="font-medium text-gray-900">{seatLabel}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Amount paid</dt>
                <dd className="font-medium text-gray-900">SGD {amountSgd}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Reservation ID</dt>
                <dd className="font-mono text-xs text-gray-600">{reservationId}</dd>
              </div>
            </dl>

            <div className="mt-8">
              <CancelButton reservationId={reservationId} />
            </div>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-gray-900">Payment Received</h1>
            <p className="mt-3 text-gray-600">
              Your payment is being confirmed — this usually takes just a moment.
            </p>
            <p className="mt-2 text-sm text-gray-500">
              Seat: <span className="font-medium">{seatLabel}</span>
            </p>
            <div className="mt-6 flex gap-3">
              <form action={async () => { "use server"; redirect(`/reservation/confirmed?id=${reservationId}`); }}>
                <button className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700">
                  Refresh status
                </button>
              </form>
              <Link
                href="/"
                className="rounded-md border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Back to seats
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
