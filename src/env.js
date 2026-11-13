import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().url(),
    /** Personal Pocket key from app.heypocket.com. Looks like `pk_...`. */
    POCKET_API_KEY: z.string().min(1),
    ANTHROPIC_API_KEY: z.string().min(1),
    /** Shared secret in the sync/webhook URL. Anything long and random. */
    SYNC_SECRET: z.string().min(16),
    /** From the app you create at developer.whoop.com. Optional until then. */
    WHOOP_CLIENT_ID: z.string().optional(),
    WHOOP_CLIENT_SECRET: z.string().optional(),
    /**
     * Must match the dashboard byte for byte, and WHOOP only accepts `https://`
     * or a `whoop://` scheme — plain `http://localhost` is rejected at
     * registration, which is why dev runs under `next dev --experimental-https`.
     */
    WHOOP_REDIRECT_URI: z.string().url().optional(),
    /** OpenStrap Edge's bearer when it posts the strap's numbers (`/api/webhooks/edge`). */
    EDGE_PUSH_SECRET: z.string().min(16).optional(),
    /** `gh auth token`. Needs `repo` to see private repos' line counts. */
    GITHUB_TOKEN: z.string().optional(),
    /** The GitHub login whose commits and PRs count as "mine". */
    GITHUB_LOGIN: z.string().optional(),
    /** better-auth's key for the session cookie: `openssl rand -base64 32`. */
    BETTER_AUTH_SECRET: z.string().min(32),
    /** Vercel Cron sends this as its bearer. */
    CRON_SECRET: z.string().optional(),
    /** Vesta's Meta system-user token (Vesta's `WHATSAPP_AI_ACCESS_TOKEN`). */
    WHATSAPP_ACCESS_TOKEN: z.string().optional(),
    /**
     * The line it goes out from: the 621 (Vesta's support line), whose
     * phone_number_id is `1418726264659067`. Vesta forwards what he writes to
     * that number from `WHATSAPP_TO` here instead of answering it.
     */
    WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
    /** Where it goes, digits only: `34636036116`. */
    WHATSAPP_TO: z.string().optional(),
    /** Whisper, for voice notes. Without it the chat asks him to write. */
    OPENAI_API_KEY: z.string().optional(),
    /**
     * Calendar and Gmail, read-only, from an OAuth client in Google Cloud.
     * The redirect is `https://<host>/api/google/oauth`, registered as is.
     */
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
    GOOGLE_REDIRECT_URI: z.string().url().optional(),
    /**
     * His own WhatsApp, read once a day from the Evolution instance Vesta
     * keeps for his number (account 2, `vesta-sE8xd3mu24gi`). The key is that
     * instance's token, never Vesta's global one. Without them nothing is read.
     */
    EVOLUTION_API_URL: z.string().url().optional(),
    EVOLUTION_INSTANCE: z.string().optional(),
    EVOLUTION_API_KEY: z.string().optional(),
    /**
     * Vesta's Twilio, for the code of «¿Olvidaste tu contraseña?» (the same
     * four names as in Vesta's .env.local). It goes to `WHATSAPP_TO`.
     */
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_PHONE_NUMBER: z.string().optional(),
    TWILIO_SENDER_ID: z.string().optional(),
    /** The panel's address, for the links the chat sends. On Vercel it falls back to the production domain. */
    APP_URL: z.string().url().optional(),
    /** The demo copy Gonzalo shows (`scripts/sembrar-demo.ts`): invented data, nothing synced, no AI on its own. */
    DEMO_MODE: z.enum(["1"]).optional(),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  },
  client: {},
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    POCKET_API_KEY: process.env.POCKET_API_KEY,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    SYNC_SECRET: process.env.SYNC_SECRET,
    WHOOP_CLIENT_ID: process.env.WHOOP_CLIENT_ID,
    WHOOP_CLIENT_SECRET: process.env.WHOOP_CLIENT_SECRET,
    WHOOP_REDIRECT_URI: process.env.WHOOP_REDIRECT_URI,
    EDGE_PUSH_SECRET: process.env.EDGE_PUSH_SECRET,
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    GITHUB_LOGIN: process.env.GITHUB_LOGIN,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
    WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_TO: process.env.WHATSAPP_TO,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
    EVOLUTION_API_URL: process.env.EVOLUTION_API_URL,
    EVOLUTION_INSTANCE: process.env.EVOLUTION_INSTANCE,
    EVOLUTION_API_KEY: process.env.EVOLUTION_API_KEY,
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
    TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER,
    TWILIO_SENDER_ID: process.env.TWILIO_SENDER_ID,
    APP_URL:
      process.env.APP_URL ??
      (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined),
    DEMO_MODE: process.env.DEMO_MODE,
    NODE_ENV: process.env.NODE_ENV,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
