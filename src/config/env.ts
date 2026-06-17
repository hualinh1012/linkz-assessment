// Server-side environment access, validated with zod.
// Do NOT import this from client components — it reads secrets.
// AXS_* are optional so the auth middleware (which doesn't need them) never
// fails to boot; the AXS adapter asserts its own required vars when used.
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().min(1),

  // Keycloak OIDC (Auth.js Keycloak provider)
  KEYCLOAK_ISSUER: z.string().url(),
  KEYCLOAK_CLIENT_ID: z.string().min(1),
  KEYCLOAK_CLIENT_SECRET: z.string().min(1),

  // Auth.js session-cookie encryption secret
  AUTH_SECRET: z.string().min(1),

  // App
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  SEAT_PRICE_CENTS: z.coerce.number().int().positive().default(1000),

  // AXS Checkout (optional at boot; required by the payment adapter at runtime)
  AXS_CLIENT_ID: z.string().optional(),
  AXS_MERCHANT_LINK_ID: z.string().optional(),
  AXS_API_KEY: z.string().optional(),
  AXS_API_SECRET: z.string().optional(),
  AXS_CHECKOUT_URL: z.string().url().optional(),
  AXS_API_BASE_URL: z.string().url().optional(),

  // Cron job authentication (optional — required only by the cron route)
  CRON_SECRET: z.string().optional(),

  // Test backdoor (non-production only — see TSD/2.6)
  TEST_RESET_TOKEN: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      throw new Error(
        `Invalid environment configuration:\n${parsed.error.issues
          .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
          .join("\n")}`,
      );
    }
    cached = parsed.data;
  }
  return cached;
}

/** Asserts an optional value is present, with a clear error naming the variable. */
export function required<K extends keyof Env>(key: K): NonNullable<Env[K]> {
  const value = env()[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(`Missing required environment variable: ${String(key)}`);
  }
  return value as NonNullable<Env[K]>;
}
