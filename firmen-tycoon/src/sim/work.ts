// Arbeit im Lager: Wareneingang einräumen, „Mit anpacken“ (Tippen), Aushilfe, Fuhrpark und tägliche Kosten.

import { getArticle } from './catalog';
import { MINUTES_PER_DAY } from './clock';
import { addMessage } from './messages';
import { round2 } from './random';
import { createVan, type GameState, type WorkProgress } from './state';
import type { ActionResult } from './trade';

/** Betriebszeit fürs Einräumen und für Tourstarts (Stunde, inklusive … exklusive). */
export const OPEN_HOUR = 6;
export const CLOSE_HOUR = 18;
export const STORE_BASE_MIN = 30;
export const STORE_PER_UNIT_MIN = 1;
export const LOAD_BASE_MIN = 60;
export const LOAD_PER_UNIT_MIN = 3;
/** Höchstens dieser Anteil einer Arbeit lässt sich durch Tippen sparen. */
export const TAP_MAX_SHARE = 0.5;
export const HELPER_WAGE = 90;
/** Arbeitstempo mit Aushilfe. */
export const HELPER_RATE = 2;
export const MAX_VANS = 2;
export const VAN_PRICE = 12000;
/** Tageskosten je zusätzlichem Wagen (der erste ist inklusive). */
export const VAN_DAILY_COST = 25;

const fail = (error: string): ActionResult => ({ ok: false, error });
const euro = (v: number) => `${v.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`;

export function workRate(state: Readonly<GameState>): number {
  return state.helper ? HELPER_RATE : 1;
}

export function isOpen(minutes: number): boolean {
  const minuteOfDay = minutes % MINUTES_PER_DAY;
  return minuteOfDay >= OPEN_HOUR * 60 && minuteOfDay < CLOSE_HOUR * 60;
}

/** Spielminuten innerhalb der Betriebszeit zwischen a und b. */
export function workingMinutesBetween(a: number, b: number): number {
  if (b <= a) return 0;
  let sum = 0;
  for (let day = Math.floor(a / MINUTES_PER_DAY); day * MINUTES_PER_DAY < b; day++) {
    const open = day * MINUTES_PER_DAY + OPEN_HOUR * 60;
    const close = day * MINUTES_PER_DAY + CLOSE_HOUR * 60;
    sum += Math.max(0, Math.min(b, close) - Math.max(a, open));
  }
  return sum;
}

/** Zeitpunkt, an dem nach `start` genau `need` Betriebsminuten vergangen sind. */
export function addWorkingMinutes(start: number, need: number): number {
  let t = start;
  let left = need;
  for (let guard = 0; guard < 400 && left > 1e-9; guard++) {
    const day = Math.floor(t / MINUTES_PER_DAY);
    const open = day * MINUTES_PER_DAY + OPEN_HOUR * 60;
    const close = day * MINUTES_PER_DAY + CLOSE_HOUR * 60;
    if (t < open) t = open;
    if (t >= close) {
      t = (day + 1) * MINUTES_PER_DAY + OPEN_HOUR * 60;
      continue;
    }
    const chunk = Math.min(left, close - t);
    t += chunk;
    left -= chunk;
  }
  return t;
}

export function storeWork(qty: number): number {
  return STORE_BASE_MIN + STORE_PER_UNIT_MIN * qty;
}

export function loadWork(qty: number): number {
  return LOAD_BASE_MIN + LOAD_PER_UNIT_MIN * qty;
}

/** Restliche Spielminuten einer Arbeit beim aktuellen Tempo. */
export function workMinutesLeft(state: Readonly<GameState>, w: WorkProgress): number {
  return w.workLeft / workRate(state);
}

// ---------------------------------------------------------------- Einräumen

export interface StoredEvent {
  articleId: string;
  qty: number;
}

/** Wareneingang abarbeiten (nur in der Betriebszeit), bis zur aktuellen Spielminute. */
export function updateStoring(state: GameState): StoredEvent[] {
  const events: StoredEvent[] = [];
  const now = state.minutes;
  const rate = workRate(state);
  // Ende der zuletzt fertigen Palette in diesem Durchlauf = frühester Start der nächsten
  let prevFinish = -Infinity;
  for (let guard = 0; guard < 50; guard++) {
    if (!state.storing) {
      const next = state.inbound[0];
      if (!next) break;
      const work = storeWork(next.qty);
      const start = Math.min(now, Math.max(next.arrivedAt, prevFinish));
      state.storing = { palletId: next.id, workTotal: work, workLeft: work, tapSaved: 0, lastWorkAt: start };
    }
    const task = state.storing;
    const available = workingMinutesBetween(task.lastWorkAt, now) * rate;
    if (available + 1e-9 < task.workLeft) {
      task.workLeft -= available;
      task.lastWorkAt = now;
      break;
    }
    prevFinish = addWorkingMinutes(task.lastWorkAt, task.workLeft / rate);
    finishPallet(state, task.palletId, events);
  }
  return events;
}

function finishPallet(state: GameState, palletId: number, events: StoredEvent[]): void {
  const pallet = state.inbound.find((p) => p.id === palletId);
  state.inbound = state.inbound.filter((p) => p.id !== palletId);
  state.storing = null;
  if (!pallet) return;
  state.inventory[pallet.articleId] = (state.inventory[pallet.articleId] ?? 0) + pallet.qty;
  events.push({ articleId: pallet.articleId, qty: pallet.qty });
}

// ---------------------------------------------------------------- Mit anpacken

export interface TapResult {
  ok: boolean;
  /** Gesparte Spielminuten (beim aktuellen Tempo). */
  saved: number;
  target: 'loading' | 'storing' | null;
}

/** Ziel für den nächsten Tipp: zuerst Verladen (hält Touren auf), dann Einräumen. */
export function tapTarget(state: Readonly<GameState>): { kind: 'loading' | 'storing'; work: WorkProgress } | null {
  for (const van of state.vans) {
    if (van.phase === 'loading' && van.workLeft > 0 && van.tapSaved < van.workTotal * TAP_MAX_SHARE) return { kind: 'loading', work: van };
  }
  const s = state.storing;
  if (s && s.workLeft > 0 && s.tapSaved < s.workTotal * TAP_MAX_SHARE) return { kind: 'storing', work: s };
  return null;
}

export function helpOut(state: GameState): TapResult {
  const target = tapTarget(state);
  if (!target) return { ok: false, saved: 0, target: null };
  const w = target.work as WorkProgress;
  const step = target.kind === 'loading' ? LOAD_PER_UNIT_MIN : STORE_PER_UNIT_MIN;
  const amount = Math.min(step, w.workTotal * TAP_MAX_SHARE - w.tapSaved, w.workLeft);
  w.workLeft -= amount;
  w.tapSaved += amount;
  return { ok: true, saved: amount / workRate(state), target: target.kind };
}

// ---------------------------------------------------------------- Aushilfe & Fuhrpark

export function hireHelper(state: GameState): ActionResult {
  if (state.helper) return fail('Die Aushilfe ist schon da.');
  if (state.money < HELPER_WAGE) return fail(`Zu wenig Geld für den ersten Tageslohn (${euro(HELPER_WAGE)}).`);
  state.money = round2(state.money - HELPER_WAGE);
  state.helper = true;
  return { ok: true, message: `Aushilfe eingestellt – ${euro(HELPER_WAGE)}/Tag, Verladen und Einräumen doppelt so schnell` };
}

export function fireHelper(state: GameState): ActionResult {
  if (!state.helper) return fail('Keine Aushilfe eingestellt.');
  state.helper = false;
  return { ok: true, message: 'Aushilfe entlassen' };
}

export function buyVan(state: GameState): ActionResult {
  if (state.vans.length >= MAX_VANS) return fail(`Höchstens ${MAX_VANS} Wagen (mehr ab Stufe 5).`);
  if (state.money < VAN_PRICE) return fail(`Zu wenig Geld (${euro(VAN_PRICE)} nötig).`);
  state.money = round2(state.money - VAN_PRICE);
  state.vans.push(createVan(Math.max(...state.vans.map((v) => v.id)) + 1));
  return { ok: true, message: `Firmenwagen ${state.vans.length} gekauft – zwei Touren gleichzeitig möglich` };
}

/** Tageskosten zu Tagesbeginn: Lohn der Aushilfe, Unterhalt zusätzlicher Wagen. */
export function payDailyCosts(state: GameState): void {
  const vanCost = Math.max(0, state.vans.length - 1) * VAN_DAILY_COST;
  state.money = round2(state.money - vanCost);
  if (!state.helper) return;
  if (state.money >= HELPER_WAGE) {
    state.money = round2(state.money - HELPER_WAGE);
  } else {
    state.helper = false;
    addMessage(state, {
      kind: 'staff',
      title: 'Aushilfe hat gekündigt',
      text: `Der Tageslohn von ${euro(HELPER_WAGE)} konnte nicht bezahlt werden.`,
      target: { panel: 'staff' },
    });
  }
}

/** Für Anzeigen: Name der Palette, die gerade eingeräumt wird. */
export function storingLabel(state: Readonly<GameState>): string | null {
  const p = state.storing && state.inbound.find((x) => x.id === state.storing!.palletId);
  return p ? `${p.qty}× ${getArticle(p.articleId).name}` : null;
}
