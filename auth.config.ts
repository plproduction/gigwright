import type { NextAuthConfig } from "next-auth";

// Edge-safe auth config. No Prisma imports, no providers that need DB access
// at config time. The full providers list (Resend) is added in auth.ts, which
// runs in Node.
export default {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/signin",
    verifyRequest: "/signin/check-email",
  },
  providers: [],
} satisfies NextAuthConfig;
