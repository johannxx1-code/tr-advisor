// Reiner Spielzustand. Muss JSON-serialisierbar bleiben (siehe CLAUDE.md).

import { ARTICLES } from './catalog';
import { randomSeed } from './random';

export type GameSpeed = 0 | 1 | 2 | 4;

export const GAME_SPEEDS: readonly GameSpeed[] = [0, 1, 2, 4];

export const COMPANY_LEVELS = ['Garage', 'Halle', 'Logistikzentrum', 'Werk', 'Konzern'] as const;

export interface MarketEntry {
  /** Tagesschwankung um den Saisonpreis (≈ 0,85 … 1,15). */
  noise: number;
  /** Verkaufsdruck: steigt mit jedem verkauften Stück, halbiert sich über Nacht. */
  pressure: number;
  /** Marktpreis des Vortags (für die Trendanzeige). */
  prevPrice: number;
}

export interface Order {
  id: number;
  articleId: string;
  supplierId: string;
  qty: number;
  /** Bezahlter Stückpreis (für Erstattung bei Teillieferung). */
  unitPrice: number;
  orderedDay: number;
  /** Spieltag, an dessen Beginn die Lieferung ankommt. */
  dueDay: number;
  /** Wurde die Zuverlässigkeit schon geprüft? (Verspätung nur einmal) */
  rolled: boolean;
  delayed: boolean;
}

export interface GameState {
  /** Geld in Euro. */
  money: number;
  /** Firmenlevel, 1-basiert (1 = Garage). */
  companyLevel: number;
  /** Vergangene Spielminuten seit Spielbeginn (Tag 1, 00:00). */
  minutes: number;
  speed: GameSpeed;
  /** Zustand des Zufallsgenerators. */
  rng: number;
  /** Freigeschaltete Artikel-IDs. */
  unlocked: string[];
  /** Lagerbestand in Stück je Artikel. */
  inventory: Record<string, number>;
  market: Record<string, MarketEntry>;
  orders: Order[];
  nextOrderId: number;
  /** Anzahl gekaufter Regale. */
  shelves: number;
  /** Gebäudeausbau: 0 = Garage, 1 = Anbau 1, 2 = Anbau 2. */
  extension: number;
}

export const START_MONEY = 5000;
/** Spielbeginn: Tag 1, 08:00 Uhr. */
export const START_MINUTES = 8 * 60;
export const START_SHELVES = 2;
/** Startbestand, damit man sofort etwas verkaufen kann. */
const START_STOCK: Record<string, number> = { akkuschrauber: 10 };

export function createInitialState(seed: number = randomSeed()): GameState {
  const market: Record<string, MarketEntry> = {};
  for (const a of ARTICLES) market[a.id] = { noise: 1, pressure: 0, prevPrice: 0 };
  return {
    money: START_MONEY,
    companyLevel: 1,
    minutes: START_MINUTES,
    speed: 1,
    rng: seed,
    unlocked: ARTICLES.filter((a) => a.unlockCost === 0).map((a) => a.id),
    inventory: { ...START_STOCK },
    market,
    orders: [],
    nextOrderId: 1,
    shelves: START_SHELVES,
    extension: 0,
  };
}

export function companyLevelName(level: number): string {
  const index = Math.min(Math.max(level, 1), COMPANY_LEVELS.length) - 1;
  return COMPANY_LEVELS[index];
}
