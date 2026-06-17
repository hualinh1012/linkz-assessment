// DEV / TESTING ONLY — see TSD/2.5 §2.
// In a real deployment use an external scheduler (Docker Compose cron service or
// AWS EventBridge) so the job runs independently of the app process and scales
// correctly across multiple instances. This in-process approach is convenient for
// local development and single-instance staging but is NOT the production pattern.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

  const { container } = await import("@/container");

  const run = async () => {
    try {
      const released = await container.expireReservations.execute();
      if (released > 0) {
        console.log(`[cleanup] Released ${released} expired reservation(s)`);
      }
    } catch (err) {
      console.error("[cleanup] Expiry job failed:", err);
    }
  };

  // Run once at boot (catches anything that expired while the server was down),
  // then repeat every 5 minutes.
  void run();
  setInterval(run, INTERVAL_MS);
}
