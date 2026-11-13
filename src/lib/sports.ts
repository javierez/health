/** WHOOP's sport names, in his words. */
const SPORT: Record<string, string> = {
  running: "Correr",
  weightlifting: "Pesas",
  "functional-fitness": "Funcional",
  "strength-trainer": "Fuerza",
  cycling: "Bici",
  walking: "Andar",
  "hiking/rucking": "Senderismo",
  padel: "Pádel",
  tennis: "Tenis",
  soccer: "Fútbol",
  swimming: "Nadar",
  yoga: "Yoga",
  activity: "Actividad",
  powerlifting: "Powerlifting",
  spin: "Spinning",
  skiing: "Esquí",
  "race-walking": "Marcha",
};
export const sportName = (s: string) => SPORT[s] ?? s.charAt(0).toUpperCase() + s.slice(1);
