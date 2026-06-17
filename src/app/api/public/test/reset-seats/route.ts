import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/config/env";
import { resetAllSeats } from "@/infrastructure/persistence/test-reset";

// Test-only backdoor (TSD/2.6). Double-guarded: non-production + secret token.
// Returns 404 (not 401/403) so its existence is not revealed.
export async function POST(req: NextRequest) {
  if (env().NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  const token = req.headers.get("x-test-token");
  const expected = env().TEST_RESET_TOKEN;
  if (!expected || token !== expected) {
    return new NextResponse(null, { status: 404 });
  }

  const seatsFreed = await resetAllSeats();
  return NextResponse.json({ reset: true, seatsFreed });
}
