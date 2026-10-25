// Simulationskern: Zustand, Zeitfortschritt und Aktionen. Kein DOM, kein Three.js.

import { getArticle } from './catalog';
import { dayOf, MINUTES_PER_REAL_SECOND } from './clock';
import * as jobs from './jobs';
import { updateMarketDaily } from './market';
import { addMessage, markAllRead } from './messages';
import { createInitialState, type GameMessage, type GameSpeed, type GameState } from './state';
import * as trade from './trade';

export interface SimEvents {
  dayChanged: { day: number };
  speedChanged: { speed: GameSpeed };
  stateReplaced: { state: GameState };
  delivery: trade.DeliveryReport;
  /** Neue Meldung im Postfach. */
  message: GameMessage;
  /** Phasenwechsel des Firmenwagens. */
  tour: jobs.TourEvent;
}

/** Größter Simulationsschritt in Spielminuten (Touren werden minutengenau abgearbeitet). */
const MAX_STEP_MINUTES = 5;

type Listener<T> = (payload: T) => void;

export class Simulation {
  private _state: GameState;
  private listeners: { [K in keyof SimEvents]?: Listener<SimEvents[K]>[] } = {};
  /** Zählt jede Zustandsänderung außer dem reinen Uhrzeit-Fortschritt (für UI-Aktualisierung). */
  private _revision = 0;

  constructor(state: GameState = createInitialState()) {
    this._state = state;
    // Erste Angebote sofort, nicht erst am nächsten Morgen
    if (state.offers.length === 0) jobs.refreshOffers(state);
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
    let remaining = minutes;
    while (remaining > 0) {
      const step = Math.min(remaining, MAX_STEP_MINUTES);
      remaining -= step;
      const before = dayOf(this._state.minutes);
      this._state.minutes += step;
      const after = dayOf(this._state.minutes);
      // Jeder übersprungene Tag wird einzeln verarbeitet, damit Tageslogik nichts verpasst.
      for (let day = before + 1; day <= after; day++) this.startDay(day);
      this.runJobs();
    }
  }

  private startDay(day: number): void {
    const state = this._state;
    updateMarketDaily(state);
    for (const report of trade.processOrders(state, day)) {
      const name = getArticle(report.order.articleId).name;
      if (report.delayedUntil !== undefined) {
        addMessage(state, { kind: 'delay', title: `Lieferung verspätet: ${name}`, text: `${report.order.qty} Stück kommen erst an Tag ${report.delayedUntil}.`, target: { panel: 'trade' } });
      } else if (report.delivered < report.order.qty) {
        addMessage(state, { kind: 'delivery', title: `Teillieferung: ${name}`, text: `${report.delivered} von ${report.order.qty} Stück, ${report.refund.toLocaleString('de-DE', { minimumFractionDigits: 2 })} € erstattet.`, target: { panel: 'storage' } });
      } else {
        addMessage(state, { kind: 'delivery', title: `Lieferung eingetroffen: ${name}`, text: `${report.delivered} Stück im Lager.`, target: { panel: 'storage' } });
      }
      this.emit('delivery', report);
    }
    jobs.checkDeadlines(state);
    jobs.refreshOffers(state);
    this._revision++;
    this.emit('dayChanged', { day });
  }

  /** Touren und Bestandswarnungen bis zur aktuellen Minute; neue Meldungen weitermelden. */
  private runJobs(): void {
    const lastId = this._state.nextMessageId;
    const events = jobs.updateJobs(this._state);
    for (const e of events) this.emit('tour', e);
    if (events.length) this._revision++;
    this.flushMessages(lastId);
  }

  private flushMessages(sinceId: number): void {
    if (this._state.nextMessageId === sinceId) return;
    this._revision++;
    for (const m of [...this._state.messages].reverse()) if (m.id >= sinceId) this.emit('message', m);
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
    return this.act(() => trade.unlockArticle(this._state, articleId));
  }

  placeOrder(articleId: string, supplierId: string, qty: number): trade.ActionResult {
    return this.act(() => trade.placeOrder(this._state, articleId, supplierId, qty));
  }

  sell(articleId: string, qty: number): trade.ActionResult {
    return this.act(() => trade.sell(this._state, articleId, qty));
  }

  buyShelf(): trade.ActionResult {
    return this.act(() => trade.buyShelf(this._state));
  }

  buildExtension(): trade.ActionResult {
    return this.act(() => trade.buildExtension(this._state));
  }

  acceptOffer(offerId: number): trade.ActionResult {
    return this.act(() => jobs.acceptOffer(this._state, offerId));
  }

  declineOffer(offerId: number): trade.ActionResult {
    return this.act(() => jobs.declineOffer(this._state, offerId));
  }

  cancelJob(jobId: number): trade.ActionResult {
    return this.act(() => jobs.cancelJob(this._state, jobId));
  }

  setMinStock(articleId: string, value: number): void {
    this.act(() => {
      jobs.setMinStock(this._state, articleId, value);
      return { ok: true, message: '' };
    });
  }

  markMessagesRead(): void {
    markAllRead(this._state);
    this._revision++;
  }

  /** Führt eine Aktion aus; danach sofort Touren/Warnungen prüfen (z. B. Tour starten nach Annahme). */
  private act(fn: () => trade.ActionResult): trade.ActionResult {
    const lastId = this._state.nextMessageId;
    const result = fn();
    if (result.ok) {
      this._revision++;
      for (const e of jobs.updateJobs(this._state)) this.emit('tour', e);
    }
    this.flushMessages(lastId);
    return result;
  }
}
