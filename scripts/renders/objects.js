// One object per thing he does: the dumbbell, the stopwatch, the bike, the
// moon… Real proportions, thin parts, sharp edges, in brushed aluminium
// (`materiales.js`). Baked to `public/renders/<key>.webp` by
// `scripts/bake-renders.ts`; the panel shows the images, never WebGL.
import * as THREE from "three";

import { barra, extruye, pieza, redondo, tumbado } from "./kit.js";
import { rol } from "./materiales.js";

const deg = (d) => (d * Math.PI) / 180;
const plata = () => rol("cuerpo");
const oscuro = () => rol("oscuro");
const claro = () => rol("claro");
const acero = () => rol("metal");

/** A disc with chamfered edges, its axis along y. */
const disco = (r, h, ch = Math.min(h / 3, 0.03), mat) => {
  const p = [
    [0, -h / 2],
    [r - ch, -h / 2],
    [r, -h / 2 + ch],
    [r, h / 2 - ch],
    [r - ch, h / 2],
    [0, h / 2],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return pieza(new THREE.LatheGeometry(p, 72), mat);
};

/** A rod flattened into a strip: cutlery, hands. */
const plano = (m, k = 0.35) => {
  m.scale.z = k;
  return m;
};

// Gym: a slim dumbbell, two thin plates a side.
function gym() {
  const g = new THREE.Group();
  g.add(tumbado(pieza(new THREE.CylinderGeometry(0.05, 0.05, 1.5, 32), rol("metal", { tex: "moleteado", relieve: 0.6, rep: 4 }))));
  for (const s of [-1, 1]) {
    g.add(tumbado(disco(0.44, 0.08, 0.025, oscuro())).translateY(-s * 0.44));
    g.add(tumbado(disco(0.36, 0.07, 0.02, oscuro())).translateY(-s * 0.53));
    g.add(tumbado(disco(0.09, 0.08, 0.015, plata())).translateY(-s * 0.36));
    g.add(tumbado(disco(0.07, 0.06, 0.015, plata())).translateY(-s * 0.72));
  }
  g.rotation.set(deg(10), deg(-32), deg(12));
  return g;
}

// Running: the stopwatch.
function run() {
  const g = new THREE.Group();
  const body = disco(0.62, 0.2, 0.05, plata());
  body.rotation.x = Math.PI / 2;
  g.add(body);
  const face = disco(0.52, 0.02, 0.005, rol("esfera"));
  face.rotation.x = Math.PI / 2;
  face.position.z = 0.1;
  g.add(face);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const t = pieza(new THREE.BoxGeometry(0.018, i % 3 === 0 ? 0.1 : 0.05, 0.01), oscuro(), Math.sin(a) * 0.43, Math.cos(a) * 0.43, 0.115);
    t.rotation.z = -a;
    g.add(t);
  }
  g.add(barra([0, 0, 0.12], [0.2, 0.26, 0.12], 0.012, oscuro()));
  g.add(pieza(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 20), oscuro(), 0, 0, 0.12).rotateX(Math.PI / 2));
  // The crystal over the face.
  const crystal = disco(0.53, 0.04, 0.015, rol("cristal"));
  crystal.rotation.x = Math.PI / 2;
  crystal.position.z = 0.15;
  g.add(crystal);
  g.add(pieza(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 24), acero(), 0, 0.68, 0));
  g.add(pieza(new THREE.TorusGeometry(0.1, 0.022, 12, 40), acero(), 0, 0.84, 0));
  const button = pieza(new THREE.CylinderGeometry(0.045, 0.045, 0.1, 20), acero(), 0.48, 0.48, 0);
  button.rotation.z = deg(-45);
  g.add(button);
  g.rotation.set(deg(-4), deg(-24), deg(-6));
  return g;
}

// Cycling: a road bike, thin tubes and thin tyres.
function bike() {
  const g = new THREE.Group();
  const marco = plata();
  const back = [-0.66, 0, 0];
  const front = [0.66, 0, 0];
  const bb = [-0.06, -0.04, 0];
  const seat = [-0.22, 0.6, 0];
  const head = [0.44, 0.58, 0];
  for (const [x] of [back, front]) {
    g.add(pieza(new THREE.TorusGeometry(0.46, 0.028, 12, 72), rol("neumatico"), x, 0, 0));
    g.add(pieza(new THREE.TorusGeometry(0.42, 0.014, 8, 72), acero(), x, 0, 0));
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.add(barra([x, 0, 0], [x + Math.cos(a) * 0.41, Math.sin(a) * 0.41, 0], 0.004, acero()));
    }
    g.add(pieza(new THREE.CylinderGeometry(0.035, 0.035, 0.08, 16), acero(), x, 0, 0).rotateX(Math.PI / 2));
  }
  for (const [a, b] of [
    [back, bb],
    [bb, seat],
    [seat, back],
    [seat, head],
    [head, bb],
    [head, front],
  ])
    g.add(barra(a, b, 0.022, marco));
  g.add(barra(seat, [-0.25, 0.7, 0], 0.016, acero()));
  g.add(plano(barra([-0.4, 0.72, 0], [-0.1, 0.72, 0], 0.035, oscuro()), 0.9));
  g.add(barra(head, [0.4, 0.74, 0], 0.02, marco));
  g.add(barra([0.4, 0.74, -0.18], [0.4, 0.74, 0.18], 0.018, oscuro()));
  g.add(pieza(new THREE.CylinderGeometry(0.1, 0.1, 0.015, 32), acero(), bb[0], bb[1], 0.04).rotateX(Math.PI / 2));
  g.rotation.set(deg(6), deg(-30), 0);
  return g;
}

// Sleep: a thin crescent with sharp tips.
function sleep() {
  const R = 0.8;
  const r = 0.76;
  const d = 0.3;
  const x = (R * R - r * r + d * d) / (2 * d);
  const y = Math.sqrt(R * R - x * x);
  const luna = new THREE.Shape();
  luna.absarc(0, 0, R, Math.atan2(y, x), Math.PI * 2 - Math.atan2(y, x), false);
  luna.absarc(d, 0, r, Math.PI * 2 - Math.atan2(y, x - d), Math.atan2(y, x - d), true);
  const m = pieza(extruye(luna, 0.12, 0.0135), plata());
  m.rotation.set(deg(-6), deg(-24), deg(-20));
  const g = new THREE.Group();
  g.add(m);
  return g;
}

// A pill to take: a slender capsule and a scored tablet.
function pill() {
  const g = new THREE.Group();
  const capsula = new THREE.Group();
  [
    [oscuro, 1],
    [claro, -1],
  ].forEach(([mat, s]) => {
    capsula.add(pieza(new THREE.CylinderGeometry(0.16, 0.16, 0.42, 48), mat(), 0, s * 0.21, 0));
    capsula.add(pieza(new THREE.SphereGeometry(0.16, 48, 24), mat(), 0, s * 0.42, 0));
  });
  capsula.rotation.set(deg(20), 0, deg(-56));
  capsula.position.set(-0.16, 0.2, 0);
  g.add(capsula);
  const tablet = new THREE.Group();
  tablet.add(disco(0.3, 0.1, 0.035, claro()));
  tablet.add(pieza(new THREE.BoxGeometry(0.44, 0.012, 0.02), oscuro(), 0, 0.05, 0));
  tablet.rotation.set(deg(62), deg(10), 0);
  tablet.position.set(0.4, -0.36, 0.18);
  g.add(tablet);
  return g;
}

// Reading: a slim hardcover, standing, with its ribbon.
function book() {
  const g = new THREE.Group();
  const tapa = oscuro();
  for (const z of [0.13, -0.13]) g.add(pieza(extruye(redondo(1.1, 1.5, 0.02), 0.025, 0.0027), tapa, 0, 0, z));
  g.add(pieza(new THREE.BoxGeometry(0.03, 1.5, 0.29), tapa, -0.56, 0, 0));
  g.add(pieza(new THREE.BoxGeometry(1.06, 1.44, 0.23), rol("papel"), 0.01, 0, 0));
  g.add(pieza(new THREE.BoxGeometry(0.6, 0.012, 0.004), acero(), 0.02, 0.36, 0.145));
  g.add(pieza(new THREE.BoxGeometry(0.05, 0.36, 0.006), acero(), 0.24, -0.88, 0.02));
  g.rotation.set(deg(4), deg(-34), deg(4));
  return g;
}

// Food: a plate with a fork and a knife on it.
function food() {
  const g = new THREE.Group();
  const perfil = [
    [0, 0],
    [0.48, 0],
    [0.54, 0.02],
    [0.94, 0.1],
    [0.97, 0.125],
    [0.94, 0.135],
    [0.56, 0.06],
    [0.48, 0.035],
    [0, 0.035],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  g.add(pieza(new THREE.LatheGeometry(perfil, 96), claro()));
  const fork = new THREE.Group();
  fork.add(plano(barra([0, 0, 0.9], [0, 0, 0.1], 0.04, oscuro()), 0.3));
  fork.add(pieza(extruye(redondo(0.2, 0.24, 0.06), 0.015, 0.0023), oscuro(), 0, 0, 0).rotateX(Math.PI / 2));
  for (const x of [-0.075, -0.025, 0.025, 0.075]) fork.add(plano(barra([x, 0, -0.1], [x, 0, -0.42], 0.012, oscuro()), 0.5));
  fork.position.set(-0.16, 0.08, 0.06);
  fork.rotation.y = deg(28);
  g.add(fork);
  const knife = new THREE.Group();
  const blade = new THREE.Shape();
  blade.moveTo(-0.04, 0);
  blade.lineTo(0.05, 0);
  blade.quadraticCurveTo(0.07, 0.4, 0.0, 0.62);
  blade.quadraticCurveTo(-0.04, 0.4, -0.04, 0);
  knife.add(pieza(extruye(blade, 0.008, 0.0014), oscuro(), 0, 0, -0.31).rotateX(-Math.PI / 2));
  knife.add(plano(barra([0, 0, 0.0], [0, 0, 0.82], 0.04, oscuro()), 0.3));
  knife.position.set(0.18, 0.08, -0.1);
  knife.rotation.y = deg(28);
  g.add(knife);
  g.rotation.set(deg(34), deg(-10), 0);
  return g;
}

// Medical: a plain cross, machined.
function medical() {
  const g = new THREE.Group();
  const a = 0.3;
  const b = 1.1;
  const s = new THREE.Shape();
  s.moveTo(-a / 2, -b / 2);
  [
    [a / 2, -b / 2],
    [a / 2, -a / 2],
    [b / 2, -a / 2],
    [b / 2, a / 2],
    [a / 2, a / 2],
    [a / 2, b / 2],
    [-a / 2, b / 2],
    [-a / 2, a / 2],
    [-b / 2, a / 2],
    [-b / 2, -a / 2],
    [-a / 2, -a / 2],
  ].forEach(([x, y]) => s.lineTo(x, y));
  g.add(pieza(extruye(s, 0.14, 0.0113), plata()));
  g.rotation.set(deg(-6), deg(-30), 0);
  return g;
}

// Work: the laptop, open.
function work() {
  const g = new THREE.Group();
  const base = pieza(extruye(redondo(1.6, 1.08, 0.06), 0.05, 0.0054), plata());
  base.rotation.x = -Math.PI / 2;
  g.add(base);
  // The keys, four rows of twelve, and the trackpad.
  for (let row = 0; row < 4; row++)
    for (let col = 0; col < 12; col++)
      g.add(pieza(new THREE.BoxGeometry(0.088, 0.012, 0.088), oscuro(), -0.578 + col * 0.105, 0.04, -0.33 + row * 0.105));
  g.add(pieza(new THREE.BoxGeometry(0.52, 0.004, 0.3), rol("cuerpo", { rug: 0.2 }), 0, 0.037, 0.3));
  const lid = new THREE.Group();
  const shell = pieza(extruye(redondo(1.6, 1.04, 0.06), 0.03, 0.0036), plata(), 0, 0.52, 0);
  lid.add(shell);
  lid.add(pieza(new THREE.BoxGeometry(1.48, 0.92, 0.004), oscuro(), 0, 0.53, 0.026));
  lid.position.set(0, 0.04, -0.54);
  lid.rotation.x = deg(-16);
  g.add(lid);
  g.rotation.set(deg(14), deg(-32), 0);
  return g;
}

// Any other habit: a thin disc with a tick on it.
function habit() {
  const g = new THREE.Group();
  const d = disco(0.62, 0.12, 0.03, plata());
  d.rotation.x = Math.PI / 2;
  g.add(d);
  const check = new THREE.CatmullRomCurve3(
    [
      [-0.24, 0.02],
      [-0.07, -0.16],
      [0.26, 0.2],
    ].map(([x, y]) => new THREE.Vector3(x, y, 0.07)),
    false,
    "catmullrom",
    0,
  );
  g.add(pieza(new THREE.TubeGeometry(check, 40, 0.032, 12), oscuro()));
  for (const p of [check.points[0], check.points[2]]) g.add(pieza(new THREE.SphereGeometry(0.032, 16, 12), oscuro(), p.x, p.y, p.z));
  g.rotation.set(deg(-8), deg(-26), deg(4));
  return g;
}

/** An equilateral triangle with rounded corners, centred on its centroid. */
const triangulo = (lado, r) => {
  const h = (lado * Math.sqrt(3)) / 2;
  const v = [
    new THREE.Vector2(0, (2 * h) / 3),
    new THREE.Vector2(-lado / 2, -h / 3),
    new THREE.Vector2(lado / 2, -h / 3),
  ];
  const s = new THREE.Shape();
  v.forEach((p, i) => {
    const a = p.clone().add(v[(i + 2) % 3].clone().sub(p).setLength(r));
    const b = p.clone().add(v[(i + 1) % 3].clone().sub(p).setLength(r));
    if (i === 0) s.moveTo(a.x, a.y);
    else s.lineTo(a.x, a.y);
    s.quadraticCurveTo(p.x, p.y, b.x, b.y);
  });
  s.closePath();
  return s;
};

// Warning: an aluminium sign with an amber enamel inlay and a dark "!".
// Baked still and as a turning loop (`SPINS`), for the pending alert.
function warning() {
  const g = new THREE.Group();
  g.add(pieza(extruye(triangulo(1.5, 0.16), 0.12, 0.012), plata()));
  g.add(pieza(extruye(triangulo(1.18, 0.1), 0.02, 0.004), rol("ambar"), 0, 0, 0.075));
  g.add(pieza(extruye(redondo(0.11, 0.42, 0.05), 0.03, 0.006), oscuro(), 0, 0.04, 0.095));
  const dot = disco(0.065, 0.03, 0.01, oscuro());
  dot.rotation.x = Math.PI / 2;
  dot.position.set(0, -0.27, 0.095);
  g.add(dot);
  g.rotation.set(deg(-4), 0, 0);
  return g;
}

export const OBJECTS = { gym, run, bike, sleep, pill, book, food, medical, work, habit, warning };

/** Objects also baked as a loop of frames, side by side in one strip. */
export const SPINS = { warning: 24 };
