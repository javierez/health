import { sameNumber } from "./handle";
import { frameRate, MAX_FRAMES, parseDuration } from "./media";
import { videoLines } from "./video-read";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else failures.push(`${name}\n    expected ${JSON.stringify(expected)}\n    got      ${JSON.stringify(actual)}`);
}

check("his number with and without 34", sameNumber("34636036116", "636036116"), true);
check("with + and spaces", sameNumber("+34 636 03 61 16", "34636036116"), true);
check("someone else", sameNumber("34621339327", "34636036116"), false);
check("an empty setting matches nobody", sameNumber("", undefined), false);

check(
  "ffmpeg's length line",
  parseDuration("  Duration: 00:01:02.50, start: 0.000000, bitrate: 2048 kb/s"),
  62.5,
);
check("no length line", parseDuration("Invalid data found"), null);
check("a short set: three frames a second", frameRate(12), 3);
check("a 30 s set: two a second, 60 frames", frameRate(30), 2);
check("a long video: capped at MAX_FRAMES", Math.round(frameRate(180) * 180), MAX_FRAMES);
check("unknown length: one a second", frameRate(null), 1);

check(
  "a montage, stretch by stretch, with the rest apart",
  videoLines(
    {
      montaje: true,
      tramos: [
        { desde: 0, hasta: 9.6, ejercicio: "Sentadilla isométrica en pared", segundos: 9.6 },
        { desde: 10, hasta: 24, ejercicio: "Puente de glúteo a una pierna", reps: 8, lado: "derecha", material: "banda" },
      ],
      descanso: ["24 a 26 s: se levanta"],
    },
    50.4,
  ),
  [
    "Lo que se ve en el vídeo (50 s, un montaje editado), leído de sus fotogramas:",
    "- 0 a 10 s: Sentadilla isométrica en pared (10 s aguantando)",
    "- 10 a 24 s: Puente de glúteo a una pierna (8 reps, lado derecho, banda)",
    "Sin entrenar: 24 a 26 s: se levanta.",
  ].join("\n"),
);
check("nothing read: the frames go instead", videoLines({ tramos: [] }, 10), null);
check("not even the shape", videoLines("hola", 10), null);
check(
  "a bad field drops, the stretch stays",
  videoLines({ tramos: [{ desde: 0, hasta: 5, ejercicio: "Curl", reps: "ocho", lado: "arriba" }] }, 5),
  "Lo que se ve en el vídeo (5 s), leído de sus fotogramas:\n- 0 a 5 s: Curl",
);

console.log(`${passed} passed, ${failures.length} failed`);
for (const f of failures) console.error(`  ✗ ${f}`);
process.exit(failures.length > 0 ? 1 : 0);
