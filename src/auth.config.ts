import type { NextAuthConfig } from "next-auth";
import Keycloak from "next-auth/providers/keycloak";
import { env } from "@/config/env";

// 90-day session — matches Keycloak SSO Session Max (TSD/1.5 §3.2).
const NINETY_DAYS_SECONDS = 60 * 60 * 24 * 90;

/**
 * Edge-safe Auth.js config (no DB/Prisma imports) — shared by the Node auth
 * instance (`src/auth.ts`) and the Edge middleware (`src/middleware.ts`).
 * See TSD/2.1 (Authentication flow).
 */
export const authConfig = {
  providers: [
    Keycloak({
      clientId: env().KEYCLOAK_CLIENT_ID,
      clientSecret: env().KEYCLOAK_CLIENT_SECRET,
      issuer: env().KEYCLOAK_ISSUER,
    }),
  ],
  session: { strategy: "jwt", maxAge: NINETY_DAYS_SECONDS },
  callbacks: {
    // Carry the Keycloak subject + email into the session token (no DB here).
    jwt({ token, profile }) {
      if (profile?.sub) token.sub = profile.sub;
      if (profile && typeof profile.email === "string") token.email = profile.email;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
} satisfies NextAuthConfig;
