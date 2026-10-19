// The pieces every object in `objects.js` is built from: rounded slabs,
// rods, discs lying down.
import * as THREE from "three";

export const redondo = (w, h, r) => {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
};

export const extruye = (forma, fondo, bisel) => {
  const g = new THREE.ExtrudeGeometry(forma, {
    depth: fondo,
    bevelEnabled: true,
    bevelThickness: bisel,
    bevelSize: bisel,
    bevelSegments: 6,
    curveSegments: 24,
  });
  g.center();
  return g;
};

export const pieza = (geo, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
};

/** A rounded rod from a to b: frames, handles, laces. */
export const barra = (a, b, r, mat) => {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const g = new THREE.CapsuleGeometry(r, A.distanceTo(B), 8, 20);
  const m = new THREE.Mesh(g, mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  return m;
};

/** Lying along x: a cylinder's axis is y by default. */
export const tumbado = (m) => {
  m.rotation.z = Math.PI / 2;
  return m;
};
