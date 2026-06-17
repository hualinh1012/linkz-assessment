"use client";

import { useState } from "react";

type Step = "idle" | "confirming" | "paying" | "error";

export function ReserveButton({ seatId, seatLabel }: { seatId: number; seatLabel: string }) {
  const [step, setStep] = useState<Step>("idle");
  const [error, setError] = useState<string | null>(null);

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
        setError(
          res.status === 409
            ? "This seat is no longer available. Please choose another."
            : (data.error ?? "Something went wrong. Please try again."),
        );
        setStep("error");
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
    </>
  );
}
