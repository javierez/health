import { compare, inflation, lag1, phi, qValues, type Point } from "./stats";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

const round = (n: number | undefined, d = 2) => (n === undefined ? n : Math.round(n * 10 ** d) / 10 ** d);
const pts = (vs: number[], s = 0): Point[] => vs.map((v) => ({ v, s }));

check("phi(0) is a half", round(phi(0), 4), 0.5);
check("phi(1.96) is 0.975", round(phi(1.96), 3), 0.975);
check("phi is symmetric", round(phi(-1.2) + phi(1.2), 6), 1);

// A clear gap: 10 points on tight values.
const clear = compare(pts([60, 62, 61, 63, 59, 60, 62, 61, 60, 62]), pts([50, 52, 51, 49, 50, 51, 52, 50, 49, 51]));
check("clear gap", round(clear?.gap, 1), 10.5);
check("clear gap is not noise", (clear?.p ?? 1) < 0.001, true);

// Same means, wide spread: noise.
const noisy = compare(pts([20, 90, 40, 80, 30, 70]), pts([25, 85, 45, 75, 35, 65]));
check("noisy gap is not significant", (noisy?.p ?? 0) > 0.5, true);

// The weekend trap: weekends are all late nights, and late nights recover less.
// Raw, weekends look 10 worse; at the same bedtime they are the same.
const weekend = [...pts([50, 51, 49, 50], 1), ...pts([60, 59, 61], 0)];
const weekday = [...pts([50, 49, 51, 50], 1), ...pts([60, 59, 61, 60, 62, 58, 60, 61, 59, 60], 0)];
const adjusted = compare(weekend, weekday);
check("same bedtime: the weekend costs nothing", round(adjusted?.gap, 1), 0);
check("raw: the weekend looks worse", (adjusted?.raw ?? 0) < -2, true);

check("a stratum under three a side is skipped", compare(pts([1, 2]), pts([3, 4, 5])), null);

// Days that follow each other: a supplement taken every day since July is one long run, not 30 separate tries.
const run = [...Array(20).fill(0), ...Array(20).fill(1)];
const alternating = Array.from({ length: 40 }, (_, i) => i % 2);
check("a long run repeats itself", lag1(run) > 0.9, true);
check("an alternating series does not", lag1(alternating) < -0.9, true);
check("unknown days break the pairs", lag1([1, null, 2, null, 3]), 0);
check("independent days: no widening", inflation(0, 0.8), 1);
check("a negative pair never narrows it", inflation(-0.5, 0.8), 1);
check("both repeating: about ×3", round(inflation(0.9, 0.9)), 3.09);
check("compare widens the error by that much", round((compare(pts([60, 62, 61, 63]), pts([50, 52, 51, 49]), 2)?.se ?? 0) / (compare(pts([60, 62, 61, 63]), pts([50, 52, 51, 49]))?.se ?? 1)), 2);

// Benjamini-Hochberg on the textbook example.
check("q-values", qValues([0.01, 0.04, 0.03, 0.005]).map((q) => round(q, 3)), [0.02, 0.04, 0.04, 0.02]);
check("q never below p", qValues([0.2, 0.9]).every((q, i) => q >= [0.2, 0.9][i]!), true);

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`stats: ${passed} passed`);
