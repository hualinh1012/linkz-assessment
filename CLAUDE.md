# CLAUDE.md — Linkz Seat Reservation Platform

Source of truth for all coding decisions. Design docs live in `documentation/` (SAD = architecture & ADRs, TSD = implementation specs). When code and a doc conflict, fix the code — or update the doc and flag it.

---

## Commands

```bash
npm run dev               # dev server at http://localhost:3000
npm run typecheck         # tsc --noEmit (run before every commit)
npm run lint              # ESLint
npm run build             # production build

npm run db:migrate        # prisma migrate dev (creates migration files)
npm run db:deploy         # prisma migrate deploy (CI / staging — no file creation)
npm run db:seed           # seed 3 seats (IDs 1, 2, 3)
npm run db:reset          # drop + re-migrate + re-seed

npm run docker:up         # start Postgres 16 + Keycloak 25
npm run docker:down

npm run verify:reservation  # integration smoke-test for the write transaction
npm run mock:axs            # local AXS webhook mock server
```

All `db:*` commands load `.env.local` via `dotenv-cli`. Never run `prisma` directly without that prefix.

---

## Architecture — Clean Architecture, strictly enforced

```
src/
  domain/           pure entities, enums, invariants, DomainError subclasses — NO imports
  application/
    ports/          interfaces (SeatRepository, PaymentGateway, Clock, …)
    use-cases/      one class per flow; depend on ports only
  infrastructure/   adapters: PrismaXxxRepository, AxsPaymentGateway, SystemClock
  app/              Next.js App Router — pages + Route Handlers (controllers only)
  config/env.ts     zod-validated env; use `env()` and `required()` — never `process.env` directly
  container.ts      composition root — ONLY place that news up adapters + wires use cases
  instrumentation.ts  server-start hook — registers the 5-min PENDING expiry timer
  middleware.ts     Edge — Auth.js session check, forwards x-user-id / x-user-email
```

**Hard rules:**
- `domain/` and `application/` must not import Prisma, `next/*`, AXS, or any I/O library.
- New external dependency → define a port in `application/ports/`, implement an adapter in `infrastructure/`, wire it in `container.ts`.
- `container.ts` must not be imported in Edge runtime (it pulls Prisma). Middleware uses `auth.config.ts` only.
- Route Handlers read `x-user-id` / `x-user-email` from request headers — they never call `auth()` or touch Prisma directly for identity.

---

## Domain invariants — never violate these

1. A seat becomes `RESERVED` only after AXS confirms payment. Selection → `PENDING` only.
2. **One active reservation per user AND one per seat** — enforced by partial unique indexes (`WHERE status IN ('PENDING','CONFIRMED')`). These cannot be expressed in the Prisma schema; they live in migration `20260617080905_add_partial_unique_indexes`. Do not remove them.
3. All reservation writes use `SELECT FOR UPDATE` on the seat row. Never write seat or reservation state outside a transaction.
4. `PENDING` reservations expire after 15 minutes (aligned with AXS payment-page session). The expiry job runs every 5 minutes via `instrumentation.ts`.
5. Webhook authenticity is established by JWE decryption (`AXS_API_SECRET`). Never trust query params or unverified request bodies for payment state changes.
6. Webhooks are idempotent — terminal payment states (`SUCCESS`, `FAILED`, `EXPIRED`, `VOIDED`, `REFUNDED`) are never re-applied.
7. No cache layer at this stage — seats read directly from PostgreSQL. See `SAD/2.3. ADR - Caching.md`.

### State machines

```
seats:        AVAILABLE → PENDING → RESERVED → (cancel) → AVAILABLE
                              └──── (fail/expire) ──────→ AVAILABLE

reservations: PENDING → CONFIRMED → CANCELLED
                    └──────────────→ CANCELLED  (fail/expire)

payments:     INITIATED → SUCCESS → VOIDED | REFUNDED
                       └──────────→ FAILED | EXPIRED
```

---

## API conventions

- Public routes: `/api/public/**` — self-guarded by their own mechanism (JWE, secret header). No session required.
- Auth handshake: `/api/auth/**` — handled by Auth.js, bypassed by middleware.
- Protected routes: everything else under `/api/**` — middleware enforces session, injects `x-user-id`.
- Error shape: `{ error: string, code: ErrorCode }`. Codes and HTTP statuses are defined in `src/domain/errors.ts` and carried by `DomainError` subclasses. Controllers call `httpErrorResponse(err)` from `src/lib/http/errors.ts`.
- Route Handlers throw `DomainError` subclasses; never return raw error strings or leak stack traces.

---

## Auth

- Auth.js (NextAuth v5) with Keycloak provider. Session strategy: `jwt` (encrypted HTTP-only cookie, 90-day `maxAge`). No session table.
- Session is validated locally with `AUTH_SECRET` — no per-request Keycloak / JWKS call.
- `src/auth.config.ts` — edge-safe config (no Prisma). Used by middleware.
- `src/auth.ts` — Node runtime. Adds `signIn` event → `ProvisionUserUseCase` (upserts `users` record on first login).
- The `users.id` PK is the Keycloak `sub` claim (UUID string), injected as `x-user-id` by middleware.
- Back-Channel Logout: `POST /api/auth/backchannel-logout` receives a Keycloak Logout Token (JWS), verifies it, upserts the user's `sub` into `revoked_sessions`, so the middleware can deny that session on the next request.

---

## Database

- Prisma schema: `prisma/schema.prisma`. Source of truth for model shape; partial unique indexes live in SQL only.
- Never alter existing columns without a migration. Run `npm run db:migrate` to generate one.
- The `users` table uses the Keycloak `sub` string as PK — not a generated UUID. Migration `20260617120000_use_keycloak_sub_as_user_id` established this.
- `revoked_sessions` table stores revoked Keycloak `sub` values. Indexed on `sub` for the middleware PK lookup. See `TSD/1.3 §1.7`.

---

## Environment variables

Validated at startup by `src/config/env.ts` (zod). Use `env()` anywhere on the server; use `required(key)` when a value is optional at boot but must exist at runtime (AXS keys). Full reference: `documentation/TSD/1.7. Environment & Configuration.md`.

Key variables:

| Variable | Notes |
|----------|-------|
| `DATABASE_URL` | Prisma connection string |
| `AUTH_SECRET` | Cookie encryption — rotate with an array for zero-downtime |
| `KEYCLOAK_ISSUER` / `KEYCLOAK_CLIENT_ID` / `KEYCLOAK_CLIENT_SECRET` | OIDC |
| `AXS_CLIENT_ID` / `AXS_API_SECRET` | Payment Page JWE + webhook decryption |
| `AXS_CHECKOUT_URL` / `AXS_API_BASE_URL` | Sandbox vs production URLs |
| `CRON_SECRET` | Guards `GET /api/public/cron/cleanup-expired` via `x-cron-secret` |
| `TEST_RESET_TOKEN` | Guards `POST /api/public/test/reset-seats` — must NOT be set in production |
| `SEAT_PRICE_CENTS` | Defaults to `1000` (SGD 10.00) |

---

## Adding a new feature — checklist

1. If a new external dependency is needed: define a port (`application/ports/`) → implement adapter (`infrastructure/`) → wire in `container.ts`.
2. If a new DB table or column: add to `prisma/schema.prisma` → run `npm run db:migrate` → partial indexes go in raw SQL if needed.
3. If a new env variable: add to `src/config/env.ts` schema → document in `TSD/1.7`.
4. New Route Handler reads identity from `request.headers.get("x-user-id")` — never from `auth()`.
5. Run `npm run typecheck` and `npm run lint` before marking done.

---

## What is not implemented yet

| Area | Notes |
|------|-------|
| Reservation / payment UI | Reserve button, AXS redirect, `/reservation/confirmed` page, cancel action |
| Keycloakify login theme | `src/keycloak-theme/` — Keycloak default UI works until then |
| Tests | Use-case unit tests with in-memory fakes; promote `scripts/verify-reservation.ts` into integration suite; e2e |
