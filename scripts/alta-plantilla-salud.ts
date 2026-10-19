/**
 * Registers `salud_aviso_v1` in Vesta's WABA (the 621 and the 684 share it)
 * (`1820772069343247`, the same one as the 621 and the 711).
 *
 * 🚨 WITHOUT `--apply` IT DOES NOT CALL META: it only prints what it would
 * send. MARKETING on purpose (see `src/server/assistant/whatsapp.ts`): a
 * MARKETING template is never penalised, a re-filed UTILITY is a strike
 * against the three lines.
 *
 *   set -a && source .env.local && set +a && pnpm tsx scripts/alta-plantilla-salud.ts [--apply]
 */
import { TEMPLATE, TEMPLATE_BODY } from "~/server/assistant/whatsapp";

const WABA = "1820772069343247";
const GRAPH = "https://graph.facebook.com/v21.0";

const payload = {
  name: TEMPLATE.name,
  language: TEMPLATE.language,
  category: "MARKETING",
  components: [
    {
      type: "BODY",
      text: TEMPLATE_BODY,
      example: {
        body_text: [
          [
            "Esta noche a la cama a las 23:10: hoy has entrenado fuerte y necesitas 8 h 20. Nada de café ya y cena ligera antes de las 21:30.",
          ],
        ],
      },
    },
  ],
};

console.log(`POST ${GRAPH}/${WABA}/message_templates`);
console.log(JSON.stringify(payload, null, 2));

if (!process.argv.includes("--apply")) {
  console.log("\n(dry-run: Meta no se ha llamado. Con --apply se crea.)");
  process.exit(0);
}

const token = process.env.WHATSAPP_ACCESS_TOKEN;
if (!token) {
  console.error("Falta WHATSAPP_ACCESS_TOKEN.");
  process.exit(1);
}
const res = await fetch(`${GRAPH}/${WABA}/message_templates`, {
  method: "POST",
  headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
  body: JSON.stringify(payload),
});
console.log(res.status, await res.text());
process.exit(res.ok ? 0 : 1);
