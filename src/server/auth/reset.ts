import { randomInt } from "node:crypto";
import { and, count, desc, eq, gt, isNull, lt, sql, type SQL } from "drizzle-orm";

import { db } from "~/db";
import { authResetCodes } from "~/db/schema";
import { env } from "~/env";
import { auth } from "~/lib/auth";
import { passwordProblem } from "~/lib/password";
import { sendSms } from "~/server/sms";

/**
 * «¿Olvidaste tu contraseña?», Vesta's flow (src/server/actions/password-reset.ts
 * there): a 6-digit code by SMS to his phone, hashed, 5 minutes, used once,
 * only the newest valid, and the same answer whether the email is his or not.
 * Three things Vesta lacks: a code dies after 5 wrong tries, a new password
 * signs out every device, and the limits live in this table, not in memory.
 */
export const CODE_MINUTES = 5;
export const MAX_TRIES = 5;
const WINDOW_MINUTES = 15;
/** Codes asked from one IP, and codes sent to his phone, per 15 minutes. */
const PER_IP = 5;
const PER_PHONE = 3;

export type ResetResult = { success: true } | { success: false; error: string };

const TOO_MANY: ResetResult = { success: false, error: "Demasiados códigos pedidos. Espera 15 minutos." };
const DEAD: ResetResult = { success: false, error: "Ese código ya no vale. Pide otro." };

/** What a wrong code says, once `spent` tries of that code are gone. */
export function wrongCode(spent: number): string {
  const left = MAX_TRIES - spent;
  if (left <= 0) return "Código incorrecto. Pide otro.";
  return left === 1 ? "Código incorrecto. Te queda 1 intento." : `Código incorrecto. Te quedan ${left} intentos.`;
}

/** The caller's address from `x-forwarded-for`: Vercel puts the client first. */
export function firstIp(forwarded: string | null): string | null {
  const ip = forwarded?.split(",")[0]?.trim();
  return ip ? ip.slice(0, 64) : null;
}

async function recent(where: SQL) {
  const since = new Date(Date.now() - WINDOW_MINUTES * 60_000);
  const [row] = await db
    .select({ n: count() })
    .from(authResetCodes)
    .where(and(where, gt(authResetCodes.createdAt, since)));
  return row?.n ?? 0;
}

export async function requestCode(email: string, ip: string | null): Promise<ResetResult> {
  if (ip && (await recent(eq(authResetCodes.ip, ip))) >= PER_IP) return TOO_MANY;

  const ctx = await auth.$context;
  const found = await ctx.internalAdapter.findUserByEmail(email.trim().toLowerCase());
  // Not his email: the same «sent» as when it is, so nobody learns it here.
  if (!found) return { success: true };
  if ((await recent(eq(authResetCodes.userId, found.user.id))) >= PER_PHONE) return TOO_MANY;

  const code = String(randomInt(100_000, 1_000_000));
  await db.insert(authResetCodes).values({
    userId: found.user.id,
    codeHash: await ctx.password.hash(code),
    expiresAt: new Date(Date.now() + CODE_MINUTES * 60_000),
    ip,
  });
  // A failed SMS answers «sent» too (Vesta's): the reason goes to the log.
  await sendSms(env.WHATSAPP_TO, `Tu código de verificación de Salud es: ${code}. Válido por ${CODE_MINUTES} minutos.`);
  return { success: true };
}

export async function resetPassword(input: { email: string; code: string; password: string }): Promise<ResetResult> {
  const code = input.code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { success: false, error: "El código son 6 números" };
  const problem = passwordProblem(input.password);
  if (problem) return { success: false, error: problem };

  const ctx = await auth.$context;
  const found = await ctx.internalAdapter.findUserByEmail(input.email.trim().toLowerCase(), { includeAccounts: true });
  if (!found) return DEAD;

  // Only the newest: asking for another code kills the earlier ones.
  const [row] = await db
    .select()
    .from(authResetCodes)
    .where(eq(authResetCodes.userId, found.user.id))
    .orderBy(desc(authResetCodes.createdAt))
    .limit(1);
  if (!row) return DEAD;

  // The try is spent before the check, in one statement: two tabs guessing
  // at once still get 5 between them.
  const [spent] = await db
    .update(authResetCodes)
    .set({ attempts: sql`${authResetCodes.attempts} + 1` })
    .where(
      and(
        eq(authResetCodes.id, row.id),
        isNull(authResetCodes.usedAt),
        gt(authResetCodes.expiresAt, new Date()),
        lt(authResetCodes.attempts, MAX_TRIES),
      ),
    )
    .returning({ attempts: authResetCodes.attempts });
  if (!spent) return DEAD;
  if (!(await ctx.password.verify({ hash: row.codeHash, password: code }))) {
    return { success: false, error: wrongCode(spent.attempts) };
  }

  const [used] = await db
    .update(authResetCodes)
    .set({ usedAt: new Date() })
    .where(and(eq(authResetCodes.id, row.id), isNull(authResetCodes.usedAt)))
    .returning({ id: authResetCodes.id });
  if (!used) return DEAD;

  const hash = await ctx.password.hash(input.password);
  if (found.accounts.some((a) => a.providerId === "credential")) await ctx.internalAdapter.updatePassword(found.user.id, hash);
  else await ctx.internalAdapter.linkAccount({ userId: found.user.id, providerId: "credential", accountId: found.user.id, password: hash });
  // Whoever had the old password is out, everywhere.
  await ctx.internalAdapter.deleteSessions(found.user.id);
  return { success: true };
}
