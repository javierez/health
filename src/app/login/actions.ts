"use server";

import { headers } from "next/headers";
import { z } from "zod";

import { firstIp, requestCode, resetPassword, type ResetResult } from "~/server/auth/reset";

/**
 * «¿Olvidaste tu contraseña?» from /login, which the proxy leaves open: these
 * two are public on purpose and every limit lives in `~/server/auth/reset`.
 */
const email = z.string().trim().email().max(200);

export async function requestResetCode(input: string): Promise<ResetResult> {
  const parsed = email.safeParse(input);
  if (!parsed.success) return { success: false, error: "Ese email no parece bien escrito" };
  try {
    return await requestCode(parsed.data, firstIp((await headers()).get("x-forwarded-for")));
  } catch (err) {
    console.error("[reset] request", err);
    return { success: false, error: "No se ha podido. Vuelve a intentarlo en un minuto." };
  }
}

const reset = z.object({ email, code: z.string().max(20), password: z.string().max(200) });

export async function setNewPassword(input: { email: string; code: string; password: string }): Promise<ResetResult> {
  const parsed = reset.safeParse(input);
  if (!parsed.success) return { success: false, error: "Revisa el email y el código" };
  try {
    return await resetPassword(parsed.data);
  } catch (err) {
    console.error("[reset] verify", err);
    return { success: false, error: "No se ha podido. Vuelve a intentarlo en un minuto." };
  }
}
