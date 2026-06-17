# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current State

The project is **scaffolded and building** — a Clean-Architecture Next.js 14 app with Docker Compose (Postgres + Keycloak), Prisma, and Auth.js. The read path and auth work end-to-end; the reservation/payment write paths are stubbed. `documentation/` remains the source of truth — conform to the specs; if you deviate, update the corresponding doc.

- `REQUIREMENT.md` — the original assessment scenario (3 seats, auth, payment, 90-day session).
- `documentation/SAD/` — Solution Architecture: high-level design, target architecture, and ADRs (language, DB, caching, auth, payment).
- `documentation/TSD/` — Technical Specification, the implementation blueprints. Two sections: **1. General** (`1.1`–`1.7`: project architecture, current (early-stage) architecture, DB schema, API spec, auth setup, payment integration, environment config — the foundations and static contracts) and **2. Critical Flows** (`2.1`–`2.6`: authentication, list of seats, reserve seat, payment & callback, expired-payment cleanup, plus a gated test backdoor — the runtime sequences, state transitions, and error paths).

Read the relevant TSD doc before implementing any layer — they contain exact Prisma models, SQL, route contracts, and code snippets the implementation must match.

## Implementation Status

**Done and verified** (`npm run typecheck` green):
- Project scaffold: Next.js 14 (strict TS), Tailwind, ESLint, `docker-compose.yml` (Postgres 16 + Keycloak 25), `.env.example`.
- Clean Architecture tree under `src/` (`domain/`, `application/{ports,use-cases}`, `infrastructure/`, `app/`), `container.ts` composition root, `config/env.ts` (zod).
- Prisma: `schema.prisma` + migrations (`init` + `add_partial_unique_indexes`) + `seed.ts` (3 seats).
- Read path: `GET /api/public/seats` + SSR seat page (`ListSeats` → `PrismaSeatRepository`).
- Auth: Auth.js (NextAuth v5) Keycloak provider, login/logout, Edge session middleware (forwards `x-user-id`), first-sign-in provisioning via `ProvisionUser`.
- **Reservation write transactions** — `PrismaReservationRepository.{createPendingForSeat,confirmAndReserveSeat,failAndReleaseSeat,cancelConfirmedAndReleaseSeat,expireOverdue}` (`$transaction` + `SELECT ... FOR UPDATE`, `FOR UPDATE SKIP LOCKED` for cleanup). Integration-verified via `npm run verify:reservation`.
- **AXS adapter** — `AxsPaymentGateway`: JWE payment link (`buildPaymentPageUrl`), JWE webhook decryption (`decryptWebhook`), void-first/refund-on-failure (`reversePayment`). Gated test-reset endpoint (`/api/public/test/reset-seats`).
- **Expiry cleanup job** — `src/instrumentation.ts` (5-min in-process `setInterval`, runs once at boot) + `GET /api/public/cron/cleanup-expired` (manually triggerable, guarded by `x-cron-secret`). Spec: `TSD/2.5`. Production deployment requires Option B/C (Docker Compose cron or AWS EventBridge) per `TSD/2.5 §2`.
- **Reservation/payment UI** — SSR seat page with `ReserveButton` (client component → `POST /api/reservations` → `window.location.href = redirectUrl`); error banners for `?error=payment_failed`/`payment_cancelled`; `/reservation/confirmed` page (SSR — shows CONFIRMED details or PENDING "refresh" state); `CancelButton` (client component → `DELETE /api/reservations/:id`). `GET /api/reservations/:id` added for polling.

**Deferred (not blocking current stage):**
- **Void/refund AXS network calls** — `reversePayment` makes real `fetch` calls to `AXS_API_BASE_URL`. Requires live AXS sandbox credentials to exercise. Code is complete; credentials are the blocker.
- **Mock AXS payment page** — a local page that decrypts the JWE payment link, shows Pay/Fail buttons, POSTs a JWE webhook, then redirects to `successUrl`/`failUrl`. Required to test the full flow without real AXS credentials.
- **Keycloakify login theme** — `src/keycloak-theme/` (`TSD/1.5 §3.7`). Keycloak's default login UI works until then.
- **Tests** — use-case unit tests with in-memory fakes; promote `scripts/verify-reservation.ts` into the integration suite; e2e.

When scaling, revisit the auth **revocation/rolling-session caveats** in `TSD/2.1 §2` (consider Auth.js DB session strategy). Run `npm run db:migrate`/`db:seed` against `docker compose up -d`; see `README.md`.

## What This System Is

The **Linkz Seat Reservation Platform**: a public web app where anyone can view 3 seats, but only authenticated users can reserve one, and reserving requires completing a payment. Every architectural choice is deliberately made to scale from these 3 fixed seats to a 100K-CCU multi-venue platform *without a rewrite* (see `SAD/1.1. Target Architecture.md`) — keep that incremental-evolution constraint in mind when implementing.

## Intended Stack

Single Next.js 14 (App Router) project, TypeScript strict mode end-to-end:
- **Architecture**: Clean Architecture — domain entities and use cases are isolated from controllers (Route Handlers), frameworks, and I/O (Prisma, Keycloak, AXS) behind ports/interfaces. Dependencies point inward; the domain knows nothing about the wiring. See `TSD/1.1. Project Architecture.md`.
- **Frontend/Backend**: Next.js — SSR for the public seat view, Route Handlers under `src/app/api/` for the API.
- **DB**: PostgreSQL via Prisma ORM.
- **Auth**: self-hosted Keycloak (OIDC) via **Auth.js (NextAuth v5)** Keycloak provider; encrypted session cookie (JWT strategy, no session table). `src/middleware.ts` (Edge) reads the session and forwards `x-user-id` to handlers. Login UI will be a Keycloakify React/Tailwind theme under `src/keycloak-theme/`.
- **Cache**: None at this stage — seat reads hit PostgreSQL directly (3 seats, low volume; a cache is unjustified cost/complexity). A Redis cache is introduced behind a `CacheProvider` port only when volume justifies it. See `SAD/2.3. ADR - Caching.md`.
- **Payment**: AXS Checkout (redirect-based hosted payment page) — the app never handles card data.

## Commands (per TSD §5.4 — for the future implementation)

```bash
docker-compose up -d        # Start Postgres + Keycloak locally
npm install
npx prisma migrate dev      # Apply DB migrations
npx prisma db seed          # Seed the 3 seats (IDs 1,2,3)
npx keycloakify build       # Build the Keycloak login theme .jar (first time)
npm run dev                 # Start Next.js dev server on :3000
ngrok http 3000             # Expose /api/public/payment/callback so AXS sandbox can deliver webhooks
```

`prisma migrate deploy` is used for staging/production. Local config lives in `.env.local` (full reference in `TSD/1.7. Environment & Configuration.md`); in AWS, secrets come from Secrets Manager.

## Core Domain Invariants (do not break these)

These are the heart of the design — most bugs in this system would be violations of one of them:

1. **A seat is only RESERVED after payment is confirmed**, never at selection time. Selection moves a seat to `PENDING`.
2. **One active reservation per user AND per seat**, enforced at the DB level by partial unique indexes (`WHERE status IN ('PENDING','CONFIRMED')`) — see `TSD/1.3. Database Schema.md §1.4`. These cannot be expressed in the Prisma schema; they require a raw SQL migration.
3. **Reservation writes run inside a `SELECT FOR UPDATE` transaction** on the seat row (`§1.5`) — this prevents double-booking. The partial unique index is the last-resort guard.
4. **`PENDING` reservations expire after 15 minutes** (aligned with AXS's max payment-page session). A per-minute cleanup job (`§1.6`) cancels expired PENDINGs and releases their seats.
5. **Payment outcome is authenticated by JWE decryption, never browser query params.** The AXS webhook body is a JWE compact serialisation encrypted with `AXS_API_SECRET`. Any forged or tampered payload fails `compactDecrypt` and is rejected with 401 before any DB access. Webhooks must be idempotent — terminal payment states must not be re-applied (`TSD/1.6 §4.4`–`§4.5`).
6. **No cache at this stage** — seat availability is read directly from PostgreSQL, so reads are always fresh and there is no invalidation to maintain (see `SAD/2.3. ADR - Caching.md`). Don't add a cache/eviction layer without revisiting that ADR.
7. The schema is **seat-count agnostic** — adding seats means adding seed rows, not migrating schema. Don't hardcode "3" into domain logic.

### State machines

```
seats:        AVAILABLE → PENDING → RESERVED → (cancel) → AVAILABLE
                              └──── (fail/expire) ──────→ AVAILABLE
reservations: PENDING → CONFIRMED → CANCELLED   (or PENDING → CANCELLED on fail/expire)
payments:     INITIATED → SUCCESS → VOIDED | REFUNDED   (or INITIATED → FAILED)
```

Cancellation of a CONFIRMED reservation calls AXS **void** (same-day, before settlement cutoff) or **refund** (after settlement) — logic in `TSD/1.6. §4.7`.

## API Surface (TSD §1.4)

| Method | Path | Auth |
|--------|------|------|
| `GET` | `/api/public/seats` | Public |
| `POST` | `/api/reservations` | JWT — creates PENDING + initiates AXS payment, returns redirect URL |
| `GET` | `/api/reservations/:id` | JWT — poll reservation/payment status |
| `DELETE` | `/api/reservations/:id` | JWT — cancel + void/refund + release seat |
| `POST` | `/api/public/payment/callback` | JWE self-guarded — AXS server-to-server webhook |
| `GET` | `/api/public/cron/cleanup-expired` | `x-cron-secret` self-guarded — manual expiry trigger |
| `POST` | `/api/public/test/reset-seats` | `x-test-token` self-guarded — dev/test backdoor |

**Route layout:** all public routes live under `/api/public/` (each self-guards); `/api/auth/*` handles the OIDC handshake; everything else under `/api/*` requires a JWT session enforced by `src/middleware.ts`. Errors use the `{ error, code }` shape — codes in `TSD/1.4 §2.3`.

## Auth Specifics (TSD §1.5)

- 90-day session: Auth.js `session.maxAge = 7776000s` on top of Keycloak `SSO Session Max` / `Idle` = 7776000s. The handshake (Authorization Code + PKCE, token exchange, cookie) is handled by Auth.js — not hand-rolled. Config is split: `src/auth.config.ts` (edge-safe, used by middleware) and `src/auth.ts` (Node, Prisma-backed).
- Identity source of truth is Keycloak; the local `users` table stores a `keycloak_id` (the `sub` claim). Users are provisioned via upsert in the Auth.js `signIn` event (`ProvisionUser` use case) on first sign-in (`§3.6`).
- The Keycloakify theme reuses the main app's Tailwind config / design system — keep them unified, don't duplicate styling.
