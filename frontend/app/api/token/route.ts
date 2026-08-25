import { getServerSession } from "next-auth";
import { SignJWT } from "jose";
import { authOptions } from "../auth/[...nextauth]/route";

/**
 * Mints a short-lived HS256 token for the Express API.
 *
 * NextAuth v4 stores its session as an encrypted JWE, which the API cannot
 * verify with a plain signature check. Rather than share NextAuth internals
 * across services, the frontend exchanges its session for a signed JWT the
 * API verifies independently with the shared AUTH_SECRET.
 */
export async function GET() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET);

  const token = await new SignJWT({
    email: session.user.email,
    name: session.user.name ?? null,
    picture: session.user.image ?? null,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setIssuer("reachinbox-web")
    .setAudience("reachinbox-api")
    .setExpirationTime("1h")
    .sign(secret);

  return Response.json({ token });
}
