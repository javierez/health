"use client";

import { useState } from "react";
import { Check } from "lucide-react";

import { Logo } from "~/components/logo";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { PasswordInput } from "~/components/ui/password-input";
import { signIn } from "~/lib/auth-client";
import { FormError, ResetForm } from "./reset-form";

/** Vesta's: a wedged server must not leave the button spinning for five minutes. */
const LOGIN_TIMEOUT_MS = 20_000;

/**
 * Vesta's sign-in form (src/app/auth/signin/signin-form.tsx), without sign-up
 * or 2FA. «¿Olvidaste tu contraseña?» turns the card into the SMS reset.
 */
export function SignInForm({ callbackUrl, google, googleError }: { callbackUrl: string; google: boolean; googleError: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(googleError ? "No hemos podido continuar con Google. Entra con tu email." : "");
  const [resetting, setResetting] = useState(false);
  const [changed, setChanged] = useState(false);

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS);
    try {
      const result = await signIn.email({ email, password }, { signal: controller.signal });
      if (controller.signal.aborted) throw new DOMException("timeout", "AbortError");
      if (result.error) {
        setError(
          // 1.3.4 answers {message} with no code: the status is what tells.
          result.error.status === 401
            ? "Email o contraseña incorrectos"
            : result.error.status === 429
              ? "Demasiados intentos. Espera un minuto."
              : (result.error.message ?? "Error al iniciar sesión"),
        );
        return;
      }
      window.location.href = callbackUrl;
    } catch (err) {
      setError(
        controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")
          ? "El servidor está tardando demasiado en responder. Vuelve a intentarlo en unos segundos."
          : "Error inesperado al iniciar sesión",
      );
    } finally {
      clearTimeout(timer);
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      await signIn.social({ provider: "google", callbackURL: callbackUrl, errorCallbackURL: "/login" });
    } catch {
      setError("Error al iniciar sesión con Google");
      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col justify-center px-4 py-12">
      <div className="mx-auto w-full max-w-md">
        <h1 className="text-center text-3xl"><Logo /></h1>
        <Card className="mt-8">
          {resetting ? (
            <ResetForm
              initialEmail={email}
              onBack={() => setResetting(false)}
              onDone={(address) => {
                setEmail(address);
                setPassword("");
                setError("");
                setChanged(true);
                setResetting(false);
              }}
            />
          ) : (
            <>
              <CardHeader>
                <CardTitle>Iniciar sesión</CardTitle>
                <CardDescription>Accede a tu panel de salud</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {error ? <FormError>{error}</FormError> : null}
                {changed && !error ? (
                  <div className="flex gap-3 rounded-md bg-gray-50 p-4">
                    <Check className="h-5 w-5 shrink-0 text-gray-900" strokeWidth={3} />
                    <p className="text-sm text-gray-800">Contraseña cambiada. Entra con la nueva.</p>
                  </div>
                ) : null}

                <form onSubmit={handleEmailSignIn} className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="email" className="text-sm font-medium">
                      Email
                    </label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={isLoading}
                      placeholder="tu@email.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor="password" className="text-sm font-medium">
                      Contraseña
                    </label>
                    <PasswordInput
                      id="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      disabled={isLoading}
                      placeholder="Tu contraseña"
                    />
                  </div>
                  <Button type="submit" size="pill" className="w-full" disabled={isLoading}>
                    {isLoading ? "Iniciando sesión..." : "Iniciar sesión"}
                  </Button>
                </form>

                {google ? (
                  <>
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-200" />
                      </div>
                      <div className="relative flex justify-center text-sm">
                        <span className="bg-card px-2 text-gray-500">O continúa con</span>
                      </div>
                    </div>
                    <Button type="button" variant="outline" size="pill" className="w-full" onClick={handleGoogleSignIn} disabled={isLoading}>
                      <svg viewBox="0 0 24 24" aria-hidden>
                        <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                        <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                      </svg>
                      Continuar con Google
                    </Button>
                  </>
                ) : null}

                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setChanged(false);
                    setResetting(true);
                  }}
                  disabled={isLoading}
                  className="w-full text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
                >
                  ¿Olvidaste tu contraseña?
                </button>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </main>
  );
}
