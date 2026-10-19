"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, LogOut, UserRound } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Modal } from "~/components/ui/modal";
import { PasswordInput } from "~/components/ui/password-input";
import { changePassword, getSession, signOut } from "~/lib/auth-client";
import { PASSWORD_HINT, passwordProblem } from "~/lib/password";

/**
 * His account, behind the icon in the header: who he is signed in as, a new
 * password, and the way out. A new password signs out every other device.
 */
export function Account() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  return (
    <>
      <Button
        size="pillIcon"
        variant="outline"
        aria-label="Cuenta"
        title="Cuenta"
        onClick={() => {
          setOpen(true);
          if (!email) void getSession().then((r) => setEmail(r.data?.user.email ?? null));
        }}
      >
        <UserRound />
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Cuenta">
        <div className="space-y-5">
          <p className="truncate text-sm text-gray-700">{email ?? "…"}</p>
          <NewPassword />
          <div className="border-t border-gray-100 pt-4">
            <SignOutButton />
          </div>
        </div>
      </Modal>
    </>
  );
}

function NewPassword() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setDone(false);
    const problem = passwordProblem(next);
    if (problem) return setError(`La nueva: ${problem.toLowerCase()}`);
    if (next === current) return setError("La nueva es igual que la actual");
    setBusy(true);
    const res = await changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true }).catch(() => null);
    setBusy(false);
    if (!res || res.error) {
      // 1.3.4 answers {message} with no code: the text is what tells.
      const msg = res?.error?.message ?? "";
      setError(
        /invalid password/i.test(msg)
          ? "La contraseña actual no es esa"
          : res?.error?.status === 429
            ? "Demasiados intentos. Espera un minuto."
            : "No se ha podido cambiar. Vuelve a intentarlo.",
      );
      return;
    }
    setCurrent("");
    setNext("");
    setDone(true);
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-sm font-medium text-gray-900">Cambiar contraseña</p>
      <PasswordInput
        autoComplete="current-password"
        placeholder="Contraseña actual"
        aria-label="Contraseña actual"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        required
        disabled={busy}
      />
      <PasswordInput
        autoComplete="new-password"
        placeholder={`Nueva: ${PASSWORD_HINT}`}
        aria-label="Contraseña nueva"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        required
        disabled={busy}
      />
      {error ? (
        <p className="flex items-center gap-1.5 text-xs text-red-500">
          <AlertCircle className="size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
      {done ? (
        <p className="flex items-center gap-1.5 text-xs text-gray-700">
          <Check className="size-3.5 shrink-0" strokeWidth={3} />
          Cambiada. Los demás dispositivos tendrán que volver a entrar.
        </p>
      ) : null}
      <Button type="submit" size="pill" className="w-full" disabled={busy}>
        {busy ? "Cambiando…" : "Cambiar contraseña"}
      </Button>
    </form>
  );
}

/** Ends the session and goes back to /login. */
function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="pill"
      variant="outline"
      className="w-full"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await signOut().catch(() => null);
        router.replace("/login");
        router.refresh();
      }}
    >
      <LogOut />
      Cerrar sesión
    </Button>
  );
}
