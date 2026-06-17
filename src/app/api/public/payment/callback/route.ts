import { NextResponse, type NextRequest } from "next/server";
import { container } from "@/container";
import { toHttpError } from "@/lib/http/errors";

// POST — AXS server-to-server webhook (JWE-encrypted body, idempotent). TSD/2.4 §3.
export async function POST(req: NextRequest) {
  const raw = await req.text();

  // Authentication: JWE decryption. Any tampered or forged payload fails here.
  // In non-production the mock server sends plain JSON — accepted as a fallback.
  let payload: Awaited<ReturnType<typeof container.gateway.decryptWebhook>>;
  try {
    payload = await container.gateway.decryptWebhook(raw);
  } catch {
    if (process.env.NODE_ENV !== "production") {
      try {
        payload = JSON.parse(raw);
      } catch {
        return NextResponse.json(
          { error: "Invalid webhook", code: "UNAUTHORIZED" },
          { status: 401 },
        );
      }
    } else {
      return NextResponse.json(
        { error: "Invalid webhook", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }
  }

  try {
    await container.confirmPayment.execute({
      paymentId: payload.merchantRef,
      transactionRef: payload.transactionRef,
      status: payload.status,
    });
    return NextResponse.json({ received: true });
  } catch (err) {
    return toHttpError(err);
  }
}
