export type ReservationStatus = "PENDING" | "CONFIRMED" | "CANCELLED";

export interface Reservation {
  id: string;
  userId: string;
  seatId: number;
  status: ReservationStatus;
  expiresAt: Date;
  createdAt: Date;
}

// A PENDING reservation holds a seat for 15 minutes (aligned with the AXS
// Checkout maximum payment-page session). See TSD/2.3 §5 and §1.6.
export const RESERVATION_TTL_MINUTES = 15;
