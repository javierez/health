import { median, recoveryEstimate, sleepDebt, sleepPerformance } from "./estimate";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

check("a week at the baseline: no debt", sleepDebt([461, 461, 461, 461, 461, 461, 461]), 0);
check("an hour short last night: half of it", sleepDebt([401]), 30);
check("an hour short four nights back counts a third as much", sleepDebt([461, 461, 461, 401]), 10);
check("an eighth night back does not count", sleepDebt([461, 461, 461, 461, 461, 461, 461, 100]), 0);
check("long nights do not bank sleep", sleepDebt([600, 600]), 0);
check("never more than WHOOP ever gave: 2 h 08", sleepDebt([100, 100, 100]), 128);

check("7 h against 7 h 41: 91 %", sleepPerformance(420, 461), 91);
check("more than the need is 100 %", sleepPerformance(540, 461), 100);

const usual = { hrv: 60, rhr: 52 };
check("his usual morning after 7 h: 63", recoveryEstimate({ hrv: 60, rhr: 52, asleepMin: 420 }, usual), 63);
check("HRV a sixth down and the pulse 3 up: 49", recoveryEstimate({ hrv: 50, rhr: 55, asleepMin: 420 }, usual), 49);
check("an hour more sleep: 7 points more", recoveryEstimate({ hrv: 60, rhr: 52, asleepMin: 480 }, usual), 70);
check("no night: the hours do not count", recoveryEstimate({ hrv: 60, rhr: 52, asleepMin: null }, usual), 63);
check("never under 1", recoveryEstimate({ hrv: 10, rhr: 70, asleepMin: 120 }, usual), 1);
check("never over 99", recoveryEstimate({ hrv: 150, rhr: 45, asleepMin: 600 }, usual), 99);

check("median, odd", median([3, 1, 2]), 2);
check("median, even", median([4, 1, 3, 2]), 2.5);
check("median of nothing", median([]), null);

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.error(`  ✗ ${f}`);
process.exit(failures.length > 0 ? 1 : 0);
