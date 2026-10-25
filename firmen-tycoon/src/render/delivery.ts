// Lieferanten-Lkw (blau): fährt bei einer Lieferung von der Straße vors Lagertor und wieder weg. Echtzeit-Animation.

import * as THREE from 'three';
import { PALETTE } from './palette';
import { buildVan } from './world';

/** Fahrweg in Weltkoordinaten (x, z): Straße → Zufahrt → vor das Lagertor. */
const PATH: [number, number][] = [[80, 21.8], [6, 21.8], [6, 12.5], [-3, 8.5]];
const SPEED = 16; // m/s Echtzeit
const WAIT_SECONDS = 2;

type Phase = 'idle' | 'in' | 'wait' | 'out';

export class DeliveryTruck {
  readonly object: THREE.Group;
  private phase: Phase = 'idle';
  private path: THREE.Vector3[] = [];
  private segment = 0;
  private waitLeft = 0;
  private queued = 0;

  constructor() {
    this.object = buildVan(PALETTE.supplierAccent);
    this.object.scale.setScalar(1.05);
    this.object.visible = false;
  }

  get active(): boolean {
    return this.phase !== 'idle';
  }

  /** Startet eine Anlieferung; läuft schon eine, wird sie danach wiederholt. */
  deliver(): void {
    if (this.phase === 'idle') this.begin('in');
    else this.queued = Math.min(this.queued + 1, 2);
  }

  private begin(phase: 'in' | 'out'): void {
    const points = PATH.map(([x, z]) => new THREE.Vector3(x, 0, z));
    this.path = phase === 'in' ? points : points.reverse();
    this.segment = 0;
    this.phase = phase;
    this.object.position.copy(this.path[0]);
    this.object.visible = true;
    this.face(this.path[1]);
  }

  private face(target: THREE.Vector3): void {
    const dx = target.x - this.object.position.x;
    const dz = target.z - this.object.position.z;
    // Das Modell zeigt mit der Front in +x
    if (dx !== 0 || dz !== 0) this.object.rotation.y = Math.atan2(-dz, dx);
  }

  /** Fortschritt in Echtzeit-Sekunden. Gibt true zurück, solange sich etwas bewegt. */
  update(dt: number): boolean {
    if (this.phase === 'idle') return false;
    if (this.phase === 'wait') {
      this.waitLeft -= dt;
      if (this.waitLeft <= 0) this.begin('out');
      return true;
    }
    let move = SPEED * dt;
    while (move > 0 && this.segment < this.path.length - 1) {
      const target = this.path[this.segment + 1];
      const dist = this.object.position.distanceTo(target);
      this.face(target);
      if (move < dist) {
        this.object.position.lerp(target, move / dist);
        move = 0;
      } else {
        this.object.position.copy(target);
        move -= dist;
        this.segment++;
      }
    }
    if (this.segment >= this.path.length - 1) {
      if (this.phase === 'in') {
        this.phase = 'wait';
        this.waitLeft = WAIT_SECONDS;
      } else {
        this.phase = 'idle';
        this.object.visible = false;
        if (this.queued > 0) {
          this.queued--;
          this.begin('in');
        }
      }
    }
    return true;
  }
}
