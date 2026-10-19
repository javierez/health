import { googleEnabled } from "~/lib/auth";
import { SignInForm } from "./signin-form";

// Read here and not with useSearchParams(), as in Vesta: otherwise the page
// prerenders as a fallback and the form only shows after hydration.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const callbackUrl = typeof params.callbackUrl === "string" && params.callbackUrl.startsWith("/") ? params.callbackUrl : "/";
  return <SignInForm callbackUrl={callbackUrl} google={googleEnabled} googleError={params.error !== undefined} />;
}
