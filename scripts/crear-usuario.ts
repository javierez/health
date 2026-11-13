/**
 * Someone new in the app, or a new password for someone already in. Nobody
 * signs up from the login page (better-auth `disableSignUp`): each person's
 * chat runs on his Anthropic key, so this is the only door, and it is his.
 * Each person sees only their own rows (`~/db`); the first account is his.
 * Email and password come from the environment, never from the command line,
 * so they don't land in the shell history. A new person needs AUTH_NAME too:
 * the app calls them by it.
 *
 *   AUTH_EMAIL=… AUTH_PASSWORD=… AUTH_NAME=… set -a && source .env.local && set +a && pnpm tsx scripts/crear-usuario.ts   # dry-run
 *   … pnpm tsx scripts/crear-usuario.ts --write
 */
import { auth } from "~/lib/auth";

const email = process.env.AUTH_EMAIL?.trim().toLowerCase();
const password = process.env.AUTH_PASSWORD;
const name = process.env.AUTH_NAME?.trim();
if (!email || !password || password.length < 8) {
  console.error("Faltan AUTH_EMAIL y AUTH_PASSWORD (8 caracteres o más).");
  process.exit(1);
}

const write = process.argv.includes("--write");
const ctx = await auth.$context;
const found = await ctx.internalAdapter.findUserByEmail(email, { includeAccounts: true });
const hash = await ctx.password.hash(password);

if (found) {
  const credential = found.accounts.find((a) => a.providerId === "credential");
  console.log(`${email} ya existe: ${credential ? "se le cambia la contraseña" : "se le añade contraseña"}.`);
  if (write && credential) await ctx.internalAdapter.updatePassword(found.user.id, hash);
  if (write && !credential) {
    await ctx.internalAdapter.linkAccount({ userId: found.user.id, providerId: "credential", accountId: found.user.id, password: hash });
  }
} else {
  if (!name) {
    console.error(`${email} no existe: falta AUTH_NAME, el nombre con el que la app le habla.`);
    process.exit(1);
  }
  console.log(`${email} no existe: se crea como «${name}», con contraseña, y empieza vacío.`);
  if (write) {
    const user = await ctx.internalAdapter.createUser({ email, name, emailVerified: true });
    await ctx.internalAdapter.linkAccount({ userId: user.id, providerId: "credential", accountId: user.id, password: hash });
  }
}
console.log(write ? "Hecho." : "Dry-run: añade --write para escribirlo.");
process.exit(0);
