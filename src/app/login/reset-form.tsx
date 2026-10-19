"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";

import { Button } from "~/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { PasswordInput } from "~/components/ui/password-input";
import { PASSWORD_HINT, passwordProblem } from "~/lib/password";
import { requestResetCode, setNewPassword } from "./actions";

/** Vesta's: one minute before the code can be sent again. */
const RESEND_SECONDS = 60;

/**
 * «¿Olvidaste tu contraseña?», Vesta's two screens in one card: the email,
 * then the SMS code with the new password. The server answers «sent» whether
 * the email is his or not, so this never says which.
 */
export function ResetForm({ initialEmail, onDone, onBack }: { initialEmail: string; onDone: (email: string) => void; onBack: () => void }) {
  const [email, setEmail] = useState(initialEmail);
  const [step, setStep] = useState<"email" | "code">("email");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const send = async () => {
    setBusy(true);
    setError("");
    const res = await requestResetCode(email).catch(() => null);
    setBusy(false);
    if (!res?.success) return setError(res?.error ?? "No se ha podido. Vuelve a intentarlo en un minuto.");
    setStep("code");
    setCode("");
    setWait(RESEND_SECONDS);
  };

  const change = async () => {
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    setBusy(true);
    setError("");
    const res = await setNewPassword({ email, code, password }).catch(() => null);
    setBusy(false);
    if (!res?.success) return setError(res?.error ?? "No se ha podido. Vuelve a intentarlo en un minuto.");
    onDone(email);
  };

  return (
    <>
      <CardHeader>
        <CardTitle>{step === "email" ? "Recuperar contraseña" : "Código de verificación"}</CardTitle>
        <CardDescription>
          {step === "email"
            ? "Te mandamos un código por SMS al móvil de la cuenta"
            : "Si el email es el tuyo, te llega un SMS con 6 números. Vale 5 minutos."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error ? <FormError>{error}</FormError> : null}

        {step === "email" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <label htmlFor="reset-email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="reset-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={busy}
                placeholder="tu@email.com"
              />
            </div>
            <Button type="submit" size="pill" className="w-full" disabled={busy}>
              {busy ? "Enviando..." : "Enviar código SMS"}
            </Button>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void change();
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <label htmlFor="code" className="text-sm font-medium">
                Código
              </label>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                required
                disabled={busy}
                placeholder="000000"
                className="text-center text-lg tracking-[0.5em]"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="new-password" className="text-sm font-medium">
                Contraseña nueva
              </label>
              <PasswordInput
                id="new-password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={busy}
                placeholder={PASSWORD_HINT}
              />
            </div>
            <Button type="submit" size="pill" className="w-full" disabled={busy || code.length !== 6}>
              {busy ? "Cambiando..." : "Cambiar contraseña"}
            </Button>
            <button
              type="button"
              onClick={() => void send()}
              disabled={busy || wait > 0}
              className="w-full text-sm font-medium text-gray-600 transition-colors hover:text-gray-900 disabled:text-gray-400"
            >
              {wait > 0 ? `Reenviar código en ${wait} s` : "Reenviar código"}
            </button>
          </form>
        )}

        <button type="button" onClick={onBack} className="w-full text-sm font-medium text-gray-600 transition-colors hover:text-gray-900">
          Volver al inicio de sesión
        </button>
      </CardContent>
    </>
  );
}

/** The red box of the login card. */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-md bg-red-50 p-4">
      <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
      <p className="text-sm text-red-800">{children}</p>
    </div>
  );
}
