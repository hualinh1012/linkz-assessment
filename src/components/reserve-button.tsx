"use client";

import { useState } from "react";

export function ReserveButton({ seatId }: { seatId: number }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleReserve = async () => {
    setLoading(true);
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
            ? "This seat is no longer available."
            : (data.error ?? "Something went wrong. Please try again."),
        );
        return;
      }

      window.location.href = data.redirectUrl;
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-4 space-y-2">
      <button
        onClick={handleReserve}
        disabled={loading}
        className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Reserving…" : "Reserve"}
      </button>
      {error && <p className="text-center text-xs text-red-600">{error}</p>}
    </div>
  );
}
