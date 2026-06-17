import type { Seat } from "@/domain/seat";

export interface SeatRepository {
  listAll(): Promise<Seat[]>;
  findById(id: number): Promise<Seat | null>;
}
