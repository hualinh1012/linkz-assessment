import type { SeatStatus } from "@/domain/seat";
import type { ReservationStatus } from "@/domain/reservation";
import type { PaymentStatus } from "@/domain/payment";

// ── Shared sub-shapes ────────────────────────────────────────────────────────

export interface SeatDto {
  id: number;
  label: string;
  status: SeatStatus;
}

export interface ReservationDto {
  id: string;
  seatId: number;
  status: ReservationStatus;
  expiresAt: string; // ISO 8601
}

export interface PaymentDto {
  id: string;
  status: PaymentStatus;
  amountCents: number;
}

// ── GET /api/public/seats ────────────────────────────────────────────────────

export interface ListSeatsResponse {
  seats: SeatDto[];
}

// ── POST /api/reservations ───────────────────────────────────────────────────

export interface ReserveSeatRequest {
  seatId: number;
}

export interface ReserveSeatResponse {
  reservation: ReservationDto;
  payment: Pick<PaymentDto, "id" | "status">;
  redirectUrl: string;
}

// ── GET /api/reservations/:id ────────────────────────────────────────────────

export interface GetReservationResponse {
  reservation: ReservationDto;
  payment: PaymentDto | null;
}

// ── DELETE /api/reservations/:id ─────────────────────────────────────────────

export interface CancelReservationResponse {
  reservation: Pick<ReservationDto, "id" | "status">;
  payment: Pick<PaymentDto, "status">;
  seat: Pick<SeatDto, "status">;
}

// ── POST /api/public/payment/callback ────────────────────────────────────────

export interface PaymentCallbackResponse {
  received: boolean;
}

// ── GET /api/public/cron/cleanup-expired ─────────────────────────────────────

export interface CleanupExpiredResponse {
  released: number;
}

// ── POST /api/public/test/reset-seats ────────────────────────────────────────

export interface ResetSeatsResponse {
  reset: boolean;
  seatsFreed: number;
}
