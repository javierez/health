// What the objects are made of: brushed aluminium, chosen by Javier on
// 16-oct-2026 over 13 other finishes (titanium, brass, Braun, wood, marble…).
// Every object is built from four parts plus a few that are the same in any
// finish: a stopwatch's crystal, a book's pages, a tyre.
import * as THREE from "three";

import { gris } from "./texturas.js";

const metal = (color, rug, extra = {}) => ({ color, metal: 1, rug, ...extra });
const mate = (color, rug, extra = {}) => ({ color, metal: 0, rug, ...extra });

const PARTES = {
  cuerpo: metal("#c9ccd0", 0.36, { tex: "cepillado", relieve: 0.4, anis: 0.7 }),
  oscuro: metal("#55585d", 0.42, { tex: "arenado", relieve: 0.2 }),
  claro: metal("#e2e4e7", 0.3, { tex: "cepillado", relieve: 0.3 }),
  metal: metal("#b5b8bc", 0.25, { tex: "cepillado" }),
  // A white enamel dial: in metal the face mirrors the dark and goes black.
  esfera: mate("#f4f3f0", 0.35),
  papel: mate("#f3efe6", 0.85, { tex: "paginas", relieve: 0.8 }),
  neumatico: mate("#1d1d1e", 0.8, { tex: "grano", relieve: 0.4 }),
  // The enamel inlay of the warning sign: the one amber in the set.
  ambar: mate("#f0a020", 0.3),
};

const side = THREE.DoubleSide;

/**
 * The material of a part: cuerpo, oscuro, claro, metal, esfera, papel,
 * neumatico, ambar or cristal. `extra` overrides it for one piece (the knurled bar of the dumbbell).
 */
export function rol(parte, extra = {}) {
  if (parte === "cristal")
    return new THREE.MeshPhysicalMaterial({ color: "#ffffff", side, transmission: 1, thickness: 0.05, roughness: 0.02, ior: 1.5, clearcoat: 1 });
  const s = { ...PARTES[parte], ...extra };
  const rep = s.rep ?? 1;
  const m = new THREE.MeshPhysicalMaterial({
    color: s.color,
    side,
    metalness: s.metal,
    roughness: s.rug,
    anisotropy: s.anis ?? 0,
    envMapIntensity: s.metal ? 1.4 : 1,
  });
  if (s.tex) {
    // The surface also changes how rough each spot is: never perfectly even.
    m.roughnessMap = gris(s.tex, 0.7, 1, rep);
    if (s.relieve) {
      m.bumpMap = gris(s.tex, 0, 1, rep);
      m.bumpScale = s.relieve;
    }
  }
  return m;
}
