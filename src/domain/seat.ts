// Domain entity — pure TypeScript, no framework or I/O imports.
export type SeatStatus = "AVAILABLE" | "PENDING" | "RESERVED";

export interface Seat {
  id: number;
  label: string;
  status: SeatStatus;
}
