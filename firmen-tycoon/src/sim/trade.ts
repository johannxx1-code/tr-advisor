// Handelsaktionen (freischalten, bestellen, verkaufen, ausbauen) und Lieferungen.
// Aktionen verändern den Zustand nur, wenn sie erlaubt sind, und melden sonst einen Grund.

import { getArticle, getSupplier, SUPPLIERS, supplierSells, type Supplier } from './catalog';
import { dayOf } from './clock';
import { marketPrice, saleRevenue } from './market';
import { nextRandom, round2 } from './random';
import type { GameState, Order } from './state';
import { freeSlots, maxShelves, nextExtensionCost, shelfCost } from './storage';

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

const fail = (error: string): ActionResult => ({ ok: false, error });
const euro = (v: number) => `${v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export interface Offer {
  supplier: Supplier;
  unitPrice: number;
}

/** Angebote aller Lieferanten, die den Artikel heute führen, günstigste zuerst. */
export function supplierOffers(state: Readonly<GameState>, articleId: string): Offer[] {
  const article = getArticle(articleId);
  const day = dayOf(state.minutes);
  const price = marketPrice(state, articleId);
  return SUPPLIERS.filter((s) => supplierSells(s, article, day))
    .map((supplier) => ({ supplier, unitPrice: round2(price * supplier.priceFactor) }))
    .sort((a, b) => a.unitPrice - b.unitPrice);
}

export function orderTotal(unitPrice: number, qty: number, supplier: Supplier): number {
  return round2(unitPrice * qty + supplier.shippingFee);
}

/** Größte bestellbare Menge (Platz und Geld). */
export function maxOrderQty(state: Readonly<GameState>, articleId: string, offer: Offer): number {
  const bySpace = Math.floor(Math.max(0, freeSlots(state)) / getArticle(articleId).slots);
  const byMoney = Math.floor(Math.max(0, state.money - offer.supplier.shippingFee) / offer.unitPrice);
  return Math.max(0, Math.min(bySpace, byMoney));
}

export function unlockArticle(state: GameState, articleId: string): ActionResult {
  const article = getArticle(articleId);
  if (state.unlocked.includes(articleId)) return fail('Bereits freigeschaltet.');
  if (state.money < article.unlockCost) return fail(`Zu wenig Geld (${euro(article.unlockCost)} nötig).`);
  state.money = round2(state.money - article.unlockCost);
  state.unlocked.push(articleId);
  return { ok: true, message: `${article.name} freigeschaltet` };
}

export function placeOrder(state: GameState, articleId: string, supplierId: string, qty: number): ActionResult {
  const article = getArticle(articleId);
  const supplier = getSupplier(supplierId);
  if (!Number.isInteger(qty) || qty <= 0) return fail('Ungültige Menge.');
  if (!state.unlocked.includes(articleId)) return fail('Artikel ist noch nicht freigeschaltet.');
  const offer = supplierOffers(state, articleId).find((o) => o.supplier.id === supplierId);
  if (!offer) return fail(`${supplier.name} führt diesen Artikel gerade nicht.`);
  if (qty * article.slots > freeSlots(state)) return fail('Nicht genug Lagerplatz – Regal kaufen oder erst verkaufen.');
  const total = orderTotal(offer.unitPrice, qty, supplier);
  if (total > state.money) return fail(`Zu wenig Geld (${euro(total)} nötig).`);

  const day = dayOf(state.minutes);
  state.money = round2(state.money - total);
  state.orders.push({
    id: state.nextOrderId++,
    articleId,
    supplierId,
    qty,
    unitPrice: offer.unitPrice,
    orderedDay: day,
    dueDay: day + supplier.leadDays,
    rolled: false,
    delayed: false,
  });
  return { ok: true, message: `${qty}× ${article.name} bestellt – Ankunft Tag ${day + supplier.leadDays}` };
}

export function sell(state: GameState, articleId: string, qty: number): ActionResult {
  const article = getArticle(articleId);
  const stock = state.inventory[articleId] ?? 0;
  if (!Number.isInteger(qty) || qty <= 0) return fail('Ungültige Menge.');
  if (qty > stock) return fail(`Nur ${stock} Stück auf Lager.`);
  const revenue = saleRevenue(state, articleId, qty);
  state.money = round2(state.money + revenue);
  state.inventory[articleId] = stock - qty;
  if (state.inventory[articleId] === 0) delete state.inventory[articleId];
  state.market[articleId].pressure += qty;
  return { ok: true, message: `${qty}× ${article.name} verkauft für ${euro(revenue)}` };
}

export function buyShelf(state: GameState): ActionResult {
  if (state.shelves >= maxShelves(state.extension)) {
    return fail(nextExtensionCost(state.extension) === null ? 'Kein Platz mehr für Regale.' : 'Gebäude ist voll – erst erweitern.');
  }
  const cost = shelfCost(state.shelves);
  if (state.money < cost) return fail(`Zu wenig Geld (${euro(cost)} nötig).`);
  state.money = round2(state.money - cost);
  state.shelves++;
  return { ok: true, message: `Regal ${state.shelves} aufgestellt` };
}

export function buildExtension(state: GameState): ActionResult {
  const cost = nextExtensionCost(state.extension);
  if (cost === null) return fail('Alle Anbauten sind gebaut.');
  if (state.shelves < maxShelves(state.extension)) return fail('Erst alle Regalplätze im Gebäude belegen.');
  if (state.money < cost) return fail(`Zu wenig Geld (${euro(cost)} nötig).`);
  state.money = round2(state.money - cost);
  state.extension++;
  return { ok: true, message: `Anbau ${state.extension} fertig` };
}

export interface DeliveryReport {
  order: Order;
  delivered: number;
  refund: number;
  /** Lieferung wurde verschoben (kommt später). */
  delayedUntil?: number;
}

/** Wird zu Beginn jedes Spieltags aufgerufen: fällige Bestellungen liefern oder verzögern. */
export function processOrders(state: GameState, day: number): DeliveryReport[] {
  const reports: DeliveryReport[] = [];
  const remaining: Order[] = [];
  for (const order of state.orders) {
    if (order.dueDay > day) {
      remaining.push(order);
      continue;
    }
    let delivered = order.qty;
    if (!order.rolled) {
      order.rolled = true;
      const reliability = getSupplier(order.supplierId).reliability;
      if (nextRandom(state) >= reliability) {
        if (nextRandom(state) < 0.5) {
          order.delayed = true;
          order.dueDay = day + 1 + Math.floor(nextRandom(state) * 3);
          remaining.push(order);
          reports.push({ order, delivered: 0, refund: 0, delayedUntil: order.dueDay });
          continue;
        }
        delivered = Math.max(1, Math.floor(order.qty * (0.4 + nextRandom(state) * 0.5)));
      }
    }
    const refund = round2((order.qty - delivered) * order.unitPrice);
    state.money = round2(state.money + refund);
    state.inventory[order.articleId] = (state.inventory[order.articleId] ?? 0) + delivered;
    reports.push({ order, delivered, refund });
  }
  state.orders = remaining;
  return reports;
}
