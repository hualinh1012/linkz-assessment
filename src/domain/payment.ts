// EXPIRED = abandoned / timed-out before completion (set by the expiry cleanup
// or a CANCELLED webhook). FAILED = AXS actively declined. See TSD/2.5 §6.
export type PaymentStatus =
  | "INITIATED"
  | "SUCCESS"
  | "FAILED"
  | "EXPIRED"
  | "VOIDED"
  | "REFUNDED";

export interface Payment {
  id: string;
  reservationId: string;
  axsTransactionRef: string | null;
  status: PaymentStatus;
  amountCents: number;
  currency: string;
  completedAt: Date | null;
}

export const TERMINAL_PAYMENT_STATUSES: ReadonlySet<PaymentStatus> = new Set([
  "SUCCESS",
  "FAILED",
  "EXPIRED",
  "VOIDED",
  "REFUNDED",
]);
