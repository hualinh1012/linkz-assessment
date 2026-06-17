// Injected so time-dependent logic (e.g. the 15-minute expiry) is testable.
export interface Clock {
  now(): Date;
}
