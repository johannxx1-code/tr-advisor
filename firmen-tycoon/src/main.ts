// Einstiegspunkt: verdrahtet Simulation, Speicherstand, Szene und HUD.

import { deleteSave, loadGame, saveGame } from './persistence/save';
import { GameScene } from './render/scene';
import { getArticle } from './sim/catalog';
import { Simulation } from './sim/simulation';
import { createInitialState } from './sim/state';
import { usedSlots } from './sim/storage';
import { Hud } from './ui/hud';

/** Automatisch speichern alle n Spieltage. */
const AUTOSAVE_EVERY_DAYS = 3;
/** Größter Echtzeit-Schritt pro Frame (verhindert Sprünge nach Tab-Wechsel). */
const MAX_FRAME_SECONDS = 0.25;

const loaded = loadGame();
const sim = new Simulation(loaded?.state ?? createInitialState());

const scene = new GameScene(document.querySelector<HTMLCanvasElement>('#scene')!);

const save = (): boolean => saveGame(sim.state);

const hud = new Hud(document.querySelector<HTMLElement>('#hud')!, {
  setSpeed: (speed) => sim.setSpeed(speed),
  save: () => hud.toast(save() ? 'Spiel gespeichert' : 'Speichern fehlgeschlagen'),
  newGame: () => {
    deleteSave();
    sim.replaceState(createInitialState());
    scene.controls.resetView();
    save();
    hud.toast('Neues Spiel gestartet');
  },
  unlock: (id) => sim.unlockArticle(id),
  order: (articleId, supplierId, qty) => sim.placeOrder(articleId, supplierId, qty),
  sell: (articleId, qty) => sim.sell(articleId, qty),
  buyShelf: () => sim.buyShelf(),
  buildExtension: () => sim.buildExtension(),
});

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
sim.on('delivery', ({ order, delivered, refund, delayedUntil }) => {
  const name = getArticle(order.articleId).name;
  if (delayedUntil !== undefined) {
    hud.toast(`Verspätung: ${order.qty}× ${name} kommt erst an Tag ${delayedUntil}`, true);
    return;
  }
  scene.playDelivery();
  if (delivered < order.qty) {
    hud.toast(`Teillieferung: ${delivered} von ${order.qty}× ${name} – ${euro.format(refund)} erstattet`, true);
  } else {
    hud.toast(`Lieferung eingetroffen: ${delivered}× ${name}`);
  }
});

sim.on('dayChanged', ({ day }) => {
  if ((day - 1) % AUTOSAVE_EVERY_DAYS === 0) save();
});

// Beim Schließen / Wegwechseln speichern (pagehide ist auf Mobilgeräten zuverlässiger als beforeunload)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') save();
});
window.addEventListener('pagehide', save);

if (loaded) hud.toast('Spielstand geladen');

let lastTime = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, MAX_FRAME_SECONDS);
  lastTime = now;
  sim.tick(dt);
  const state = sim.state;
  hud.update(state, sim.revision);
  scene.sync({ extension: state.extension, shelves: state.shelves, usedSlots: usedSlots(state) });
  scene.render(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Nur im Dev-Server: Zugriff für Tests und Debugging über die Browser-Konsole.
if (import.meta.env.DEV) Object.assign(window, { __sim: sim, __scene: scene });
