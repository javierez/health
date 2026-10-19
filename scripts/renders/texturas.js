// The surfaces, drawn in code: brushed and blasted aluminium, knurling, rubber,
// paper. Each is a 512 px grey map (0 = low, 1 = high) that tiles, used as
// relief and as roughness.
import * as THREE from "three";

const N = 512;

// The same textures on every bake: a fixed seed, not Math.random.
let seed = 7;
const rand = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

const suave = (t) => t * t * (3 - 2 * t);

/** Value noise with `cx` × `cy` cells, so it tiles. Few cells across and many down: streaks. */
function capa(cx, cy) {
  const g = Float32Array.from({ length: cx * cy }, rand);
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) {
    const fy = (y / N) * cy;
    const y0 = Math.floor(fy);
    const ty = suave(fy - y0);
    const r0 = (y0 % cy) * cx;
    const r1 = ((y0 + 1) % cy) * cx;
    for (let x = 0; x < N; x++) {
      const fx = (x / N) * cx;
      const x0 = Math.floor(fx);
      const tx = suave(fx - x0);
      const x1 = (x0 + 1) % cx;
      const a = g[r0 + (x0 % cx)] + (g[r0 + x1] - g[r0 + (x0 % cx)]) * tx;
      const b = g[r1 + (x0 % cx)] + (g[r1 + x1] - g[r1 + (x0 % cx)]) * tx;
      out[y * N + x] = a + (b - a) * ty;
    }
  }
  return out;
}

/** Octaves of noise, each twice as fine and half as strong. */
function fbm(c, octavas = 4) {
  const out = new Float32Array(N * N);
  let peso = 0.5;
  let total = 0;
  for (let o = 0; o < octavas; o++) {
    const l = capa(c << o, c << o);
    for (let i = 0; i < out.length; i++) out[i] += l[i] * peso;
    total += peso;
    peso /= 2;
  }
  return out.map((v) => v / total);
}

const mezcla = (...capas) => {
  const out = new Float32Array(N * N);
  for (const [l, w] of capas) for (let i = 0; i < out.length; i++) out[i] += l[i] * w;
  return out;
};

const SUPERFICIES = {
  // Brushed: long streaks one way.
  cepillado: () => mezcla([capa(2, 380), 0.55], [capa(6, 200), 0.3], [fbm(8, 2), 0.15]),
  // Bead-blasted: even, fine.
  arenado: () => mezcla([capa(220, 220), 0.6], [capa(70, 70), 0.4]),
  // Moulded rubber: a very fine grain.
  grano: () => mezcla([capa(256, 256), 0.7], [capa(90, 90), 0.3]),
  // Knurling on a bar: a fine diamond.
  moleteado: () =>
    Float32Array.from({ length: N * N }, (_, i) => {
      const x = i % N;
      const y = Math.floor(i / N);
      return 0.5 + 0.5 * Math.sin((x + y) * 0.6) * Math.sin((x - y) * 0.6);
    }),
  // The edge of a book's pages.
  paginas: () => mezcla([capa(1, 420), 0.85], [capa(40, 40), 0.15]),
};

const hechas = new Map();
const mapa = (nombre) => {
  if (!hechas.has(nombre)) hechas.set(nombre, SUPERFICIES[nombre]());
  return hechas.get(nombre);
};

function textura(key, repetir, pixel) {
  if (hechas.has(key)) return hechas.get(key);
  const data = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) data.set(pixel(i), i * 4);
  const t = new THREE.DataTexture(data, N, N);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repetir, repetir);
  t.anisotropy = 8;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  hechas.set(key, t);
  return t;
}

/** The map as data, squeezed between min and max: relief, roughness. */
export function gris(nombre, min = 0, max = 1, repetir = 1) {
  const v = mapa(nombre);
  return textura(`${nombre}|${min}|${max}|${repetir}`, repetir, (i) => {
    const g = (min + (max - min) * Math.max(0, Math.min(1, v[i]))) * 255;
    return [g, g, g, 255];
  });
}
