-- Partial unique indexes — cannot be expressed in schema.prisma (TSD/1.3 §1.4).
-- One active reservation per user (at most one PENDING or CONFIRMED).
CREATE UNIQUE INDEX "uq_user_active_reservation"
  ON "reservations" ("user_id")
  WHERE status IN ('PENDING', 'CONFIRMED');

-- One active reservation per seat (last-resort guard against double-booking;
-- the SELECT FOR UPDATE transaction is the primary defence — §1.5).
CREATE UNIQUE INDEX "uq_seat_active_reservation"
  ON "reservations" ("seat_id")
  WHERE status IN ('PENDING', 'CONFIRMED');