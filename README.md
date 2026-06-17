# Linkz Seat Reservation Platform

A public seat-reservation web app: anyone can view 3 seats; authenticated users reserve one by completing an AXS Checkout payment. Built to evolve from 3 fixed seats toward a 100K-CCU platform without a rewrite.

**Design docs are the source of truth** — see [`documentation/`](./documentation) (SAD = architecture & ADRs, TSD = implementation specs) and [`CLAUDE.md`](./CLAUDE.md). Conform to them; if you deviate, update the doc.

## Stack

Next.js 14 (App Router) · TypeScript (strict) · PostgreSQL + Prisma · Keycloak (OIDC) · AXS Checkout (JWE Payment Link) · Tailwind · jose. No cache layer at this stage (see `SAD/2.3. ADR - Caching.md`).

## Architecture (Clean Architecture)

Dependencies point inward; the domain knows nothing about frameworks or I/O. See `documentation/TSD/1.1. Project Architecture.md`.

```
src/
  domain/         entities, enums, invariants, errors   (pure — no imports)
  application/
    ports/        interfaces the use cases depend on
    use-cases/    one orchestration per critical flow
  infrastructure/ adapters implementing the ports (Prisma, AXS, clock)
  app/            Next.js App Router — pages + API route handlers (controllers)
  config/         env parsing (zod)
  container.ts    composition root — the only place adapters are wired
  instrumentation.ts  server-start hook — runs the 5-min expiry cleanup timer
  middleware.ts   Edge JWT verification for protected /api routes
```

**Rule:** nothing in `domain/` or `application/` may import Prisma, the AXS client, or `next/*`. New external dependency → define a port, implement an adapter, wire it in `container.ts`.

## First-run setup

```bash
# 1. Start Postgres + Keycloak
docker compose up -d

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env.local        # see Environment Variables below

# 4. Create the schema + partial unique indexes
npm run db:migrate                # applies all pending migrations

# 5. Seed the 3 seats (IDs 1, 2, 3)
npm run db:seed

# 6. Configure Keycloak (one-time, admin console at http://localhost:8080 — admin/admin):
#    - create realm: linkz
#    - create client: linkz-web  (confidential, standard flow, PKCE S256)
#    - Valid Redirect URIs: http://localhost:3000/api/auth/callback/keycloak
#    - copy client secret → KEYCLOAK_CLIENT_SECRET in .env.local
#    - add Audience mapper so tokens carry aud=linkz-web  (TSD/1.5 §3.3)
#    - set SSO Session Max / Idle = 7776000s  (90 days)
#    - generate AUTH_SECRET:  npx auth secret

# 7. Run the dev server
npm run dev                       # http://localhost:3000

# 8. (payment flows) expose the webhook to the AXS sandbox
ngrok http 3000                   # paste the HTTPS URL as AXS_CHECKOUT_URL / webhookUrl base
```

## Environment Variables

Full reference in `documentation/TSD/1.7. Environment & Configuration.md`. Minimum set for local dev:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres connection string |
| `KEYCLOAK_ISSUER` | `http://localhost:8080/realms/linkz` |
| `KEYCLOAK_CLIENT_ID` | `linkz-web` |
| `KEYCLOAK_CLIENT_SECRET` | from Keycloak admin |
| `AUTH_SECRET` | `npx auth secret` |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` |
| `SEAT_PRICE_CENTS` | defaults to `1000` (SGD 10.00) |
| `AXS_CLIENT_ID` | AXS merchant client ID |
| `AXS_MERCHANT_LINK_ID` | AXS payment link identifier |
| `AXS_API_SECRET` | shared secret for JWE (payment link + webhook) |
| `AXS_API_KEY` | bearer token for void/refund API calls |
| `AXS_CHECKOUT_URL` | `https://checkout.svc.uat.pay.axs.com.sg` (sandbox) |
| `AXS_API_BASE_URL` | `https://api.svc.uat.axsasia.com` (sandbox) |
| `CRON_SECRET` | protects `GET /api/public/cron/cleanup-expired` |
| `TEST_RESET_TOKEN` | enables `POST /api/public/test/reset-seats` (non-production only) |

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Next.js dev server |
| `npm run build` / `start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run db:migrate` | Prisma migrate dev |
| `npm run db:deploy` | Prisma migrate deploy (CI/staging) |
| `npm run db:seed` | Seed the 3 seats |
| `npm run db:reset` | Drop + re-migrate + re-seed |
| `npm run docker:up` / `docker:down` | Docker Compose up/down |
| `npm run verify:reservation` | Integration smoke-test for the reservation write transaction (requires running Postgres) |

## Implementation status

### Done

| Area | What's implemented |
|------|--------------------|
| **Scaffold** | Next.js 14 strict TS, Tailwind, ESLint, Docker Compose (Postgres 16 + Keycloak 25), `.env.example` |
| **Clean Architecture** | Full layer tree (`domain/`, `application/`, `infrastructure/`, `app/`), composition root, zod env config |
| **Database** | Prisma schema, migrations (`init` + `add_partial_unique_indexes`), `seed.ts` (3 seats) |
| **Read path** | `GET /api/public/seats` + SSR seat page (`ListSeats` → `PrismaSeatRepository`) |
| **Auth** | Auth.js (NextAuth v5) Keycloak provider, login/logout, Edge session middleware (forwards `x-user-id`), first-sign-in user provisioning (`ProvisionUser`) |
| **Reservation writes** | `PrismaReservationRepository`: `createPendingForSeat` / `confirmAndReserveSeat` / `failAndReleaseSeat` / `cancelConfirmedAndReleaseSeat` — all inside `SELECT FOR UPDATE` transactions, partial-index violations → domain errors, idempotent. Integration-verified via `npm run verify:reservation`. |
| **AXS payment link** | `AxsPaymentGateway.buildPaymentPageUrl` — JWE (`PBES2-HS512+A256KW` / `A256GCM`) encrypted payload with `clientId`, `amount`, `merchantRef`, `webhookUrl`, `successUrl`, `failUrl` |
| **AXS webhook handler** | `AxsPaymentGateway.decryptWebhook` — `compactDecrypt` with `AXS_API_SECRET`; `POST /api/public/payment/callback` authenticates via JWE decryption, then calls `ConfirmPaymentUseCase` (idempotent) |
| **AXS void / refund** | `AxsPaymentGateway.reversePayment` — void-first, refund-on-failure; `DELETE /api/reservations/:id` calls `CancelReservationUseCase` |
| **Expiry cleanup** | `instrumentation.ts` — 5-min in-process timer (dev/testing); `GET /api/public/cron/cleanup-expired` — manually-triggerable endpoint for testing and external schedulers. See TSD/2.5 §2 for production options (Docker Compose cron / AWS EventBridge). |
| **Test backdoor** | `POST /api/public/test/reset-seats` — resets all seats to AVAILABLE (non-production, token-gated) |

### Remaining

| # | Area | Notes |
|---|------|-------|
| 1 | **Reservation/payment UI** | Seat "Reserve" button → `POST /api/reservations` → redirect to AXS; `/reservation/confirmed` page; cancel action; **mock AXS payment page** (redirects to successUrl/failUrl and POSTs a JWE webhook) |
| 2 | **Keycloakify login theme** | `src/keycloak-theme/` — Keycloak's default login UI works until then (TSD/1.5 §3.7) |
| 3 | **Tests** | Use-case unit tests with in-memory fakes; promote `scripts/verify-reservation.ts` into the integration suite; e2e |

## API surface

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/public/seats` | Public | List all seats with status |
| `POST` | `/api/reservations` | JWT | Create PENDING reservation + return AXS redirect URL |
| `GET` | `/api/reservations/:id` | JWT | Poll reservation + payment status |
| `DELETE` | `/api/reservations/:id` | JWT | Cancel CONFIRMED reservation (void/refund + release seat) |
| `POST` | `/api/public/payment/callback` | JWE (self-guarded) | AXS webhook — decrypts payload, updates seat/reservation/payment state |
| `GET` | `/api/public/cron/cleanup-expired` | `x-cron-secret` (self-guarded) | Trigger expiry cleanup manually |
| `POST` | `/api/public/test/reset-seats` | `x-test-token` (self-guarded) | Reset all seats (non-production only) |

Route layout: all public routes live under `/api/public/` and self-guard with their own mechanism; `/api/auth/*` handles the OIDC handshake; everything else under `/api/*` requires a JWT session (`x-user-id` header set by `src/middleware.ts`). Errors use `{ error, code }` — codes in `TSD/1.4 §2.3`.

## Core domain invariants

These are the heart of the design — most bugs in this system would be a violation of one of them:

1. **A seat is only RESERVED after payment is confirmed**, never at selection time. Selection moves a seat to `PENDING`.
2. **One active reservation per user AND per seat**, enforced at DB level by partial unique indexes (`WHERE status IN ('PENDING','CONFIRMED')`) — `TSD/1.3 §1.4`. Cannot be expressed in Prisma schema; applied via raw SQL migration.
3. **Reservation writes run inside a `SELECT FOR UPDATE` transaction** on the seat row — prevents double-booking. The partial unique index is the last-resort guard.
4. **`PENDING` reservations expire after 15 minutes** (aligned with AXS's max payment-page session). A cleanup job cancels expired PENDINGs and releases their seats every 5 minutes.
5. **Payment outcome is authorised by JWE decryption, never by query params.** The AXS webhook body is a JWE compact serialisation encrypted with `AXS_API_SECRET`. Any forged or tampered payload fails decryption and is rejected with 401 before any DB access. Webhooks are idempotent — terminal payment states are not re-applied.
6. **No cache at this stage** — seat availability is read directly from PostgreSQL, always fresh, no invalidation needed (see `SAD/2.3. ADR - Caching.md`).
7. The schema is **seat-count agnostic** — adding seats means adding seed rows, not migrating schema.

### State machines

```
seats:        AVAILABLE → PENDING → RESERVED → (cancel) → AVAILABLE
                              └──── (fail/expire) ──────→ AVAILABLE
reservations: PENDING → CONFIRMED → CANCELLED   (or PENDING → CANCELLED on fail/expire)
payments:     INITIATED → SUCCESS → VOIDED | REFUNDED
                       └──────────→ FAILED | EXPIRED
```

Cancellation of a CONFIRMED reservation calls AXS **void** (pre-settlement) or **refund** (post-settlement) — `TSD/1.6 §4.6`.

## Auth specifics

- 90-day session: Auth.js `session.maxAge = 7776000s` + Keycloak `SSO Session Max / Idle = 7776000s`. The OAuth2 Authorization Code + PKCE handshake is handled entirely by Auth.js.
- Identity source of truth is Keycloak; the local `users` table stores `keycloak_id` (the `sub` claim). Users are provisioned via upsert in the Auth.js `signIn` event (`ProvisionUser` use case) on first sign-in.
- Config is split: `src/auth.config.ts` (edge-safe, used by middleware) and `src/auth.ts` (Node-only, Prisma-backed).
- See `TSD/2.1 §2` for revocation/rolling-session caveats if switching to a DB session strategy later.
