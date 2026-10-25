// Simulationskern: Zustand, Zeitfortschritt und Aktionen. Kein DOM, kein Three.js.

import { dayOf, MINUTES_PER_REAL_SECOND } from './clock';
import { updateMarketDaily } from './market';
import { createInitialState, type GameSpeed, type GameState } from './state';
import * as trade from './trade';

export interface SimEvents {
  dayChanged: { day: number };
  speedChanged: { speed: GameSpeed };
  stateReplaced: { state: GameState };
  delivery: trade.DeliveryReport;
}

type Listener<T> = (payload: T) => void;

export class Simulation {
  private _state: GameState;
  private listeners: { [K in keyof SimEvents]?: Listener<SimEvents[K]>[] } = {};
  /** Zählt jede Zustandsänderung außer dem reinen Uhrzeit-Fortschritt (für UI-Aktualisierung). */
  private _revision = 0;

  constructor(state: GameState = createInitialState()) {
    this._state = state;
  }

  get state(): Readonly<GameState> {
    return this._state;
  }

  get revision(): number {
    return this._revision;
  }

  on<K extends keyof SimEvents>(event: K, listener: Listener<SimEvents[K]>): () => void {
    const list = (this.listeners[event] ??= []) as Listener<SimEvents[K]>[];
    list.push(listener);
    return () => {
      const i = list.indexOf(listener);
      if (i >= 0) list.splice(i, 1);
    };
  }

  private emit<K extends keyof SimEvents>(event: K, payload: SimEvents[K]): void {
    const list = this.listeners[event] as Listener<SimEvents[K]>[] | undefined;
    list?.forEach((l) => l(payload));
  }

  /** Echtzeit-Schritt (Sekunden) unter Berücksichtigung der Spielgeschwindigkeit. */
  tick(realSeconds: number): void {
    if (this._state.speed === 0 || realSeconds <= 0) return;
    this.advanceMinutes(realSeconds * MINUTES_PER_REAL_SECOND * this._state.speed);
  }

  /**
   * Spielzeit direkt vorspulen – unabhängig von der Geschwindigkeit.
   * Grundlage für späteren Offline-/Idle-Fortschritt und Tests.
   */
  advanceMinutes(minutes: number): void {
    if (minutes <= 0) return;
    const before = dayOf(this._state.minutes);
    this._state.minutes += minutes;
    const after = dayOf(this._state.minutes);
    // Jeder übersprungene Tag wird einzeln verarbeitet, damit Tageslogik nichts verpasst.
    for (let day = before + 1; day <= after; day++) {
      this.startDay(day);
    }
  }

  private startDay(day: number): void {
    updateMarketDaily(this._state);
    for (const report of trade.processOrders(this._state, day)) this.emit('delivery', report);
    this._revision++;
    this.emit('dayChanged', { day });
  }

  setSpeed(speed: GameSpeed): void {
    if (this._state.speed === speed) return;
    this._state.speed = speed;
    this._revision++;
    this.emit('speedChanged', { speed });
  }

  /** Ersetzt den gesamten Zustand (Laden / Neues Spiel). */
  replaceState(state: GameState): void {
    this._state = state;
    this._revision++;
    this.emit('stateReplaced', { state });
  }

  // ---------- Aktionen ----------

  unlockArticle(articleId: string): trade.ActionResult {
    return this.apply(trade.unlockArticle(this._state, articleId));
  }

  placeOrder(articleId: string, supplierId: string, qty: number): trade.ActionResult {
    return this.apply(trade.placeOrder(this._state, articleId, supplierId, qty));
  }

  sell(articleId: string, qty: number): trade.ActionResult {
    return this.apply(trade.sell(this._state, articleId, qty));
  }

  buyShelf(): trade.ActionResult {
    return this.apply(trade.buyShelf(this._state));
  }

  buildExtension(): trade.ActionResult {
    return this.apply(trade.buildExtension(this._state));
  }

  private apply(result: trade.ActionResult): trade.ActionResult {
    if (result.ok) this._revision++;
    return result;
  }
}
