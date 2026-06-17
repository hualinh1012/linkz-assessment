import type { PrismaClient } from "@prisma/client";
import type { Payment } from "@/domain/payment";
import type { PaymentRepository } from "@/application/ports/payment-repository";

export class PrismaPaymentRepository implements PaymentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<Payment | null> {
    const r = await this.prisma.payment.findUnique({ where: { id } });
    return r ? toDomain(r) : null;
  }

  async findByReservationId(reservationId: string): Promise<Payment | null> {
    const r = await this.prisma.payment.findUnique({ where: { reservationId } });
    return r ? toDomain(r) : null;
  }
}

function toDomain(r: {
  id: string;
  reservationId: string;
  axsTransactionRef: string | null;
  status: Payment["status"];
  amountCents: number;
  currency: string;
  completedAt: Date | null;
}): Payment {
  return {
    id: r.id,
    reservationId: r.reservationId,
    axsTransactionRef: r.axsTransactionRef,
    status: r.status,
    amountCents: r.amountCents,
    currency: r.currency,
    completedAt: r.completedAt,
  };
}
