// Firmenwagen (orange): folgt der Tour-Phase aus der Simulation, also in Spielzeit.
// Parkplatz → Tor (Verladen) → Straße Richtung Westen → weg; Rückfahrt von Westen auf den Parkplatz.

import * as THREE from 'three';
import { buildVan } from './world';

export interface VanView {
  phase: 'idle' | 'loading' | 'outbound' | 'unloading' | 'returning';
  phaseStart: number;
  phaseEnd: number;
}

type Point = [number, number];
type Path = Point[];

/** Park- und Ladeplatz je Wagen (Wagen 2 lädt neben dem Tor über die niedrige Wand). */
const SPOTS: { park: Point; door: Point }[] = [
  { park: [8, 9], door: [-3, 7.8] },
  { park: [11, 9], door: [-6.4, 7.8] },
];
/** Rechte Fahrspur: nach Westen z = 18,2, nach Osten z = 21,8. */
const OUT_ROAD: Path = [[6, 18.2], [-110, 18.2]];
const BACK_ROAD: Path = [[-110, 21.8], [6, 21.8]];
/** Anteil der sichtbaren Fahrzeit auf dem Hof (Rest: auf der Straße aus dem Bild). */
const LOT_SHARE = 0.6;
/** So viele Spielminuten dauert die sichtbare Fahrt auf dem Gelände. */
const TO_DOOR_MIN = 15;
const DRIVE_MIN = 25;

export class CompanyVan {
  readonly object = buildVan();
  private lastKey = '';
  private readonly park: Point;
  private readonly door: Point;
  private readonly toDoor: Path;
  private readonly outLot: Path;
  private readonly backLot: Path;

  constructor(index: number) {
    const spot = SPOTS[Math.min(index, SPOTS.length - 1)];
    this.park = spot.park;
    this.door = spot.door;
    this.toDoor = [this.park, [this.park[0], 12.5], [this.door[0], 12.5], this.door];
    this.outLot = [this.door, [this.door[0], 12.5], [6, 12.5], [6, 18.2]];
    this.backLot = [[6, 21.8], [6, 12.5], [this.park[0], 12.5], this.park];
    this.place(this.park, Math.PI / 2);
  }

  /** Stellt den Wagen passend zur Phase hin. Gibt true zurück, wenn er sich bewegt hat. */
  update(van: VanView, now: number): boolean {
    const elapsed = now - van.phaseStart;
    switch (van.phase) {
      case 'idle':
        this.object.visible = true;
        this.place(this.park, Math.PI / 2);
        break;
      case 'loading':
        this.object.visible = true;
        if (elapsed < TO_DOOR_MIN) this.follow(this.toDoor, elapsed / TO_DOOR_MIN);
        else this.place(this.door, Math.PI / 2); // Front zum Tor
        break;
      case 'outbound':
        this.object.visible = elapsed < DRIVE_MIN;
        if (this.object.visible) {
          const f = elapsed / DRIVE_MIN;
          if (f < LOT_SHARE) this.follow(this.outLot, f / LOT_SHARE);
          else this.follow(OUT_ROAD, (f - LOT_SHARE) / (1 - LOT_SHARE));
        }
        break;
      case 'unloading':
        this.object.visible = false;
        break;
      case 'returning': {
        const left = van.phaseEnd - now;
        this.object.visible = left < DRIVE_MIN;
        if (this.object.visible) {
          const f = 1 - left / DRIVE_MIN;
          const road = 1 - LOT_SHARE;
          if (f < road) this.follow(BACK_ROAD, f / road);
          else this.follow(this.backLot, (f - road) / LOT_SHARE);
        }
        break;
      }
    }
    const p = this.object.position;
    const key = `${this.object.visible}:${p.x.toFixed(2)}:${p.z.toFixed(2)}:${this.object.rotation.y.toFixed(2)}`;
    const changed = key !== this.lastKey;
    this.lastKey = key;
    return changed;
  }

  /** Stellt das Modell an einen Punkt; `heading` = Fahrtrichtung als Winkel (Front zeigt in +x). */
  private place([x, z]: [number, number], heading: number): void {
    this.object.position.set(x, 0, z);
    this.object.rotation.y = heading;
  }

  private follow(path: Path, f: number): void {
    const t = THREE.MathUtils.clamp(f, 0, 1);
    const lengths = path.slice(1).map(([x, z], i) => Math.hypot(x - path[i][0], z - path[i][1]));
    let dist = t * lengths.reduce((a, b) => a + b, 0);
    for (let i = 0; i < lengths.length; i++) {
      const [x1, z1] = path[i];
      const [x2, z2] = path[i + 1];
      if (dist <= lengths[i] || i === lengths.length - 1) {
        const k = lengths[i] > 0 ? Math.min(1, dist / lengths[i]) : 1;
        this.place([x1 + (x2 - x1) * k, z1 + (z2 - z1) * k], Math.atan2(-(z2 - z1), x2 - x1));
        return;
      }
      dist -= lengths[i];
    }
  }
}
