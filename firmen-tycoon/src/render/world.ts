// Low-Poly-Platzhalter aus Grundformen: Gelände, Straße, Garage/Lager, Büro.

import * as THREE from 'three';
import { PALETTE } from './palette';

const materialCache = new Map<number, THREE.MeshStandardMaterial>();

function mat(color: number): THREE.MeshStandardMaterial {
  let m = materialCache.get(color);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9, metalness: 0 });
    materialCache.set(color, m);
  }
  return m;
}

function box(
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

export interface World {
  root: THREE.Group;
  /** Kleinteile, die nur beim Reinzoomen sichtbar sind. */
  details: THREE.Group;
  /** Begrenzung des begehbaren Bereichs für die Kamera (x/z). */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export function buildWorld(): World {
  const root = new THREE.Group();
  const details = new THREE.Group();

  root.add(buildGround());
  root.add(buildRoad());
  root.add(buildLot());

  const building = buildBuilding(details);
  building.position.set(-2, 0, 0);
  details.position.copy(building.position);
  root.add(building);
  root.add(details);

  const van = buildVan();
  van.position.set(8, 0, 9);
  van.rotation.y = -Math.PI / 2;
  root.add(van);

  root.add(buildFence());
  root.add(buildSign());
  root.add(buildTrees());

  return { root, details, bounds: { minX: -32, maxX: 32, minZ: -26, maxZ: 30 } };
}

function buildGround(): THREE.Object3D {
  const g = new THREE.Group();
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), mat(PALETTE.grass));
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  g.add(grass);
  // Ein paar dunklere Grasflecken für etwas Struktur.
  const rand = mulberry32(7);
  for (let i = 0; i < 26; i++) {
    const r = 2 + rand() * 4;
    const patch = new THREE.Mesh(new THREE.CircleGeometry(r, 6), mat(PALETTE.grassDark));
    patch.rotation.x = -Math.PI / 2;
    const angle = rand() * Math.PI * 2;
    const dist = 30 + rand() * 40;
    patch.position.set(Math.cos(angle) * dist, 0.01, Math.sin(angle) * dist);
    patch.receiveShadow = true;
    g.add(patch);
  }
  return g;
}

function buildRoad(): THREE.Object3D {
  const g = new THREE.Group();
  const z = 20;
  g.add(box(260, 0.1, 8, PALETTE.asphalt, 0, 0.05, z, false));
  g.add(box(260, 0.2, 0.5, PALETTE.curb, 0, 0.1, z - 4.25, false));
  g.add(box(260, 0.2, 0.5, PALETTE.curb, 0, 0.1, z + 4.25, false));
  // Gehweg zwischen Straße und Gelände
  g.add(box(260, 0.14, 2.4, PALETTE.sidewalk, 0, 0.07, z - 5.7, false));
  for (let x = -128; x < 128; x += 6) {
    g.add(box(3, 0.02, 0.25, PALETTE.roadLine, x, 0.11, z, false));
  }
  return g;
}

function buildLot(): THREE.Object3D {
  const g = new THREE.Group();
  // Hofbelag
  g.add(box(36, 0.1, 26, PALETTE.lot, 0, 0.05, 1, false));
  // Zufahrt zur Straße
  g.add(box(7, 0.1, 4, PALETTE.lot, 6, 0.05, 15.5, false));
  // Parkplatzmarkierungen
  for (let i = 0; i < 4; i++) {
    g.add(box(0.15, 0.02, 4.5, PALETTE.roadLine, 2 + i * 3, 0.11, 7, false));
  }
  return g;
}

const WALL_H = 3;
const WALL_LOW = 0.9; // zur Kamera gewandte Wände sind niedrig („Puppenhaus“-Ansicht)
const WALL_T = 0.3;

/** Achsparallele Wand mit Sockelleiste und heller Kappe. */
function wall(x1: number, z1: number, x2: number, z2: number, h: number, color: number = PALETTE.wallOuter): THREE.Group {
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
function floor(x1: number, z1: number, x2: number, z2: number, color: number, lineColor: number, step: number, both: boolean): THREE.Group {
  const g = new THREE.Group();
  const w = x2 - x1, d = z2 - z1;
  g.add(box(w, 0.1, d, color, x1 + w / 2, 0.05, z1 + d / 2, false));
  for (let z = z1 + step; z < z2 - 0.01; z += step) g.add(box(w, 0.01, 0.04, lineColor, x1 + w / 2, 0.105, z, false));
  if (both) {
    for (let x = x1 + step; x < x2 - 0.01; x += step) g.add(box(0.04, 0.01, d, lineColor, x, 0.105, z1 + d / 2, false));
  }
  return g;
}

function poster(x: number, y: number, z: number, rotY: number, color: number, w = 0.7, h = 0.9): THREE.Group {
  const g = new THREE.Group();
  g.add(box(w, h, 0.04, PALETTE.posterFrame, 0, 0, 0, false));
  g.add(box(w - 0.12, h - 0.12, 0.05, color, 0, 0, 0.005, false));
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  return g;
}

/**
 * Firmengebäude ohne Dach: Lager (links) und Büro (rechts hinten), verbunden durch eine Tür.
 * Lokale Koordinaten: Lager x -8…4 / z -6…4, Büro x 4…10 / z -6…0.
 * Kleinteile landen in `details` (gleiches Koordinatensystem), um sie beim Rauszoomen auszublenden.
 */
function buildBuilding(details: THREE.Group): THREE.Group {
  const g = new THREE.Group();
  const H = WALL_H, L = WALL_LOW;

  g.add(floor(-8, -6, 4, 4, PALETTE.floorStore, PALETTE.floorStoreLine, 1.5, true));
  g.add(floor(4, -6, 10, 0, PALETTE.floorOffice, PALETTE.floorOfficeLine, 0.5, false));

  // Außenwände hinten/links hoch, vorne/rechts niedrig
  g.add(wall(-8, -6, 10, -6, H));
  g.add(wall(-8, -6, -8, 4, H));
  g.add(wall(-8, 4, -3, 4, L));
  g.add(wall(1, 4, 4, 4, L));
  g.add(wall(4, 0, 4, 4, L));
  g.add(wall(4, 0, 6, 0, L));
  g.add(wall(7, 0, 10, 0, L));
  g.add(wall(10, -6, 10, 0, L));
  // Innenwand Lager | Büro mit Tür
  g.add(wall(4, -6, 4, -3.5, H, PALETTE.wallInner));
  g.add(wall(4, -2.5, 4, 0, H, PALETTE.wallInner));
  // Olivfarbene Wandverkleidung im Büro
  g.add(box(5.6, 2.2, 0.04, PALETTE.wallOffice, 7, 1.45, -5.83, false));
  g.add(box(0.04, 2.2, 2.3, PALETTE.wallOffice, 4.17, 1.45, -4.75, false));
  // Aufgerolltes Rolltor über der Lagereinfahrt
  g.add(box(4.2, 0.35, 0.35, PALETTE.door, -1, L + 0.2, 4));
  // Türrahmen zwischen Lager und Büro
  const frame = new THREE.Group();
  frame.add(box(0.12, 2.2, 0.4, PALETTE.doorFrame, -0.56, 1.1, 0));
  frame.add(box(0.12, 2.2, 0.4, PALETTE.doorFrame, 0.56, 1.1, 0));
  frame.add(box(1.24, 0.15, 0.4, PALETTE.doorFrame, 0, 2.25, 0));
  frame.position.set(4, 0, -3);
  frame.rotation.y = Math.PI / 2;
  g.add(frame);

  // Regale im Lager: Reihe an der Rückwand + zwei Doppelreihen
  const rand = mulberry32(42);
  const shelves: [number, number, number][] = [
    [-6.2, -5.4, 0], [-3.0, -5.4, 0], [0.2, -5.4, 0],
    [-5.6, -2.4, Math.PI / 2], [-5.6, 0.7, Math.PI / 2],
    [-4.8, -2.4, Math.PI / 2], [-4.8, 0.7, Math.PI / 2],
    [-1.6, -2.4, Math.PI / 2], [-1.6, 0.7, Math.PI / 2],
  ];
  for (const [x, z, rot] of shelves) {
    const { frame, goods } = buildShelf(rand);
    for (const o of [frame, goods]) {
      o.position.set(x, 0.1, z);
      o.rotation.y = rot;
    }
    g.add(frame);
    details.add(goods);
  }
  // Packtisch und Palette am Tor
  g.add(box(2.2, 0.08, 1, PALETTE.shelfWood, 2.4, 0.95, 2.6));
  for (const [x, z] of [[1.4, 2.2], [3.4, 2.2], [1.4, 3.0], [3.4, 3.0]]) g.add(box(0.08, 0.9, 0.08, PALETTE.shelf, x, 0.5, z));
  g.add(box(1.4, 0.15, 1.2, PALETTE.shelfWood, -6.6, 0.18, 2.8));
  details.add(box(0.6, 0.5, 0.5, PALETTE.box[0], -6.9, 0.5, 2.6));
  details.add(box(0.6, 0.45, 0.5, PALETTE.box[1], -6.3, 0.48, 3.0));
  details.add(box(0.5, 0.4, 0.45, PALETTE.box[2], -6.7, 0.95, 2.75));
  details.add(box(0.5, 0.35, 0.4, PALETTE.box[3], 2.1, 1.17, 2.6));

  // Poster an der Lagerrückwand
  details.add(poster(-6.2, 2.3, -5.82, 0, PALETTE.posterA));
  details.add(poster(-3.0, 2.4, -5.82, 0, PALETTE.posterB, 0.9, 0.6));
  details.add(poster(-7.82, 2.0, -1, Math.PI / 2, PALETTE.posterC));

  // Büro: Schreibtisch, Stuhl, Schrank, Pflanze
  g.add(box(2, 0.08, 0.9, PALETTE.desk, 7.5, 0.8, -4.6));
  for (const [x, z] of [[6.6, -4.95], [8.4, -4.95], [6.6, -4.25], [8.4, -4.25]]) g.add(box(0.08, 0.75, 0.08, PALETTE.desk, x, 0.42, z));
  g.add(box(0.55, 0.5, 0.55, PALETTE.chair, 7.5, 0.37, -3.6));
  g.add(box(0.55, 0.6, 0.08, PALETTE.chair, 7.5, 0.9, -3.35));
  g.add(box(0.5, 1.9, 1.6, PALETTE.shelf, 9.55, 1.05, -2.2));
  details.add(box(0.6, 0.45, 0.05, PALETTE.monitor, 7.5, 1.1, -4.85));
  details.add(box(0.4, 0.03, 0.15, PALETTE.monitor, 7.5, 0.86, -4.5));
  details.add(box(0.4, 0.4, 0.4, PALETTE.pot, 5, 0.3, -5.4));
  const plant = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 0), mat(PALETTE.leaves[0]));
  plant.position.set(5, 0.85, -5.4);
  plant.castShadow = true;
  details.add(plant);
  details.add(poster(8.6, 2.1, -5.78, 0, PALETTE.posterB, 0.6, 0.8));
  details.add(poster(5.6, 2.2, -5.78, 0, PALETTE.posterA, 0.5, 0.6));

  return g;
}

function buildShelf(rand: () => number): { frame: THREE.Group; goods: THREE.Group } {
  const frame = new THREE.Group();
  const goods = new THREE.Group();
  const len = 3, depth = 0.8, height = 2.2;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      frame.add(box(0.1, height, 0.1, PALETTE.shelf, sx * (len / 2 - 0.05), height / 2, sz * (depth / 2 - 0.05)));
    }
  }
  const levels = [0.15, 0.85, 1.55, 2.15];
  for (const y of levels) {
    frame.add(box(len, 0.06, depth, PALETTE.shelfWood, 0, y, 0, false));
  }
  // Ware auf den Böden (zufällig) – nur beim Reinzoomen sichtbar
  for (const y of levels.slice(0, 3)) {
    let x = -len / 2 + 0.15;
    while (x < len / 2 - 0.4) {
      const bw = 0.35 + rand() * 0.35;
      if (rand() > 0.25) {
        const bh = 0.25 + rand() * 0.35;
        const color = PALETTE.box[Math.floor(rand() * PALETTE.box.length)];
        goods.add(box(bw, bh, depth * 0.75, color, x + bw / 2, y + 0.03 + bh / 2, 0));
      }
      x += bw + 0.08;
    }
  }
  return { frame, goods };
}

function buildVan(): THREE.Group {
  const van = new THREE.Group();
  van.add(box(4.6, 1.6, 2, PALETTE.van, 0, 1.25, 0));
  van.add(box(1.2, 1.1, 1.9, PALETTE.van, 2.85, 1.0, 0));
  van.add(box(4.62, 0.25, 2.02, PALETTE.vanAccent, 0, 1.0, 0));
  const glass = mat(PALETTE.window);
  van.add(box(0.06, 0.6, 1.7, glass, 3.46, 1.3, 0, false));
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 8);
  for (const x of [-1.5, 2.3]) {
    for (const z of [-1, 1]) {
      const wheel = new THREE.Mesh(wheelGeo, mat(PALETTE.tire));
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(x, 0.42, z);
      wheel.castShadow = true;
      van.add(wheel);
    }
  }
  return van;
}

function buildFence(): THREE.Group {
  const g = new THREE.Group();
  const minX = -18, maxX = 18, minZ = -12, maxZ = 14;
  const post = (x: number, z: number) => g.add(box(0.2, 1.2, 0.2, PALETTE.fence, x, 0.6, z));
  const rail = (x1: number, z1: number, x2: number, z2: number) => {
    const len = Math.hypot(x2 - x1, z2 - z1);
    const r = box(len, 0.1, 0.08, PALETTE.fence, (x1 + x2) / 2, 0.9, (z1 + z2) / 2, false);
    r.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
    g.add(r);
  };
  for (let x = minX; x <= maxX; x += 3) { post(x, minZ); }
  for (let z = minZ; z <= maxZ; z += 3) { post(minX, z); post(maxX, z); }
  rail(minX, minZ, maxX, minZ);
  rail(minX, minZ, minX, maxZ);
  rail(maxX, minZ, maxX, maxZ);
  // Vorne Lücke für die Zufahrt (x 2.5 … 9.5)
  for (let x = minX; x <= 2; x += 3) post(x, maxZ);
  for (let x = 10; x <= maxX; x += 3) post(x, maxZ);
  rail(minX, maxZ, 2, maxZ);
  rail(10, maxZ, maxX, maxZ);
  return g;
}

function buildSign(): THREE.Group {
  const g = new THREE.Group();
  g.add(box(0.2, 2.2, 0.2, PALETTE.fence, 11, 1.1, 15));
  g.add(box(0.2, 2.2, 0.2, PALETTE.fence, 13.6, 1.1, 15));
  g.add(box(3.2, 1.1, 0.15, PALETTE.sign, 12.3, 2.1, 15));
  g.add(box(2.4, 0.15, 0.05, PALETTE.signText, 12.3, 2.3, 15.08, false));
  g.add(box(1.6, 0.15, 0.05, PALETTE.signText, 12.3, 1.95, 15.08, false));
  return g;
}

function buildTrees(): THREE.Group {
  const g = new THREE.Group();
  const rand = mulberry32(3);
  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.25, 1.4, 6);
  const spots: [number, number][] = [
    [-22, -8], [-24, 4], [-21, 12], [22, -9], [24, 2], [23, 11],
    [-12, -17], [-4, -18], [6, -17], [15, -18], [-28, -16], [28, -15],
    [-30, 26], [-18, 27], [-6, 28], [12, 27], [26, 28],
  ];
  for (const [x, z] of spots) {
    const tree = new THREE.Group();
    const s = 0.8 + rand() * 0.6;
    const trunk = new THREE.Mesh(trunkGeo, mat(PALETTE.trunk));
    trunk.position.y = 0.7;
    trunk.castShadow = true;
    tree.add(trunk);
    const leaves = new THREE.Mesh(
      rand() > 0.5 ? new THREE.ConeGeometry(1.4, 3, 7) : new THREE.IcosahedronGeometry(1.5, 0),
      mat(PALETTE.leaves[Math.floor(rand() * PALETTE.leaves.length)]),
    );
    leaves.position.y = 2.6;
    leaves.castShadow = true;
    tree.add(leaves);
    tree.position.set(x + (rand() - 0.5) * 2, 0, z + (rand() - 0.5) * 2);
    tree.scale.setScalar(s);
    tree.rotation.y = rand() * Math.PI;
    g.add(tree);
  }
  return g;
}

/** Kleiner deterministischer Zufallsgenerator, damit die Szene immer gleich aussieht. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
