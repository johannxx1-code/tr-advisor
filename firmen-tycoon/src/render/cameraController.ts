// Draufsicht-Kamera: Ziehen = verschieben, Mausrad/Pinch = zoomen. Zoom und Bereich begrenzt.

import * as THREE from 'three';

export interface CameraBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const MIN_DISTANCE = 9;
const MAX_DISTANCE = 75;
/** Neigung gegenüber der Senkrechten: rausgezoomt fast von oben, reingezoomt schräger. */
const TILT_FAR = THREE.MathUtils.degToRad(30);
const TILT_NEAR = THREE.MathUtils.degToRad(46);
/** Blickrichtung diagonal (45°) – Kamera steht über der vorderen rechten Ecke. */
const YAW = THREE.MathUtils.degToRad(45);

export class CameraController {
  readonly target = new THREE.Vector3(0, 0, 0);
  private distance = 45;
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private grabPoint: THREE.Vector3 | null = null;
  private pinchDistance = 0;
  private changed = true;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private readonly element: HTMLElement,
    private readonly bounds: CameraBounds,
  ) {
    element.style.touchAction = 'none';
    element.addEventListener('pointerdown', this.onPointerDown);
    element.addEventListener('pointermove', this.onPointerMove);
    element.addEventListener('pointerup', this.onPointerUp);
    element.addEventListener('pointercancel', this.onPointerUp);
    element.addEventListener('wheel', this.onWheel, { passive: false });
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    this.update();
  }

  /** 0 = ganz rausgezoomt, 1 = ganz reingezoomt. */
  get zoomLevel(): number {
    return 1 - (this.distance - MIN_DISTANCE) / (MAX_DISTANCE - MIN_DISTANCE);
  }

  get currentDistance(): number {
    return this.distance;
  }

  /** Liefert true, wenn sich die Kamera seit dem letzten Aufruf bewegt hat. */
  consumeChanged(): boolean {
    const c = this.changed;
    this.changed = false;
    return c;
  }

  /** Startansicht passend zum Seitenverhältnis (Hochformat braucht mehr Abstand). */
  resetView(): void {
    const aspect = this.camera.aspect;
    this.target.set(0, 0, 0);
    this.distance = THREE.MathUtils.clamp(aspect < 1 ? 34 / Math.max(aspect, 0.5) : 36, MIN_DISTANCE, MAX_DISTANCE);
    this.update();
  }

  update(): void {
    this.clampTarget();
    const t = this.zoomLevel;
    const tilt = THREE.MathUtils.lerp(TILT_FAR, TILT_NEAR, t);
    const horizontal = Math.sin(tilt) * this.distance;
    this.camera.position.set(
      this.target.x + Math.sin(YAW) * horizontal,
      this.target.y + Math.cos(tilt) * this.distance,
      this.target.z + Math.cos(YAW) * horizontal,
    );
    this.camera.lookAt(this.target);
    this.camera.updateMatrixWorld();
    this.changed = true;
  }

  /** Zoomt so, dass der Bodenpunkt unter (clientX, clientY) an Ort und Stelle bleibt. */
  zoomAt(clientX: number, clientY: number, factor: number): void {
    const before = this.groundPointAt(clientX, clientY);
    this.distance = THREE.MathUtils.clamp(this.distance * factor, MIN_DISTANCE, MAX_DISTANCE);
    this.update();
    const after = this.groundPointAt(clientX, clientY);
    if (before && after) {
      this.target.add(before.sub(after));
      this.update();
    }
  }

  private groundPointAt(clientX: number, clientY: number): THREE.Vector3 | null {
    const rect = this.element.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.groundPlane, hit);
  }

  private clampTarget(): void {
    this.target.x = THREE.MathUtils.clamp(this.target.x, this.bounds.minX, this.bounds.maxX);
    this.target.z = THREE.MathUtils.clamp(this.target.z, this.bounds.minZ, this.bounds.maxZ);
  }

  private pointerCenter(): { x: number; y: number } {
    let x = 0, y = 0;
    for (const p of this.pointers.values()) { x += p.x; y += p.y; }
    return { x: x / this.pointers.size, y: y / this.pointers.size };
  }

  private pointerSpread(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  /** Bei Änderung der Fingeranzahl neu „greifen“, damit nichts springt. */
  private regrab(): void {
    if (this.pointers.size === 0) {
      this.grabPoint = null;
      return;
    }
    const c = this.pointerCenter();
    this.grabPoint = this.groundPointAt(c.x, c.y);
    this.pinchDistance = this.pointerSpread();
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1 && e.button !== 2) return;
    this.element.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    this.regrab();
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const c = this.pointerCenter();

    if (this.pointers.size >= 2) {
      const spread = this.pointerSpread();
      if (this.pinchDistance > 0 && spread > 0) {
        this.zoomAt(c.x, c.y, this.pinchDistance / spread);
      }
      this.pinchDistance = spread;
    }

    if (this.grabPoint) {
      const now = this.groundPointAt(c.x, c.y);
      if (now) {
        this.target.add(this.grabPoint.clone().sub(now));
        this.update();
        // Nach dem Begrenzen kann der Griffpunkt verrutschen: neu bestimmen.
        this.grabPoint = this.groundPointAt(c.x, c.y);
      }
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.pointers.delete(e.pointerId)) return;
    if (this.element.hasPointerCapture(e.pointerId)) this.element.releasePointerCapture(e.pointerId);
    this.regrab();
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    // deltaMode 1 = Zeilen (Firefox), 0 = Pixel
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    this.zoomAt(e.clientX, e.clientY, Math.exp(THREE.MathUtils.clamp(delta, -100, 100) * 0.0015));
  };
}
