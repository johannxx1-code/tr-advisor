// Einstiegspunkt: verdrahtet Simulation, Speicherstand, Szene und HUD.

import { deleteSave, loadGame, saveGame } from './persistence/save';
import { GameScene } from './render/scene';
import { getArticle } from './sim/catalog';
import { offlineMinutes } from './sim/clock';
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
  order: (articleId, supplierId, qty, express) => sim.placeOrder(articleId, supplierId, qty, express),
  sell: (articleId, qty) => sim.sell(articleId, qty),
  buyShelf: () => sim.buyShelf(),
  buildExtension: () => sim.buildExtension(),
  acceptOffer: (id) => sim.acceptOffer(id),
  declineOffer: (id) => sim.declineOffer(id),
  cancelJob: (id) => sim.cancelJob(id),
  setMinStock: (articleId, value) => sim.setMinStock(articleId, value),
  markMessagesRead: () => sim.markMessagesRead(),
  expediteOrder: (id) => sim.expediteOrder(id),
  helpOut: () => sim.helpOut(),
  hireHelper: () => sim.hireHelper(),
  fireHelper: () => sim.fireHelper(),
  buyVan: () => sim.buyVan(),
});

sim.on('stored', ({ articleId, qty }) => {
  if (!catchingUp) hud.toast(`Eingeräumt: ${qty}× ${getArticle(articleId).name}`);
});

/** Während des Nachrechnens keine Einzel-Hinweise, sondern am Ende eine Zusammenfassung. */
let catchingUp = false;

sim.on('delivery', ({ delivered }) => {
  if (!catchingUp && delivered > 0) scene.playDelivery();
});

// Meldungen zusätzlich kurz einblenden (außer beim Nachrechnen – dann kommt die Zusammenfassung).
sim.on('message', (m) => {
  if (catchingUp) return;
  hud.toast(m.title, m.kind === 'blocked' || m.kind === 'late' || m.kind === 'stock' || m.kind === 'delay');
});

/**
 * Verpasste Zeit nachrechnen (Spiel war zu oder Tab verdeckt) – in Echtzeit, nicht in Spielgeschwindigkeit.
 * Bei Pause wird nichts nachgerechnet.
 */
function catchUp(realMs: number): void {
  if (sim.state.speed === 0) return;
  const minutes = offlineMinutes(realMs);
  if (minutes < 1) return;
  const firstNewId = sim.state.nextMessageId;
  const firstOfferId = sim.state.nextJobId;
  const moneyBefore = sim.state.money;
  const repBefore = sim.state.reputation;
  catchingUp = true;
  try {
    sim.advanceMinutes(minutes);
  } finally {
    catchingUp = false;
  }
  const news = sim.state.messages.filter((m) => m.id >= firstNewId);
  const offers = sim.state.offers.filter((o) => o.id >= firstOfferId).length;
  hud.showSummary({
    minutes,
    messages: news,
    newOffers: offers,
    moneyDelta: sim.state.money - moneyBefore,
    reputationDelta: sim.state.reputation - repBefore,
  });
  save();
}

sim.on('dayChanged', ({ day }) => {
  if ((day - 1) % AUTOSAVE_EVERY_DAYS === 0) save();
});

// Beim Schließen / Wegwechseln speichern (pagehide ist auf Mobilgeräten zuverlässiger als beforeunload).
// Kommt der Tab zurück, wird die verdeckte Zeit in Echtzeit nachgerechnet.
let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    hiddenAt = Date.now();
    save();
  } else if (hiddenAt) {
    catchUp(Date.now() - hiddenAt);
    hiddenAt = 0;
    lastTime = performance.now();
  }
});
window.addEventListener('pagehide', save);

if (loaded) {
  const away = Date.now() - loaded.savedAt;
  if (offlineMinutes(away) >= 1 && sim.state.speed !== 0) catchUp(away);
  else hud.toast('Spielstand geladen');
}

let lastTime = performance.now();
function frame(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, MAX_FRAME_SECONDS);
  lastTime = now;
  sim.tick(dt);
  const state = sim.state;
  hud.update(state, sim.revision);
  scene.sync({
    extension: state.extension, shelves: state.shelves, usedSlots: usedSlots(state),
    minutes: state.minutes, vans: state.vans, inbound: state.inbound, helper: state.helper,
    working: !!state.storing || state.vans.some((v) => v.phase === 'loading'),
  });
  scene.render(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Nur im Dev-Server: Zugriff für Tests und Debugging über die Browser-Konsole.
if (import.meta.env.DEV) Object.assign(window, { __sim: sim, __scene: scene });
