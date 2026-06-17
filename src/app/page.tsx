import Link from "next/link";
import { auth, signIn, signOut } from "@/auth";
import { container } from "@/container";
import { ReserveButton } from "@/components/reserve-button";
import { DevPanel } from "@/components/dev-panel";
import type { SeatStatus } from "@/domain/seat";

// SSR the public seat view — always read fresh from PostgreSQL (no cache).
export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<SeatStatus, string> = {
  AVAILABLE: "border-green-500 bg-green-50 text-green-800",
  PENDING: "border-amber-500 bg-amber-50 text-amber-800",
  RESERVED: "border-gray-400 bg-gray-100 text-gray-500",
};

const ERROR_MESSAGES: Record<string, string> = {
  payment_failed: "Your payment could not be completed. The seat has been released — please try again.",
  payment_cancelled: "Payment was cancelled. The seat has been released.",
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const [seats, session] = await Promise.all([container.listSeats.execute(), auth()]);
  const isLoggedIn = !!session?.user;

  const activeReservation = isLoggedIn
    ? await container.reservationRepo.findActiveByUserId(session!.user!.id!)
    : null;

  const allTaken = seats.length > 0 && seats.every((s) => s.status !== "AVAILABLE");
  const errorMessage = searchParams.error ? ERROR_MESSAGES[searchParams.error] : null;

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Linkz Seat Reservation</h1>
          <p className="mt-2 text-gray-600">
            Anyone can view availability. Sign in to reserve a seat.
          </p>
        </div>
        {isLoggedIn ? (
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <div className="text-right text-sm text-gray-600">{session.user.email}</div>
            <button className="mt-1 rounded-md border px-3 py-1 text-sm hover:bg-gray-100">
              Sign out
            </button>
          </form>
        ) : (
          <form
            action={async () => {
              "use server";
              await signIn("keycloak", { redirectTo: "/" });
            }}
          >
            <button className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700">
              Sign in
            </button>
          </form>
        )}
      </div>

      {errorMessage && (
        <div className="mt-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {errorMessage}
        </div>
      )}

      {allTaken && !errorMessage && (
        <p className="mt-6 rounded-md bg-gray-200 px-4 py-3 font-medium text-gray-700">
          Sold Out
        </p>
      )}

      <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {seats.map((seat) => {
          const isMysSeat = activeReservation?.seatId === seat.id;
          const hasActiveReservation = !!activeReservation;

          return (
            <li
              key={seat.id}
              className={`rounded-lg border-2 p-6 text-center transition-shadow ${
                isMysSeat
                  ? "border-blue-500 bg-blue-50 ring-2 ring-blue-400 ring-offset-2 shadow-md"
                  : STATUS_STYLES[seat.status]
              }`}
            >
              <div className="text-lg font-semibold">{seat.label}</div>
              <div className={`mt-1 text-sm uppercase tracking-wide ${isMysSeat ? "text-blue-700" : ""}`}>
                {seat.status}
              </div>

              {isMysSeat && (
                <div className="mt-3 flex flex-col items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
                    ★ Your reservation
                  </span>
                  <Link
                    href={`/reservation/confirmed?id=${activeReservation.id}`}
                    className="text-xs text-blue-600 underline hover:text-blue-800"
                  >
                    View details →
                  </Link>
                </div>
              )}

              {!isMysSeat && seat.status === "AVAILABLE" && isLoggedIn && !hasActiveReservation && (
                <ReserveButton seatId={seat.id} seatLabel={seat.label} />
              )}

              {!isMysSeat && seat.status === "AVAILABLE" && isLoggedIn && hasActiveReservation && (
                <p className="mt-4 text-xs text-gray-400">You already have a reservation</p>
              )}

              {seat.status === "AVAILABLE" && !isLoggedIn && (
                <p className="mt-4 text-xs text-green-700">Sign in to reserve</p>
              )}
            </li>
          );
        })}
      </ul>

      <DevPanel />
    </main>
  );
}
