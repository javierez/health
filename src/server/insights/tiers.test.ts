import type { Finding } from "./findings";
import { tiers } from "./tiers";

const failures: string[] = [];
const check = (name: string, got: unknown, want: unknown) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) failures.push(`${name}\n    expected ${JSON.stringify(want)}\n    got      ${JSON.stringify(got)}`);
};

const f = (key: string, tier: Finding["tier"], weight: number, controllable = true) => ({ key, tier, weight, controllable }) as Finding;
const groups = tiers([
  f("bed-early", "good", 3),
  f("sunday", "good", 2.8, false),
  f("weights", "good", 1.4),
  f("short-sleep", "bad", -1.8),
  f("topic-dinero", "unclear", 1.2, false),
  f("caffeine", "none", 0.1),
]);
const keys = (label: string) => groups.find((g) => g.label === label)?.list.map((x) => x.key);
check("what he does, by size", keys("Te hace bien"), ["bed-early", "weights"]);
check("a Sunday is never «te hace bien»", keys("Va junto, no es causa"), ["sunday"]);
check("harm on its own", keys("Te hace mal"), ["short-sleep"]);
check("noisy either way: por aclarar", keys("Por aclarar"), ["topic-dinero"]);
check("no difference: in none", groups.flatMap((g) => g.list).some((x) => x.key === "caffeine"), false);

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`tiers: 5 passed`);
