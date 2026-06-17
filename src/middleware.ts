import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

// Edge middleware reads the Auth.js session cookie (no DB). It forwards the
// authenticated identity to Route Handlers via request headers, so handlers
// stay decoupled from the auth mechanism. See TSD/1.4 §2.6.
const { auth } = NextAuth(authConfig);

// Public API paths bypass auth (TSD/1.4 §2.6). `/api/test/*` and `/api/auth/*`
// self-guard (test token / OIDC handshake).
function isPublicApi(pathname: string): boolean {
  if (pathname === "/api/seats") return true;
  if (pathname.startsWith("/api/payment/callback")) return true;
  if (pathname.startsWith("/api/auth/")) return true;
  if (pathname.startsWith("/api/test/")) return true;
  return false;
}

export default auth((req) => {
  const { pathname } = req.nextUrl;
  if (isPublicApi(pathname)) return NextResponse.next();

  const user = req.auth?.user;
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, { status: 401 });
  }

  const headers = new Headers(req.headers);
  headers.set("x-user-id", user.id);
  if (user.email) headers.set("x-user-email", user.email);
  return NextResponse.next({ request: { headers } });
});

// Only API routes are guarded here; pages manage their own auth/redirect.
export const config = {
  matcher: ["/api/:path*"],
};
