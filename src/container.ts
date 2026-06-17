// Composition root — the ONLY place that constructs concrete adapters and wires
// them into use cases (TSD/1.1 §6). Inner layers never reference process.env or
// a concrete class. Imports Prisma, so this is server-only (do not import from
// Edge middleware — use @/infrastructure/auth/verifier there instead).
import { env } from "@/config/env";
import { prisma } from "@/infrastructure/persistence/prisma-client";
import { PrismaSeatRepository } from "@/infrastructure/persistence/prisma-seat-repository";
import { PrismaReservationRepository } from "@/infrastructure/persistence/prisma-reservation-repository";
import { PrismaPaymentRepository } from "@/infrastructure/persistence/prisma-payment-repository";
import { PrismaUserRepository } from "@/infrastructure/persistence/prisma-user-repository";
import { AxsPaymentGateway } from "@/infrastructure/payment/axs-payment-gateway";
import { SystemClock } from "@/infrastructure/system-clock";

import { ListSeatsUseCase } from "@/application/use-cases/list-seats";
import { ReserveSeatUseCase } from "@/application/use-cases/reserve-seat";
import { ConfirmPaymentUseCase } from "@/application/use-cases/confirm-payment";
import { CancelReservationUseCase } from "@/application/use-cases/cancel-reservation";
import { ProvisionUserUseCase } from "@/application/use-cases/provision-user";
import { ExpireReservationsUseCase } from "@/application/use-cases/expire-reservations";

const seats = new PrismaSeatRepository(prisma);
const reservations = new PrismaReservationRepository(prisma);
const payments = new PrismaPaymentRepository(prisma);
const users = new PrismaUserRepository(prisma);
const gateway = new AxsPaymentGateway();
const clock = new SystemClock();

export const container = {
  gateway,
  listSeats: new ListSeatsUseCase(seats),
  reserveSeat: new ReserveSeatUseCase(reservations, gateway, clock, env().SEAT_PRICE_CENTS, env().NEXT_PUBLIC_APP_URL),
  confirmPayment: new ConfirmPaymentUseCase(reservations, payments),
  cancelReservation: new CancelReservationUseCase(reservations, payments, gateway),
  provisionUser: new ProvisionUserUseCase(users),
  expireReservations: new ExpireReservationsUseCase(reservations),
} as const;
