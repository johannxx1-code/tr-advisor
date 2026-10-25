// Simulationskern: Zustand + Zeitfortschritt. Kein DOM, kein Three.js.

import { dayOf, MINUTES_PER_REAL_SECOND } from './clock';
import { createInitialState, type GameSpeed, type GameState } from './state';

export interface SimEvents {
  dayChanged: { day: number };
  speedChanged: { speed: GameSpeed };
  stateReplaced: { state: GameState };
}

type Listener<T> = (payload: T) => void;

export class Simulation {
  private _state: GameState;
  private listeners: { [K in keyof SimEvents]?: Listener<SimEvents[K]>[] } = {};

  constructor(state: GameState = createInitialState()) {
    this._state = state;
  }

  get state(): Readonly<GameState> {
    return this._state;
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
    // Jeder übersprungene Tag wird einzeln gemeldet, damit Tageslogik nichts verpasst.
    for (let day = before + 1; day <= after; day++) {
      this.emit('dayChanged', { day });
    }
  }

  setSpeed(speed: GameSpeed): void {
    if (this._state.speed === speed) return;
    this._state.speed = speed;
    this.emit('speedChanged', { speed });
  }

  /** Ersetzt den gesamten Zustand (Laden / Neues Spiel). */
  replaceState(state: GameState): void {
    this._state = state;
    this.emit('stateReplaced', { state });
  }
}
