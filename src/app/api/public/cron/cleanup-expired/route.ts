// DEV / TESTING convenience endpoint — manually trigger the expiry cleanup
// without waiting for the 5-minute instrumentation.ts interval.
//
// In a real deployment this route is called by an external scheduler
// (Docker Compose cron service or AWS EventBridge). See TSD/2.5 §2.
//
// Protected by x-cron-secret header; returns 404 if the secret is not
// configured so the route's existence is not revealed.
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/config/env";
import { container } from "@/container";
import type { CleanupExpiredResponse } from "@/lib/http/dto";

export async function GET(req: NextRequest) {
  const secret = env().CRON_SECRET;
  if (!secret || req.headers.get("x-cron-secret") !== secret) {
    return new NextResponse(null, { status: 404 });
  }

  const released = await container.expireReservations.execute();
  const body: CleanupExpiredResponse = { released };
  return NextResponse.json(body);
}
