import type { Seat } from "@/domain/seat";
import type { SeatRepository } from "@/application/ports/seat-repository";

/**
 * Reads seat availability directly from the repository (PostgreSQL).
 * There is no cache at this stage — see SAD/2.3. ADR - Caching.
 */
export class ListSeatsUseCase {
  constructor(private readonly seats: SeatRepository) {}

  execute(): Promise<Seat[]> {
    return this.seats.listAll();
  }
}
