-- Concurrency guards that Prisma cannot express (partial unique indexes).
-- Apply as a dedicated raw-SQL migration AFTER the initial schema migration:
--
--   npx prisma migrate dev --create-only --name add_partial_unique_indexes
--   # paste the two statements below into the generated migration.sql
--   npx prisma migrate dev
--
-- See documentation/TSD/1.3. Database Schema.md §1.4.

-- One active reservation per user (at most one PENDING or CONFIRMED at a time).
CREATE UNIQUE INDEX uq_user_active_reservation
  ON reservations (user_id)
  WHERE status IN ('PENDING', 'CONFIRMED');

-- One active reservation per seat (last-resort guard against double-booking;
-- the SELECT FOR UPDATE transaction is the primary defence — §1.5).
CREATE UNIQUE INDEX uq_seat_active_reservation
  ON reservations (seat_id)
  WHERE status IN ('PENDING', 'CONFIRMED');
