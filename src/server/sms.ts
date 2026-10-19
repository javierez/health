import { env } from "~/env";

/**
 * One SMS through Vesta's Twilio, the account and senders of its codes:
 * first from the name, then from the number, because some lines refuse a
 * named sender (Twilio 21612, Vesta's twilio.ts). Without the keys, in
 * development the text goes to the console; in production nothing goes out.
 */
export async function sendSms(to: string | undefined, body: string): Promise<boolean> {
  const sid = env.TWILIO_ACCOUNT_SID;
  const token = env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) {
    if (env.NODE_ENV === "production") {
      console.error("[sms] Twilio sin configurar: no sale nada");
      return false;
    }
    console.info(`[sms] (desarrollo, no sale) ${to ?? "sin número"}: ${body}`);
    return true;
  }
  if (!to) {
    console.error("[sms] Sin número al que mandarlo");
    return false;
  }

  const senders = [...new Set([env.TWILIO_SENDER_ID, env.TWILIO_PHONE_NUMBER])].filter((s): s is string => !!s);
  for (const from of senders) {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` },
      body: new URLSearchParams({ To: `+${to.replace(/\D/g, "")}`, From: from, Body: body }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => null);
    if (res?.ok) return true;
    const why = res ? `${res.status} ${(await res.text().catch(() => "")).slice(0, 200)}` : "sin respuesta";
    console.error(`[sms] Twilio desde ${from}: ${why}`);
  }
  return false;
}
