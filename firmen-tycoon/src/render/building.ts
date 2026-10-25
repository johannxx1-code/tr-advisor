// Firmengebäude ohne Dach („Puppenhaus“): Lager, Büro und Anbauten. Regale und Ware folgen dem Spielstand.

import * as THREE from 'three';
import { PALETTE } from './palette';
import { box, floor, mat, mulberry32, poster, wall, WALL_H, WALL_LOW } from './parts';

/** Innenwände zwischen Lager und Anbauten: halbhoch, damit man hineinsieht. */
const WALL_MID = 1.4;
/** Lagerplätze pro Regal (muss zu SHELF_CAPACITY in sim/storage.ts passen). */
const SLOTS_PER_SHELF = 20;

/**
 * Regalplätze in Bau-Reihenfolge (lokale Koordinaten): x, z, Drehung.
 * 0–8 Garage, 9–14 Anbau 1, 15–22 Anbau 2.
 */
const SHELF_SPOTS: [number, number, number][] = [
  // Garage: Reihe an der Rückwand, dann zwei Doppelreihen
  [-6.2, -5.4, 0], [-3.0, -5.4, 0], [0.2, -5.4, 0],
  [-5.6, -2.4, Math.PI / 2], [-4.8, -2.4, Math.PI / 2],
  [-5.6, 0.7, Math.PI / 2], [-4.8, 0.7, Math.PI / 2],
  [-1.6, -2.4, Math.PI / 2], [-1.6, 0.7, Math.PI / 2],
  // Anbau 1 (x -15…-8, z -6…4)
  [-13.6, -3.6, Math.PI / 2], [-12.8, -3.6, Math.PI / 2],
  [-13.6, -0.4, Math.PI / 2], [-12.8, -0.4, Math.PI / 2],
  [-10.0, -3.6, Math.PI / 2], [-10.0, -0.4, Math.PI / 2],
  // Anbau 2 (x -15…-8, z 4…10)
  [-13.2, 6.0, 0], [-10.0, 6.0, 0], [-13.2, 6.8, 0], [-10.0, 6.8, 0],
  [-13.2, 8.6, 0], [-10.0, 8.6, 0], [-13.2, 9.4, 0], [-10.0, 9.4, 0],
];

interface ShelfMeshes {
  frame: THREE.Group;
  boxes: THREE.Mesh[];
}

export class BuildingView {
  readonly root = new THREE.Group();
  /** Kleinteile (Poster, Monitor …), nur beim Reinzoomen sichtbar. */
  readonly details = new THREE.Group();
  private shell = new THREE.Group();
  private readonly shelfGroup = new THREE.Group();
  private shelves: ShelfMeshes[] = [];
  private extension = -1;
  private fillKey = '';
  private readonly pallets = new THREE.Group();
  private palletKey = '';
  private readonly helper = buildHelperFigure();
  private helperTime = 0;

  constructor() {
    this.root.position.set(-2, 0, 0);
    this.helper.position.set(-0.2, 0.1, 2.0);
    this.helper.visible = false;
    this.root.add(this.shell, this.shelfGroup, this.details, this.pallets, this.helper);
  }

  /** Paletten im Wareneingang (am Tor) und Aushilfe. Gibt true zurück, wenn sich etwas geändert hat. */
  syncProps(inbound: { articleId: string; qty: number }[], helper: boolean): boolean {
    let changed = false;
    const key = inbound.map((p) => p.qty).join(',');
    if (key !== this.palletKey) {
      this.palletKey = key;
      disposeGroup(this.pallets);
      this.pallets.clear();
      // Bis zu 4 Stellplätze innen am Tor, Kartonstapel je nach Menge
      inbound.slice(0, 4).forEach((p, i) => {
        const x = -2.4 + (i % 2) * 1.5;
        const z = i < 2 ? 2.9 : 1.6;
        const pallet = new THREE.Group();
        pallet.add(box(1.2, 0.14, 1.0, PALETTE.shelfWood, 0, 0.17, 0));
        const layers = Math.min(4, Math.max(1, Math.ceil(p.qty / 15)));
        for (let l = 0; l < layers; l++) {
          pallet.add(box(1.0, 0.36, 0.85, PALETTE.box[(i + l) % 3], 0, 0.42 + l * 0.38, 0));
        }
        pallet.position.set(x, 0, z);
        this.pallets.add(pallet);
      });
      changed = true;
    }
    if (this.helper.visible !== helper) {
      this.helper.visible = helper;
      changed = true;
    }
    return changed;
  }

  /** Aushilfe „arbeitet“ (wippt), solange verladen oder eingeräumt wird. */
  animateHelper(dt: number): boolean {
    if (!this.helper.visible) return false;
    this.helperTime += dt;
    this.helper.position.y = 0.1 + Math.abs(Math.sin(this.helperTime * 6)) * 0.12;
    this.helper.rotation.y = Math.sin(this.helperTime * 1.5) * 0.8;
    return true;
  }

  /** Gleicht Gebäude, Regale und Füllstand mit dem Spielstand ab. Gibt true zurück, wenn sich etwas geändert hat. */
  sync(extension: number, shelfCount: number, usedSlots: number): boolean {
    let changed = false;
    if (extension !== this.extension) {
      this.extension = extension;
      this.root.remove(this.shell);
      disposeGroup(this.shell);
      this.details.clear();
      this.shell = buildShell(extension, this.details);
      this.root.add(this.shell);
      changed = true;
    }
    const count = Math.min(shelfCount, SHELF_SPOTS.length);
    while (this.shelves.length < count) {
      const i = this.shelves.length;
      const shelf = buildShelf(mulberry32(100 + i));
      const [x, z, rot] = SHELF_SPOTS[i];
      shelf.frame.position.set(x, 0.1, z);
      shelf.frame.rotation.y = rot;
      this.shelfGroup.add(shelf.frame);
      this.shelves.push(shelf);
      this.fillKey = '';
      changed = true;
    }
    while (this.shelves.length > count) {
      const shelf = this.shelves.pop()!;
      this.shelfGroup.remove(shelf.frame);
      disposeGroup(shelf.frame);
      this.fillKey = '';
      changed = true;
    }
    // Regale werden der Reihe nach befüllt: Regal 1 zuerst voll, dann Regal 2 …
    const key = `${count}:${usedSlots}`;
    if (key !== this.fillKey) {
      this.fillKey = key;
      this.shelves.forEach((shelf, i) => {
        const fill = THREE.MathUtils.clamp((usedSlots - i * SLOTS_PER_SHELF) / SLOTS_PER_SHELF, 0, 1);
        const visible = Math.round(fill * shelf.boxes.length);
        shelf.boxes.forEach((b, j) => (b.visible = j < visible));
      });
      changed = true;
    }
    return changed;
  }
}

function disposeGroup(group: THREE.Object3D): void {
  // Materialien sind geteilt (Cache), nur Geometrien freigeben.
  group.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
}

/**
 * Böden, Wände und Einrichtung für die Ausbaustufe.
 * Lokale Koordinaten: Lager x -8…4 / z -6…4, Büro x 4…10 / z -6…0,
 * Anbau 1 x -15…-8 / z -6…4, Anbau 2 x -15…-8 / z 4…10.
 */
function buildShell(extension: number, details: THREE.Group): THREE.Group {
  const g = new THREE.Group();
  const H = WALL_H, L = WALL_LOW, M = WALL_MID;

  g.add(floor(-8, -6, 4, 4, PALETTE.floorStore, PALETTE.floorStoreLine, 1.5, true));
  g.add(floor(4, -6, 10, 0, PALETTE.floorOffice, PALETTE.floorOfficeLine, 0.5, false));

  // Außenwände hinten hoch, vorne/rechts niedrig
  g.add(wall(-8, -6, 10, -6, H));
  g.add(wall(-8, 4, -3, 4, L));
  g.add(wall(1, 4, 4, 4, L));
  g.add(wall(4, 0, 4, 4, L));
  g.add(wall(4, 0, 6, 0, L));
  g.add(wall(7, 0, 10, 0, L));
  g.add(wall(10, -6, 10, 0, L));
  // Innenwand Lager | Büro mit Tür
  g.add(wall(4, -6, 4, -3.5, H, PALETTE.wallInner));
  g.add(wall(4, -2.5, 4, 0, H, PALETTE.wallInner));

  if (extension === 0) {
    g.add(wall(-8, -6, -8, 4, H));
  } else {
    // Durchgang Garage → Anbau 1
    g.add(wall(-8, -6, -8, -2, M, PALETTE.wallInner));
    g.add(wall(-8, 1, -8, 4, M, PALETTE.wallInner));
    g.add(floor(-15, -6, -8, 4, PALETTE.floorStore, PALETTE.floorStoreLine, 1.5, true));
    g.add(wall(-15, -6, -8, -6, H));
    g.add(wall(-15, -6, -15, 4, H));
    if (extension === 1) {
      g.add(wall(-15, 4, -8, 4, L));
    } else {
      // Durchgang Anbau 1 → Anbau 2
      g.add(wall(-15, 4, -12, 4, M, PALETTE.wallInner));
      g.add(wall(-10, 4, -8, 4, M, PALETTE.wallInner));
      g.add(floor(-15, 4, -8, 10, PALETTE.floorStore, PALETTE.floorStoreLine, 1.5, true));
      g.add(wall(-15, 4, -15, 10, H));
      g.add(wall(-15, 10, -8, 10, L));
      g.add(wall(-8, 4, -8, 10, L));
    }
  }

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

  // Packtisch und Palette am Tor
  g.add(box(2.2, 0.08, 1, PALETTE.shelfWood, 2.4, 0.95, 2.6));
  for (const [x, z] of [[1.4, 2.2], [3.4, 2.2], [1.4, 3.0], [3.4, 3.0]]) g.add(box(0.08, 0.9, 0.08, PALETTE.shelf, x, 0.5, z));
  g.add(box(1.4, 0.15, 1.2, PALETTE.shelfWood, -6.6, 0.18, 2.8));
  details.add(box(0.6, 0.5, 0.5, PALETTE.box[0], -6.9, 0.5, 2.6));
  details.add(box(0.6, 0.45, 0.5, PALETTE.box[1], -6.3, 0.48, 3.0));
  details.add(box(0.5, 0.4, 0.45, PALETTE.box[2], -6.7, 0.95, 2.75));
  details.add(box(0.5, 0.35, 0.4, PALETTE.box[3], 2.1, 1.17, 2.6));

  // Poster
  details.add(poster(-6.2, 2.3, -5.82, 0, PALETTE.posterA));
  details.add(poster(-3.0, 2.4, -5.82, 0, PALETTE.posterB, 0.9, 0.6));
  if (extension === 0) details.add(poster(-7.82, 2.0, -1, Math.PI / 2, PALETTE.posterC));
  else details.add(poster(-11.5, 2.3, -5.82, 0, PALETTE.posterC));

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

/** Regal mit lückenlos vorbereiteten Kartons; welche sichtbar sind, bestimmt der Füllstand. */
function buildShelf(rand: () => number): ShelfMeshes {
  const frame = new THREE.Group();
  const boxes: THREE.Mesh[] = [];
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
  // Von unten nach oben, links nach rechts
  for (const y of levels.slice(0, 3)) {
    let x = -len / 2 + 0.12;
    while (x < len / 2 - 0.45) {
      const bw = Math.min(0.35 + rand() * 0.3, len / 2 - 0.1 - x);
      const bh = 0.3 + rand() * 0.3;
      const color = PALETTE.box[Math.floor(rand() * PALETTE.box.length)];
      const b = box(bw, bh, depth * 0.75, color, x + bw / 2, y + 0.03 + bh / 2, 0);
      b.visible = false;
      frame.add(b);
      boxes.push(b);
      x += bw + 0.06;
    }
  }
  return { frame, boxes };
}

/** Einfache Low-Poly-Figur (Aushilfe mit Warnweste). */
function buildHelperFigure(): THREE.Group {
  const g = new THREE.Group();
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.75, 6), mat(PALETTE.chair));
  legs.position.y = 0.38;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.65, 6), mat(PALETTE.vanAccent));
  body.position.y = 1.05;
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.18, 0), mat(0xe8c4a0));
  head.position.y = 1.55;
  for (const m of [legs, body, head]) {
    m.castShadow = true;
    g.add(m);
  }
  return g;
}
