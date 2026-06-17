import { NextResponse } from "next/server";
import { DomainError, type ErrorCode } from "@/domain/errors";

export interface ApiError {
  error: string;
  code: ErrorCode;
}

/**
 * Maps a thrown error to the `{ error, code }` response shape (TSD/1.4 §2.3).
 * Domain errors carry their own code + status; anything else is a 500 INTERNAL.
 */
export function toHttpError(err: unknown): NextResponse<ApiError> {
  if (err instanceof DomainError) {
    return NextResponse.json({ error: err.message, code: err.code }, { status: err.httpStatus });
  }
  // Avoid leaking internals; log server-side.
  console.error("Unhandled error:", err);
  return NextResponse.json(
    { error: "Internal server error", code: "INTERNAL" },
    { status: 500 },
  );
}
