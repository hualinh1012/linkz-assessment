import { redirect } from "next/navigation";
import { resetAllSeats } from "@/infrastructure/persistence/test-reset";

/**
 * Rendered only outside production. Provides one-click test data controls
 * so the full reservation → payment → confirmation flow can be re-tested
 * without manually clearing the database.
 */
export async function DevPanel() {
  if (process.env.NODE_ENV === "production") return null;

  async function handleReset() {
    "use server";
    await resetAllSeats();
    redirect("/");
  }

  return (
    <div className="mt-16 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50 p-6">
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <span className="rounded bg-amber-400 px-2 py-0.5 text-xs font-bold uppercase tracking-widest text-amber-900">
          Dev only
        </span>
        <span className="text-sm font-semibold text-amber-900">Testing tools</span>
      </div>

      <p className="mb-5 text-sm text-amber-800">
        These controls exist only in development and staging. They are stripped
        from production builds. Do not rely on them for anything outside local
        testing.
      </p>

      <div className="flex flex-wrap gap-3">
        {/* Reset seats */}
        <form action={handleReset}>
          <button
            type="submit"
            className="rounded-lg border border-amber-400 bg-white px-4 py-2 text-sm font-medium text-amber-900 shadow-sm hover:bg-amber-100 active:scale-95 transition-transform"
          >
            ↺ Reset all seats
          </button>
        </form>
      </div>

      <p className="mt-4 text-xs text-amber-700">
        <strong>Reset all seats</strong> — cancels every active reservation and
        payment, sets all seats back to AVAILABLE. Useful for re-running the
        full reserve → pay → confirm flow from scratch.
      </p>
    </div>
  );
}
