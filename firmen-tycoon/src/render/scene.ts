// Three.js-Szene: Renderer, Licht, Welt und Kamera. Bekommt vom Hauptprogramm nur eine schlanke Ansicht des Spielstands.

import * as THREE from 'three';
import { BuildingView } from './building';
import { CameraController } from './cameraController';
import { CompanyVan, type VanView } from './companyVan';
import { DeliveryTruck } from './delivery';
import { PALETTE } from './palette';
import { buildWorld, type World } from './world';

/** Ab diesem Zoomgrad (0…1) werden Kleinteile im Gebäude eingeblendet. */
const DETAIL_ZOOM = 0.68;

/** Was die Szene vom Spielstand wissen muss. */
export interface SceneView {
  extension: number;
  shelves: number;
  usedSlots: number;
  /** Aktuelle Spielminute (für die Firmenwagen). */
  minutes: number;
  vans: VanView[];
  inbound: { articleId: string; qty: number }[];
  helper: boolean;
  /** Wird gerade verladen oder eingeräumt? (Aushilfe bewegt sich) */
  working: boolean;
}

export class GameScene {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly world: World;
  private readonly building = new BuildingView();
  private readonly truck = new DeliveryTruck();
  private readonly companyVans: CompanyVan[] = [];
  private working = false;
  readonly controls: CameraController;
  private needsRender = true;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene.background = new THREE.Color(PALETTE.sky);
    this.scene.fog = new THREE.Fog(PALETTE.sky, 90, 170);

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 400);

    // Weiches Licht: Himmel/Boden-Ambiente + Sonne mit weichen Schatten
    this.scene.add(new THREE.HemisphereLight(0xeaf4ff, 0x5a7a40, 1.6));
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
    sun.position.set(-25, 45, 30);
    sun.castShadow = true;
    const isSmall = Math.min(window.innerWidth, window.innerHeight) < 600;
    sun.shadow.mapSize.set(isSmall ? 1024 : 2048, isSmall ? 1024 : 2048);
    sun.shadow.camera.left = -40;
    sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40;
    sun.shadow.camera.bottom = -40;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 140;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 4;
    this.scene.add(sun);

    this.world = buildWorld();
    this.scene.add(this.world.root, this.building.root, this.truck.object);

    this.controls = new CameraController(this.camera, canvas, this.world.bounds);
    this.resize();
    this.controls.resetView();

    window.addEventListener('resize', this.resize);
  }

  private resize = (): void => {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.controls?.update();
    this.needsRender = true;
  };

  /** Gleicht Gebäude, Regale und Füllstand an (billig, wenn sich nichts geändert hat). */
  sync(view: SceneView): void {
    if (this.building.sync(view.extension, view.shelves, view.usedSlots)) {
      this.building.details.visible = this.controls.zoomLevel >= DETAIL_ZOOM;
      this.needsRender = true;
    }
    while (this.companyVans.length < view.vans.length) {
      const van = new CompanyVan(this.companyVans.length);
      this.companyVans.push(van);
      this.scene.add(van.object);
    }
    view.vans.forEach((v, i) => {
      if (this.companyVans[i].update(v, view.minutes)) this.needsRender = true;
    });
    if (this.building.syncProps(view.inbound, view.helper)) this.needsRender = true;
    this.working = view.helper && view.working;
  }

  /** Lieferanten-Lkw fährt vor. */
  playDelivery(): void {
    this.truck.deliver();
  }

  /** Rendert nur, wenn sich etwas geändert hat (schont Akku auf dem Handy). */
  render(dt: number): void {
    if (this.controls.consumeChanged()) {
      this.building.details.visible = this.controls.zoomLevel >= DETAIL_ZOOM;
      this.needsRender = true;
    }
    if (this.truck.update(dt)) this.needsRender = true;
    if (this.working && this.building.animateHelper(dt)) this.needsRender = true;
    if (!this.needsRender) return;
    this.needsRender = false;
    this.renderer.render(this.scene, this.camera);
  }
}
