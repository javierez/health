/**
 * Vesta's rule for a new password (its reset and its sign-up): 8 or more,
 * with a lowercase, an uppercase and a number. The same for «Cuenta» and for
 * «¿Olvidaste tu contraseña?», in the browser and again on the server.
 * Null when it is good.
 */
export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "8 caracteres o más";
  if (pw.length > 128) return "128 caracteres como mucho";
  if (!/\p{Ll}/u.test(pw)) return "Falta una minúscula";
  if (!/\p{Lu}/u.test(pw)) return "Falta una mayúscula";
  if (!/\d/.test(pw)) return "Falta un número";
  return null;
}

/** What the placeholder of a new-password field says. */
export const PASSWORD_HINT = "8 o más, con mayúscula, minúscula y número";
