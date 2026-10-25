// Einstiegspunkt: verdrahtet Simulation, Speicherstand, Szene und HUD.

import { deleteSave, loadGame, saveGame } from './persistence/save';
import { GameScene } from './render/scene';
import { Simulation } from './sim/simulation';
import { createInitialState } from './sim/state';
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
  hud.update(sim.state);
  scene.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
