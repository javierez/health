#!/bin/zsh
# health vuelve a leer tu WhatsApp. Cada vez que escaneas otra vez el QR en Vesta, Vesta borra y
# crea la instancia, y Evolution le da un token nuevo: el que tenía health deja de valer (401 desde
# el 24-oct-2026). Esto coge el token de ahora, lo prueba, lo guarda en health, recupera los
# mensajes desde --since (por defecto, hace 5 días) y despliega. Solo lee tu WhatsApp: no envía
# nada ni marca nada como leído. Lo lanzas tú, después de cada re-escaneo.
#
#   ~/Desktop/health/scripts/reconectar-whatsapp.sh [YYYY-MM-DD]
set -euo pipefail
INSTANCE=vesta-sE8xd3mu24gi
SINCE=${1:-$(date -v-5d +%Y-%m-%d)}
env_of() { grep "^$1=" ~/Desktop/vesta/.env.local | cut -d= -f2- | tr -d '"' }
URL=$(env_of EVOLUTION_API_URL | sed 's:/*$::')
GLOBAL=$(env_of EVOLUTION_API_GLOBAL_KEY)

# Only the instance's own token goes to health, never Vesta's global key: it opens every line.
TOKEN=$(curl -sf "$URL/instance/fetchInstances?instanceName=$INSTANCE" -H "apikey: $GLOBAL" | node -e '
  let s = "";
  process.stdin.on("data", (d) => (s += d)).on("end", () => {
    const i = [].concat(JSON.parse(s)).find((x) => (x.name ?? x.instance?.instanceName) === process.argv[1]);
    console.error(`instancia ${process.argv[1]}: ${i?.connectionStatus ?? i?.instance?.status ?? "no está"}`);
    process.stdout.write(String(i?.token ?? i?.hash?.apikey ?? ""));
  });' "$INSTANCE")
[[ -n "$TOKEN" ]] || { echo "✗ Evolution no ha dado el token de $INSTANCE"; exit 1; }
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$URL/chat/findMessages/$INSTANCE" \
  -H "apikey: $TOKEN" -H "Content-Type: application/json" -d '{"limit":1,"page":1}')
[[ "$code" == 200 ]] || { echo "✗ el token nuevo responde $code"; exit 1; }
echo "✓ token nuevo probado"

cd ~/Desktop/health
vercel env rm EVOLUTION_API_KEY production --yes >/dev/null 2>&1 || true
printf '%s' "$TOKEN" | vercel env add EVOLUTION_API_KEY production >/dev/null
echo "✓ token guardado en health"

DATABASE_URL="$(security find-generic-password -s salud-db -w)" SKIP_ENV_VALIDATION=1 \
  EVOLUTION_API_URL="$URL" EVOLUTION_INSTANCE="$INSTANCE" EVOLUTION_API_KEY="$TOKEN" \
  npx tsx scripts/import-whatsapp.ts --write --since="$SINCE"

# A new env var only reaches a new deployment. Uploads ~/Desktop/health as it is.
vercel --prod >/dev/null
code=$(curl -s -o /dev/null -w "%{http_code}" https://health-five-livid.vercel.app/login)
[[ "$code" == 200 ]] && echo "✓ Desplegado con el token nuevo" || echo "✗ /login respondió $code"
