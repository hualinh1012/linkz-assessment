import { NextResponse } from "next/server";
import { container } from "@/container";
import { toHttpError } from "@/lib/http/errors";

// Public, SSR-friendly. Reads directly from PostgreSQL (no cache — SAD/2.3).
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const seats = await container.listSeats.execute();
    return NextResponse.json({ seats });
  } catch (err) {
    return toHttpError(err);
  }
}
