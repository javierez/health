/**
 * His medical history, typed once from the reports in Downloads (16-oct-2026):
 * the clinical summary HTML (built from the Quirónsalud app), the TAC photo,
 * Informe.pdf (ORL 01/10), Volante.pdf (PAAF), and the Vithas emergency report
 * and bloods of 17/03/2026. An entry already there (same title and day) is
 * skipped, so it can run twice.
 *
 *   set -a && source .env.local && set +a && pnpm tsx scripts/import-historial.ts           # dry-run
 *   set -a && source .env.local && set +a && pnpm tsx scripts/import-historial.ts --write
 */
import { db } from "~/db";
import { medical, type MedicalKind } from "~/db/schema";

interface Entry {
  topic: string;
  kind: MedicalKind;
  onDay: string | null;
  title: string;
  details: string;
}

const CUELLO = "Cuello";
const ORINA = "Orina";
const BOCA = "Dientes y maxilofacial";
const ANTES = "Antecedentes";

const HISTORY: Entry[] = [
  // Cuello: what is still to do first.
  {
    topic: CUELLO,
    kind: "pending",
    onDay: null,
    title: "Pedir cita de la punción del ganglio (PAAF)",
    details:
      "Volante de Anatomía Patológica del Ruber Juan Bravo, preferente <15 días, emitido el 01/10/2026 por el Dr. Alacio: «P.A.A.F de órganos superficiales, punción en consulta» (2968), ganglio linfático, prescripción 32800466784. Las fechas del volante no son una cita: hay que pedirla. Cita previa Quirónsalud 900 200 008 o citaprevia@quironsalud.es.",
  },
  {
    topic: CUELLO,
    kind: "pending",
    onDay: null,
    title: "PET-TAC",
    details: "Lo recomienda la radióloga en el TAC del 14/10/2026, junto al estudio histológico. Aún sin volante.",
  },
  {
    topic: CUELLO,
    kind: "diagnosis",
    onDay: "2026-09-30",
    title: "Adenopatías laterocervicales derechas, en estudio",
    details:
      "Bultos en el lado derecho del cuello desde mediados de septiembre de 2026, sin otros síntomas. Dos destacan en los niveles II y III, de 2,3 y 3,7 cm, con focos de necrosis y pequeñas calcificaciones. Sin diagnóstico todavía: falta la punción y el PET-TAC.",
  },
  {
    topic: CUELLO,
    kind: "test",
    onDay: "2026-10-07",
    title: "TAC de cuello con contraste",
    details:
      "Quirónsalud San José, prueba 07/10/2026, informe 14/10/2026 10:29, Dra. Elena Álvarez Moreno, Acc. HQSJSC261452321. Contraste i.v. 100 ml (el encabezado dice «sin contraste», el informe dice que sí). Varias adenopatías laterocervicales derechas, sobre todo en II y III: la superior 14 × 9,9 × 23 mm y la inferior, a la altura del tiroides, 23,9 × 11,5 × 37 mm, las dos con focos necróticos y calcificaciones puntiformes. Otras, la mayor de 13,7 mm en el ángulo yugulodigástrico. Normales: nasofaringe, orofaringe, espacios parafaríngeos, masticadores y carotídeos, parótidas, submandibulares, laringe y tiroides. Posibilidades que da la radióloga: metástasis de tiroides (sin nódulo visible), tuberculosis o metástasis de origen ORL (tampoco visible). Conclusión: biopsia y PET-TAC.",
  },
  {
    topic: CUELLO,
    kind: "visit",
    onDay: "2026-10-05",
    title: "Revisión ORL",
    details: "Ruber Juan Bravo, Dr. Joaquín Alacio Casero. Sigue en estudio; le dan volantes nuevos.",
  },
  {
    topic: CUELLO,
    kind: "test",
    onDay: "2026-10-01",
    title: "Analítica: normal",
    details:
      "Health Diagnostics (Ruber Juan Bravo), extracción 01/10/2026, resultados 03/10. Hematíes 5,0, hemoglobina 14,8, leucocitos 4,9 (neutrófilos 52,2 %, linfocitos 35,5 %), plaquetas 263, LDH 149 U/l, PCR <0,06 mg/dl. Quantiferón negativo (sin tuberculosis activa), citomegalovirus IgG e IgM negativos, Epstein-Barr EBNA IgG positivo: infección pasada, no mononucleosis ahora.",
  },
  {
    topic: CUELLO,
    kind: "visit",
    onDay: "2026-10-01",
    title: "ORL, primera consulta",
    details:
      "Ruber Juan Bravo, Dr. Joaquín Alacio Casero, 01/10/2026 11:23. Bulto en el cuello de 2-3 semanas, sin otros síntomas. Ganglios en ambos lados, sobre todo en la fosa supraclavicular derecha. Eco cervical con microcalcificaciones. Diagnóstico: en estudio. Pide TAC, eco-PAAF y analítica.",
  },
  {
    topic: CUELLO,
    kind: "visit",
    onDay: "2026-09-30",
    title: "Urgencias Rey Juan Carlos",
    details:
      "Hospital Universitario Rey Juan Carlos (Móstoles), 30/09/2026 21:05, Dr. Hernán López-Tello Martínez. Dolor de garganta. Ganglio de ~2 cm en región III derecha, móvil (eco previa: 2 × 1 cm). Garganta, oídos, fosas nasales, cávum y cuerdas vocales normales. 36 °C. Piden TC cervical con contraste y revisión ORL.",
  },

  // Orina
  {
    topic: ORINA,
    kind: "visit",
    onDay: "2026-04-27",
    title: "Urología: prostatitis, alta",
    details:
      "Ruber Juan Bravo, 27/04/2026 (entonces con CIGNA). Revisión tras la infección por E. coli. Pesadez en los testículos un mes; síntomas mínimos (algún pinchazo, leve presión), sin fiebre. Eco abdominal normal; quistes en ambos epidídimos, el mayor de 11 mm en el derecho. Urocultivo negativo tras el antibiótico, cultivo de semen negativo, exudado uretral sin hallazgos. Pueden quedar síntomas leves 2-3 meses. Si vuelve a infectarse: antibiótico 14-21 días, hasta 4 semanas.",
  },
  {
    topic: ORINA,
    kind: "note",
    onDay: "2026-03-25",
    title: "Recaída y levofloxacino (terminado)",
    details:
      "Días después de la cefuroxima: picor en la uretra, molestias en vejiga y próstata. Otra cefuroxima ~7 días, poca mejora. Después levofloxacino 500 mg cada 12 h, una semana: mejora. Fecha aproximada.",
  },
  {
    topic: ORINA,
    kind: "visit",
    onDay: "2026-03-17",
    title: "Urgencias Vithas La Milagrosa: infección de orina",
    details:
      "17/03/2026, Dr. Agustín Fernández Villar (CIGNA, NHC 1009064293). Fiebre y escozor al orinar desde la mañana; 37,5 °C, pulso 98. Orina: leucocitos y hematíes positivos, nitritos negativos. Sangre: leucocitos 14,4 (neutrófilos 12,47), linfocitos 0,88 (bajos), PCR 22,3 mg/l, creatinina 1,30 mg/dl (alta), glucosa 104, resto normal. Le ponen ceftriaxona 2 g i.v., suero y metamizol; mejora. Al alta: cefuroxima 500 mg cada 12 h 7 días, 2 litros de agua al día, paracetamol 1 g cada 8 h si fiebre, urocultivo (salió E. coli).",
  },

  // Dientes y maxilofacial
  {
    topic: BOCA,
    kind: "visit",
    onDay: "2026-04-15",
    title: "Dentista",
    details: "Cita del calendario, 16:00-17:00. Sin clínica ni informe.",
  },
  {
    topic: BOCA,
    kind: "visit",
    onDay: "2025-05-27",
    title: "Cirugía maxilofacial, Quirónsalud",
    details: "Hay informe en la app de Quirónsalud («Inf cex cirugía maxilofacial hiluz»), sin abrir todavía.",
  },

  // Antecedentes
  {
    topic: ANTES,
    kind: "note",
    onDay: null,
    title: "Sin alergias conocidas ni medicación habitual",
    details:
      "Sin hipertensión, diabetes ni colesterol; nada de corazón, pulmón, riñón, digestivo, hormonal, reumático, neurológico ni oncológico. Sin marcapasos ni implantes.",
  },
  { topic: ANTES, kind: "procedure", onDay: null, title: "Apendicectomía", details: "Fecha no anotada." },
  { topic: ANTES, kind: "diagnosis", onDay: null, title: "Espermatocele y epididimitis", details: "Hace años." },
  {
    topic: ANTES,
    kind: "note",
    onDay: null,
    title: "Hábitos y medidas",
    details:
      "No fuma, alcohol ocasional, sin drogas. Ingeniero. Deporte 1-2 veces por semana, suave (antes de los compromisos). Dieta mediterránea. 75 kg, 1,80 m.",
  },
  {
    topic: ANTES,
    kind: "note",
    onDay: null,
    title: "Seguro y números de historia",
    details:
      "ASISA, póliza 990501164079701. NHC Ruber Juan Bravo 50093275, Quirónsalud San José 50186465. Antes CIGNA (Vithas La Milagrosa, NHC 1009064293).",
  },
];

const write = process.argv.includes("--write");
const there = await db.select({ title: medical.title, onDay: medical.onDay }).from(medical);
const key = (e: { title: string; onDay: string | null }) => `${e.title}|${e.onDay ?? ""}`;
const have = new Set(there.map(key));
const fresh = HISTORY.filter((e) => !have.has(key(e)));

for (const e of HISTORY) {
  console.log(`${have.has(key(e)) ? "  ya" : "  + "} [${e.topic} · ${e.kind}${e.onDay ? ` · ${e.onDay}` : ""}] ${e.title}`);
}
if (write && fresh.length > 0) await db.insert(medical).values(fresh);
console.log(`\n${fresh.length} nuevas de ${HISTORY.length}${write ? ", escritas." : ". Dry-run: añade --write para escribirlas."}`);
process.exit(0);
