"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Step = "idle" | "confirming" | "paying" | "error";

export function ReserveButton({ seatId, seatLabel }: { seatId: number; seatLabel: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);
  const [seatTaken, setSeatTaken] = useState(false);

  function openDialog() {
    setError(null);
    setStep("confirming");
  }

  function closeDialog() {
    setStep("idle");
    setError(null);
  }

  async function handleProceed() {
    setStep("paying");
    setError(null);

    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seatId }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          // Close the confirm dialog and show the unavailable notice first.
          // router.refresh() is deferred to when the user dismisses the notice —
          // calling it here would unmount this component before seatTaken renders.
          closeDialog();
          setSeatTaken(true);
        } else {
          setError(data.error ?? "Something went wrong. Please try again.");
          setStep("error");
        }
        return;
      }

      // API confirmed — now redirect. Navigation only happens after the
      // reservation and payment record are created.
      window.location.href = data.redirectUrl;
    } catch {
      setError("Network error. Please try again.");
      setStep("error");
    }
  }

  return (
    <>
      <button
        onClick={openDialog}
        className="mt-4 w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
      >
        Reserve
      </button>

      {/* Confirm / paying dialog */}
      {step !== "idle" && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={(e) => { if (e.target === e.currentTarget && step !== "paying") closeDialog(); }}
        >
          <div className="w-full max-w-sm rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl mx-4">
            <h2 className="text-lg font-semibold text-gray-900">Reserve {seatLabel}?</h2>
            <p className="mt-2 text-sm text-gray-500">
              Your seat will be held for 15 minutes while you complete payment.
            </p>

            {error && (
              <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            <div className="mt-6 flex flex-col gap-2">
              <button
                onClick={handleProceed}
                disabled={step === "paying"}
                className="w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {step === "paying" ? "Creating reservation…" : "Proceed to payment"}
              </button>
              <button
                onClick={closeDialog}
                disabled={step === "paying"}
                className="w-full rounded-lg border border-gray-200 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Choose another seat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Seat unavailable notice — shown after a 409, confirm dialog already closed */}
      {seatTaken && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={(e) => { if (e.target === e.currentTarget) { setSeatTaken(false); router.refresh(); } }}
        >
          <div className="w-full max-w-sm rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl mx-4">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 text-xl">
                !
              </span>
              <h2 className="text-lg font-semibold text-gray-900">Seat no longer available</h2>
            </div>
            <p className="mt-3 text-sm text-gray-500">
              <strong>{seatLabel}</strong> was just taken by someone else. Please choose a different seat.
            </p>
            <button
              onClick={() => { setSeatTaken(false); router.refresh(); }}
              className="mt-6 w-full rounded-lg bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-gray-700"
            >
              Choose another seat
            </button>
          </div>
        </div>
      )}
    </>
  );
}
