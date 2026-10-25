// Statische Umgebung aus Grundformen: Gelände, Straße, Hof, Zaun, Bäume. Das Gebäude liegt in building.ts.

import * as THREE from 'three';
import { PALETTE } from './palette';
import { box, mat, mulberry32 } from './parts';

export interface World {
  root: THREE.Group;
  /** Begrenzung des begehbaren Bereichs für die Kamera (x/z). */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}

export function buildWorld(): World {
  const root = new THREE.Group();

  root.add(buildGround());
  root.add(buildRoad());
  root.add(buildLot());

  root.add(buildFence());
  root.add(buildSign());
  root.add(buildTrees());

  return { root, bounds: { minX: -32, maxX: 32, minZ: -26, maxZ: 30 } };
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
  g.add(box(7, 0.16, 4, PALETTE.lot, 6, 0.08, 15.5, false));
  // Parkplatzmarkierungen
  for (let i = 0; i < 4; i++) {
    g.add(box(0.15, 0.02, 4.5, PALETTE.roadLine, 2 + i * 3, 0.11, 7, false));
  }
  return g;
}

/** Kastenwagen; `accent` färbt den Zierstreifen (Firmenwagen orange, Lieferant blau). */
export function buildVan(accent: number = PALETTE.vanAccent): THREE.Group {
  const van = new THREE.Group();
  van.add(box(4.6, 1.6, 2, PALETTE.van, 0, 1.25, 0));
  van.add(box(1.2, 1.1, 1.9, PALETTE.van, 2.85, 1.0, 0));
  van.add(box(4.62, 0.25, 2.02, accent, 0, 1.0, 0));
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
