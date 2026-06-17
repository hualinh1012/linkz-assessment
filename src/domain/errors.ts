// Domain errors carry the API error code + HTTP status so controllers can map
// them uniformly (see TSD/1.4 §2.3). The domain layer owns these meanings;
// controllers just translate. No framework imports here.

export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNPROCESSABLE"
  | "PAYMENT_INITIATION_FAILED"
  | "PAYMENT_REVERSAL_FAILED"
  | "INTERNAL";

export class DomainError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;

  constructor(message: string, code: ErrorCode, httpStatus: number) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

export class SeatNotFoundError extends DomainError {
  constructor(seatId: number) {
    super(`Seat ${seatId} does not exist`, "NOT_FOUND", 404);
  }
}

export class SeatNotAvailableError extends DomainError {
  constructor(seatId: number) {
    super(`Seat ${seatId} is not available`, "CONFLICT", 409);
  }
}

export class DuplicateReservationError extends DomainError {
  constructor() {
    super("User already holds an active reservation", "CONFLICT", 409);
  }
}

export class ReservationNotFoundError extends DomainError {
  constructor(id: string) {
    super(`Reservation ${id} not found`, "NOT_FOUND", 404);
  }
}

export class ReservationForbiddenError extends DomainError {
  constructor() {
    super("Reservation belongs to another user", "FORBIDDEN", 403);
  }
}

export class ReservationNotCancellableError extends DomainError {
  constructor() {
    super("Reservation is not in a cancellable (CONFIRMED) state", "CONFLICT", 409);
  }
}

export class PaymentNotFoundError extends DomainError {
  constructor(id: string) {
    super(`Payment ${id} not found`, "NOT_FOUND", 404);
  }
}

export class PaymentInitiationError extends DomainError {
  constructor(message = "AXS payment initiation failed") {
    super(message, "PAYMENT_INITIATION_FAILED", 502);
  }
}

export class PaymentReversalError extends DomainError {
  constructor(message = "AXS void/refund failed") {
    super(message, "PAYMENT_REVERSAL_FAILED", 502);
  }
}
