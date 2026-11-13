import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { adminDb } from "~/db";
import { authAccount, authSession, authUser, authVerification } from "~/db/schema";
import { env } from "~/env";

/**
 * Vesta's login (src/lib/auth.ts there): email and password, Google when its
 * keys are set, 7-day sessions with a 5-minute encrypted cookie cache, 5 tries
 * a minute. Nobody signs up: each account is made by `scripts/crear-usuario.ts`
 * (his choice who, since every chat runs on his Anthropic key), and Google only
 * lets in an email already there. As `adminDb`: the login comes before the user.
 */
export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.APP_URL,
  database: drizzleAdapter(adminDb, {
    provider: "pg",
    schema: { user: authUser, session: authSession, account: authAccount, verification: authVerification },
  }),
  emailAndPassword: { enabled: true, disableSignUp: true },
  socialProviders: {
    ...(env.GOOGLE_CLIENT_ID &&
      env.GOOGLE_CLIENT_SECRET && {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          prompt: "select_account" as const,
          disableImplicitSignUp: true,
        },
      }),
  },
  account: { accountLinking: { trustedProviders: ["google"] } },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  advanced: {
    useSecureCookies: env.NODE_ENV === "production",
    defaultCookieAttributes: { httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "lax" },
  },
  rateLimit: { window: 60, max: 5 },
  trustedOrigins: [
    "http://localhost:3100",
    // The first URL, still live for the webhooks: with a custom domain Vercel stops naming it below.
    "https://health-five-livid.vercel.app",
    ...(env.APP_URL ? [env.APP_URL] : []),
    ...(process.env.VERCEL_PROJECT_PRODUCTION_URL ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`] : []),
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
  ],
  plugins: [nextCookies()],
});

/** Whether the login page shows «Continuar con Google». */
export const googleEnabled = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
