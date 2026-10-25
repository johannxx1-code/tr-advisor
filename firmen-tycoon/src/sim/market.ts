// Marktpreise: Grundpreis × Saison × Tagesschwankung; Händler-Ankaufpreis sinkt mit Verkaufsdruck.

import { monthOf } from './calendar';
import { ARTICLES, getArticle } from './catalog';
import { dayOf } from './clock';
import { nextRandom, round2 } from './random';
import type { GameState } from './state';

/** Jedes heute verkaufte Stück senkt den Ankaufpreis um diesen Anteil. */
export const PRESSURE_PER_UNIT = 0.01;
/** Untergrenze des Ankaufpreises relativ zum Marktpreis. */
const MIN_BID_FACTOR = 0.5;
/** Anteil des Verkaufsdrucks, der über Nacht bleibt. */
const PRESSURE_DECAY = 0.5;
const NOISE_STEP = 0.06;
const NOISE_MIN = 0.85;
const NOISE_MAX = 1.15;

export function seasonFactor(articleId: string, month: number): number {
  return getArticle(articleId).season[month];
}

/** Aktueller Marktpreis (ohne Verkaufsdruck). */
export function marketPrice(state: Readonly<GameState>, articleId: string): number {
  const article = getArticle(articleId);
  const month = monthOf(dayOf(state.minutes));
  const noise = state.market[articleId]?.noise ?? 1;
  return round2(article.basePrice * article.season[month] * noise);
}

/** Preis, den ein Händler gerade für das nächste Stück zahlt. */
export function bidPrice(state: Readonly<GameState>, articleId: string, extraUnits = 0): number {
  const pressure = (state.market[articleId]?.pressure ?? 0) + extraUnits;
  const factor = Math.max(MIN_BID_FACTOR, 1 - PRESSURE_PER_UNIT * pressure);
  return round2(marketPrice(state, articleId) * factor);
}

/** Erlös für `qty` Stück, Stück für Stück mit steigendem Verkaufsdruck. */
export function saleRevenue(state: Readonly<GameState>, articleId: string, qty: number): number {
  let sum = 0;
  for (let i = 0; i < qty; i++) sum += bidPrice(state, articleId, i);
  return round2(sum);
}

/** Wird zu Beginn jedes Spieltags aufgerufen. */
export function updateMarketDaily(state: GameState): void {
  for (const article of ARTICLES) {
    const entry = (state.market[article.id] ??= { noise: 1, pressure: 0, prevPrice: 0 });
    entry.prevPrice = marketPrice(state, article.id);
    const step = (nextRandom(state) - 0.5) * 2 * NOISE_STEP;
    // Zufallsschritt mit leichter Rückkehr zum Mittelwert 1
    let noise = entry.noise * (1 + step);
    noise += (1 - noise) * 0.1;
    entry.noise = Math.min(NOISE_MAX, Math.max(NOISE_MIN, noise));
    entry.pressure *= PRESSURE_DECAY;
  }
}
