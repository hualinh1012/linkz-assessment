import type { Payment } from "@/domain/payment";

export interface PaymentRepository {
  findById(id: string): Promise<Payment | null>;
  findByReservationId(reservationId: string): Promise<Payment | null>;
}
