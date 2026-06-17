"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CancelButton({ reservationId }: { reservationId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleCancel = async () => {
    if (!confirm("Cancel this reservation? Your payment will be reversed.")) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/reservations/${reservationId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Cancellation failed. Please try again.");
        return;
      }
      router.push("/");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        onClick={handleCancel}
        disabled={loading}
        className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Cancelling…" : "Cancel reservation"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
