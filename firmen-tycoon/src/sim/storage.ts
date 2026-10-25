// Lager: Regale (Kapazität), Gebäudeausbau und Belegung.

import { getArticle } from './catalog';
import type { GameState } from './state';

/** Lagerplätze pro Regal. */
export const SHELF_CAPACITY = 20;
/** Maximale Regalanzahl je Ausbaustufe: Garage, + Anbau 1, + Anbau 2. */
export const MAX_SHELVES = [9, 15, 23] as const;
/** Kosten der Anbauten (Index = Ausbaustufe, die gebaut wird, minus 1). */
export const EXTENSION_COSTS = [8000, 20000] as const;
export const EXTENSION_NAMES = ['Garage', 'Anbau 1', 'Anbau 2'] as const;

export function shelfCost(shelvesOwned: number): number {
  return 200 + 100 * shelvesOwned;
}

export function maxShelves(extension: number): number {
  return MAX_SHELVES[Math.min(extension, MAX_SHELVES.length - 1)];
}

/** Kosten des nächsten Anbaus oder null, wenn alles gebaut ist. */
export function nextExtensionCost(extension: number): number | null {
  return EXTENSION_COSTS[extension] ?? null;
}

export function capacity(state: Readonly<GameState>): number {
  return state.shelves * SHELF_CAPACITY;
}

export function usedSlots(state: Readonly<GameState>): number {
  let sum = 0;
  for (const [id, qty] of Object.entries(state.inventory)) sum += qty * getArticle(id).slots;
  return sum;
}

/** Plätze, die für unterwegs befindliche Bestellungen reserviert sind. */
export function incomingSlots(state: Readonly<GameState>): number {
  return state.orders.reduce((sum, o) => sum + o.qty * getArticle(o.articleId).slots, 0);
}

export function freeSlots(state: Readonly<GameState>): number {
  return capacity(state) - usedSlots(state) - incomingSlots(state);
}
