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
    /** `gh auth token`. Needs `repo` to see private repos' line counts. */
    GITHUB_TOKEN: z.string().optional(),
    /** The GitHub login whose commits and PRs count as "mine". */
    GITHUB_LOGIN: z.string().optional(),
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
    GITHUB_TOKEN: process.env.GITHUB_TOKEN,
    GITHUB_LOGIN: process.env.GITHUB_LOGIN,
    NODE_ENV: process.env.NODE_ENV,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
