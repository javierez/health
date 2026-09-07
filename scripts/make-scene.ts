/** `--slug=sport:endurance [--force] [--all]`. Generates and stores a scene. */
import { allSlugs, getOrCreateScene } from "~/server/scenes/generate";

const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split("=")[1];
const force = process.argv.includes("--force");
const targets = process.argv.includes("--all")
  ? allSlugs().map((s) => s.slug)
  : [arg("slug") ?? "sport:endurance"];

for (const slug of targets) {
  const res = await getOrCreateScene(slug, { force });
  if (res.ok) {
    console.log(
      `${res.cached ? "·" : "✓"} ${slug} — ${res.scene.code.split("\n").length} lines — ${res.scene.caption ?? ""}`,
    );
  } else {
    console.log(`✗ ${slug} — ${res.detail}`);
  }
}
process.exit(0);
