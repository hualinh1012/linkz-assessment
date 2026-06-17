import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    // The Keycloak subject (sub) — used as keycloak_id throughout the app.
    user: { id?: string } & DefaultSession["user"];
  }
}
