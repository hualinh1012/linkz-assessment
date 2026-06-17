import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { container } from "@/container";

// Node-runtime Auth.js instance (imports the container → Prisma). Used by the
// auth route handler and server components. NOT imported by Edge middleware.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  events: {
    // Lazily provision the local user on first sign-in (TSD/1.5 §3.6).
    async signIn({ profile }) {
      if (profile?.sub && typeof profile.email === "string") {
        await container.provisionUser.execute({
          keycloakId: profile.sub,
          email: profile.email,
        });
      }
    },
  },
});
