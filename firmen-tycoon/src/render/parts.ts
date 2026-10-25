// Wiederverwendbare Low-Poly-Bauteile (Grundformen, Wände, Böden).

import * as THREE from 'three';
import { PALETTE } from './palette';

const materialCache = new Map<number, THREE.MeshStandardMaterial>();

export function mat(color: number): THREE.MeshStandardMaterial {
  let m = materialCache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, metalness: 0 });
    materialCache.set(color, m);
  }
  return m;
}

export function box(
  w: number, h: number, d: number, color: number | THREE.Material,
  x: number, y: number, z: number, shadows = true,
): THREE.Mesh {
  const material = typeof color === 'number' ? mat(color) : color;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  return mesh;
}

export const WALL_H = 3;
export const WALL_LOW = 0.9; // zur Kamera gewandte Wände sind niedrig („Puppenhaus“-Ansicht)
export const WALL_T = 0.3;

/** Achsparallele Wand mit Sockelleiste und heller Kappe. */
export function wall(x1: number, z1: number, x2: number, z2: number, h: number, color: number = PALETTE.wallOuter): THREE.Group {
  const g = new THREE.Group();
  const alongX = Math.abs(x2 - x1) >= Math.abs(z2 - z1);
  const len = Math.hypot(x2 - x1, z2 - z1) + WALL_T;
  const cx = (x1 + x2) / 2, cz = (z1 + z2) / 2;
  const size = (l: number, t: number): [number, number] => (alongX ? [l, t] : [t, l]);
  const [w, d] = size(len, WALL_T);
  g.add(box(w, h, d, color, cx, h / 2, cz));
  const [tw, td] = size(len + 0.02, WALL_T + 0.08);
  g.add(box(tw, 0.35, td, PALETTE.wallTrim, cx, 0.175, cz, false));
  const [cw, cd] = size(len + 0.04, WALL_T + 0.1);
  g.add(box(cw, 0.08, cd, PALETTE.wallCap, cx, h + 0.04, cz, false));
  return g;
}

/** Bodenfläche mit Fugenlinien (Fliesen bzw. Dielen). */
export function floor(x1: number, z1: number, x2: number, z2: number, color: number, lineColor: number, step: number, both: boolean): THREE.Group {
  const g = new THREE.Group();
  const w = x2 - x1, d = z2 - z1;
  g.add(box(w, 0.1, d, color, x1 + w / 2, 0.05, z1 + d / 2, false));
  for (let z = z1 + step; z < z2 - 0.01; z += step) g.add(box(w, 0.01, 0.04, lineColor, x1 + w / 2, 0.105, z, false));
  if (both) {
    for (let x = x1 + step; x < x2 - 0.01; x += step) g.add(box(0.04, 0.01, d, lineColor, x, 0.105, z1 + d / 2, false));
  }
  return g;
}

export function poster(x: number, y: number, z: number, rotY: number, color: number, w = 0.7, h = 0.9): THREE.Group {
  const g = new THREE.Group();
  g.add(box(w, h, 0.04, PALETTE.posterFrame, 0, 0, 0, false));
  g.add(box(w - 0.12, h - 0.12, 0.05, color, 0, 0, 0.005, false));
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  return g;
}

/** Kleiner deterministischer Zufallsgenerator, damit die Szene immer gleich aussieht. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

