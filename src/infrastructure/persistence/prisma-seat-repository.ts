import type { PrismaClient } from "@prisma/client";
import type { Seat } from "@/domain/seat";
import type { SeatRepository } from "@/application/ports/seat-repository";

export class PrismaSeatRepository implements SeatRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listAll(): Promise<Seat[]> {
    const rows = await this.prisma.seat.findMany({ orderBy: { id: "asc" } });
    return rows.map((r) => ({ id: r.id, label: r.label, status: r.status }));
  }

  async findById(id: number): Promise<Seat | null> {
    const r = await this.prisma.seat.findUnique({ where: { id } });
    return r ? { id: r.id, label: r.label, status: r.status } : null;
  }
}
