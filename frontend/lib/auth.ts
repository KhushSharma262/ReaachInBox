import { type NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

/**
 * JWT session strategy (not database sessions).
 *
 * The Express API is a separate origin, so the frontend must prove identity
 * without a shared session table. A signed JWT can be verified independently
 * by the API — no cross-service session lookup, no shared DB dependency.
 */
export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.sub ?? "";
      }
      return session;
    },
  },
  pages: { signIn: "/login" },
  secret: process.env.NEXTAUTH_SECRET,
};
