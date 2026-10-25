// Inhalte der Panels „Handel“ und „Lager“ als HTML. Nur Darstellung – Aktionen laufen über data-act-Attribute.

import { ARTICLES, getArticle, SUPPLIERS, type Article } from '../sim/catalog';
import { dayOf } from '../sim/clock';
import { bidPrice, marketPrice, saleRevenue } from '../sim/market';
import type { GameState } from '../sim/state';
import {
  capacity, EXTENSION_NAMES, freeSlots, inboundSlots, incomingSlots, maxShelves, nextExtensionCost, SHELF_CAPACITY, shelfCost, usedSlots,
} from '../sim/storage';
import { expressFee, expressLeadDays, maxOrderQty, orderTotal, supplierOffers } from '../sim/trade';
import { storingLabel, workMinutesLeft } from '../sim/work';
import { demandFor } from '../sim/jobs';

export type TradeTab = 'buy' | 'sell' | 'orders';

/** Reiner UI-Zustand (Auswahl, Mengen) – gehört nicht in den Spielstand. */
export interface PanelUiState {
  tradeTab: TradeTab;
  buyArticle: string | null;
  buySupplier: string | null;
  buyQty: number;
  sellArticle: string | null;
  sellQty: number;
  ordersTab: 'offers' | 'active' | 'done';
  buyExpress: boolean;
}

export function createPanelUiState(): PanelUiState {
  return { tradeTab: 'buy', buyArticle: null, buySupplier: null, buyQty: 10, sellArticle: null, sellQty: 1, ordersTab: 'offers', buyExpress: false };
}

const euroFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const euroWhole = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const euro = (v: number) => euroFmt.format(v);

function trend(state: Readonly<GameState>, id: string): string {
  const prev = state.market[id]?.prevPrice ?? 0;
  if (prev <= 0) return '';
  const now = marketPrice(state, id);
  if (now > prev * 1.005) return '<span class="up" title="gestiegen">▲</span>';
  if (now < prev * 0.995) return '<span class="down" title="gefallen">▼</span>';
  return '<span class="flat" title="unverändert">▶</span>';
}

function reliabilityPill(r: number): string {
  const cls = r >= 0.9 ? 'ok' : r >= 0.75 ? 'warn' : 'bad';
  return `<span class="pill ${cls}" title="Zuverlässigkeit">${Math.round(r * 100)} %</span>`;
}

function qtyStepper(value: number, act: string): string {
  return `<div class="qty" role="group" aria-label="Menge">
    <button data-act="${act}" data-d="-10">−10</button>
    <button data-act="${act}" data-d="-1">−</button>
    <output>${value}</output>
    <button data-act="${act}" data-d="1">+</button>
    <button data-act="${act}" data-d="10">+10</button>
    <button data-act="${act}" data-d="max">Max</button>
  </div>`;
}

// ---------------------------------------------------------------- Handel

export function renderTrade(state: Readonly<GameState>, ui: PanelUiState): string {
  const tabs: [TradeTab, string][] = [
    ['buy', 'Einkauf'],
    ['sell', 'Verkauf'],
    ['orders', `Unterwegs${state.orders.length ? ` (${state.orders.length})` : ''}`],
  ];
  const tabBar = `<div class="tabs" role="tablist">${tabs
    .map(([id, label]) => `<button role="tab" data-act="tab" data-tab="${id}" class="${ui.tradeTab === id ? 'on' : ''}">${label}</button>`)
    .join('')}</div>`;
  const body = ui.tradeTab === 'buy' ? renderBuy(state, ui) : ui.tradeTab === 'sell' ? renderSell(state, ui) : renderOrders(state);
  return tabBar + body;
}

function renderBuy(state: Readonly<GameState>, ui: PanelUiState): string {
  if (ui.buyArticle && state.unlocked.includes(ui.buyArticle)) return renderBuyDetail(state, ui, getArticle(ui.buyArticle));

  const unlocked = ARTICLES.filter((a) => state.unlocked.includes(a.id));
  const locked = ARTICLES.filter((a) => !state.unlocked.includes(a.id));
  const rows = unlocked.map((a) => `
    <button class="row" data-act="pick" data-id="${a.id}">
      <span class="row-main"><b>${a.name}</b>
        <small>Bestand ${state.inventory[a.id] ?? 0} · Markt ${euro(marketPrice(state, a.id))} ${trend(state, a.id)}</small></span>
      <span class="chev" aria-hidden="true">›</span>
    </button>`);
  const lockedRows = locked.map((a) => `
    <div class="row locked">
      <span class="row-main"><b>${a.name}</b>
        <small>Markt ca. ${euroWhole.format(marketPrice(state, a.id))} · ${a.slots} Platz/Stk</small></span>
      <button class="btn" data-act="unlock" data-id="${a.id}" aria-label="${a.name} freischalten für ${euroWhole.format(a.unlockCost)}" ${state.money < a.unlockCost ? 'disabled' : ''}>🔓 ${euroWhole.format(a.unlockCost)}</button>
    </div>`);
  return `<p class="hint">Artikel wählen, um Angebote der Lieferanten zu vergleichen.</p>
    <div class="list">${rows.join('')}</div>
    ${lockedRows.length ? `<h3 class="sub">Weitere Artikel</h3><p class="hint">Einmalige Gebühr, danach bei Lieferanten bestellbar.</p><div class="list">${lockedRows.join('')}</div>` : ''}`;
}

function renderBuyDetail(state: Readonly<GameState>, ui: PanelUiState, article: Article): string {
  const offers = supplierOffers(state, article.id);
  const offer = offers.find((o) => o.supplier.id === ui.buySupplier) ?? offers[0];
  const head = `<button class="link" data-act="back">‹ Alle Artikel</button>
    <h3>${article.name}</h3>
    <p class="muted">Markt heute ${euro(marketPrice(state, article.id))} ${trend(state, article.id)} · Händler zahlt ${euro(bidPrice(state, article.id))} · ${article.slots} Platz/Stk</p>`;
  if (!offer) return `${head}<p class="empty">Gerade führt kein Lieferant diesen Artikel. Die Restposten-Börse wechselt ihr Sortiment wöchentlich.</p>`;

  const offerRows = offers.map((o) => `
    <button class="row offer ${o === offer ? 'selected' : ''}" data-act="supplier" data-id="${o.supplier.id}" aria-pressed="${o === offer}">
      <span class="row-main"><b>${o.supplier.name}</b><small>${o.supplier.leadDays} ${o.supplier.leadDays === 1 ? 'Tag' : 'Tage'} · Versand ${euroWhole.format(o.supplier.shippingFee)}</small></span>
      ${reliabilityPill(o.supplier.reliability)}
      <b class="price">${euro(o.unitPrice)}</b>
    </button>`);

  const max = maxOrderQty(state, article.id, offer);
  const qty = Math.max(0, Math.min(ui.buyQty, max));
  const fee = ui.buyExpress && qty > 0 ? expressFee(offer.unitPrice * qty) : 0;
  const total = orderTotal(offer.unitPrice, qty, offer.supplier) + fee;
  const lead = ui.buyExpress ? expressLeadDays(offer.supplier.leadDays) : offer.supplier.leadDays;
  const arrival = dayOf(state.minutes) + lead;
  const canExpress = offer.supplier.leadDays > 1;
  let reason = '';
  if (max === 0) reason = freeSlots(state) < article.slots ? 'Kein freier Lagerplatz – Regal kaufen oder erst verkaufen.' : 'Zu wenig Geld.';
  const margin = bidPrice(state, article.id) - offer.unitPrice;

  return `${head}
    <div class="list">${offerRows.join('')}</div>
    ${qtyStepper(qty, 'buyqty')}
    ${canExpress ? `<button class="toggle-row ${ui.buyExpress ? 'on' : ''}" data-act="express" role="switch" aria-checked="${ui.buyExpress}">
      <span class="row-main"><b>⚡ Express-Lieferung</b>
        <small>${expressLeadDays(offer.supplier.leadDays)} statt ${offer.supplier.leadDays} Tage · +25 % vom Warenwert (mind. 30 €) · zuverlässiger</small></span>
      <span class="switch" aria-hidden="true"></span>
    </button>` : ''}
    <dl class="summary">
      <div><dt>Ware</dt><dd>${qty} × ${euro(offer.unitPrice)} = ${euro(offer.unitPrice * qty)}</dd></div>
      <div><dt>Versand</dt><dd>${euro(offer.supplier.shippingFee)}</dd></div>
      ${fee ? `<div><dt>⚡ Express</dt><dd>${euro(fee)}</dd></div>` : ''}
      <div class="total"><dt>Gesamt</dt><dd>${euro(qty > 0 ? total : 0)}</dd></div>
      <div><dt>Lagerplatz</dt><dd>${qty * article.slots} von ${Math.max(0, freeSlots(state))} frei</dd></div>
      <div><dt>Ankunft</dt><dd>Tag ${arrival}${offer.supplier.reliability < 0.9 ? ' (evtl. später)' : ''}, dann einräumen</dd></div>
      <div><dt>Spanne heute</dt><dd class="${margin > 0 ? 'pos' : 'neg'}">${euro(margin)} / Stk</dd></div>
    </dl>
    ${reason ? `<p class="warn-text">${reason}</p>` : ''}
    <button class="btn primary wide" data-act="order" ${qty === 0 ? 'disabled' : ''}>Bestellen</button>`;
}

function renderSell(state: Readonly<GameState>, ui: PanelUiState): string {
  const stocked = ARTICLES.filter((a) => (state.inventory[a.id] ?? 0) > 0);
  if (stocked.length === 0) return '<p class="empty">Das Lager ist leer. Im Reiter „Einkauf“ Ware bestellen.</p>';
  const rows = stocked.map((a) => {
    const stock = state.inventory[a.id] ?? 0;
    const open = ui.sellArticle === a.id;
    const head = `
      <button class="row ${open ? 'selected' : ''}" data-act="sellpick" data-id="${a.id}" aria-expanded="${open}">
        <span class="row-main"><b>${a.name}</b><small>Bestand ${stock} · Händler zahlt ${euro(bidPrice(state, a.id))} ${trend(state, a.id)}</small></span>
        <span class="chev" aria-hidden="true">${open ? '⌄' : '›'}</span>
      </button>`;
    if (!open) return head;
    const qty = Math.max(1, Math.min(ui.sellQty, stock));
    const revenue = saleRevenue(state, a.id, qty);
    return `${head}
      <div class="expand">
        ${qtyStepper(qty, 'sellqty')}
        <dl class="summary">
          <div class="total"><dt>Erlös</dt><dd>${euro(revenue)}</dd></div>
          <div><dt>Ø pro Stück</dt><dd>${euro(revenue / qty)}</dd></div>
        </dl>
        <p class="hint">Jedes verkaufte Stück drückt den Preis um 1 %. Über Nacht erholt er sich zur Hälfte.</p>
        <button class="btn primary wide" data-act="sell" data-id="${a.id}">Verkaufen</button>
      </div>`;
  });
  return `<div class="list">${rows.join('')}</div>`;
}

function renderOrders(state: Readonly<GameState>): string {
  if (state.orders.length === 0) return '<p class="empty">Keine Bestellungen unterwegs.</p>';
  const hint = '<p class="hint">⚡ Express halbiert die restliche Lieferzeit.</p>';
  const today = dayOf(state.minutes);
  const rows = [...state.orders]
    .sort((a, b) => a.dueDay - b.dueDay)
    .map((o) => {
      const days = o.dueDay - today;
      const when = days <= 0 ? 'heute' : days === 1 ? 'morgen' : `in ${days} Tagen`;
      const canExpress = !o.express && days >= 2;
      const fee = expressFee(o.unitPrice * o.qty);
      return `<div class="row">
        <span class="row-main"><b>${o.qty}× ${getArticle(o.articleId).name}</b>
          <small>${supplierName(o.supplierId)} · Tag ${o.dueDay} (${when})</small></span>
        ${o.delayed ? '<span class="pill warn">verspätet</span>' : ''}
        ${o.express ? '<span class="pill ok">⚡ Express</span>' : ''}
        ${canExpress ? `<button class="btn ghost" data-act="expedite" data-id="${o.id}" ${state.money < fee ? 'disabled' : ''} aria-label="Express für ${euroWhole.format(fee)}">⚡ ${euroWhole.format(fee)}</button>` : ''}
      </div>`;
    });
  return `${hint}<div class="list">${rows.join('')}</div>`;
}

const SUPPLIER_NAMES: Record<string, string> = Object.fromEntries(SUPPLIERS.map((s) => [s.id, s.name]));

function supplierName(id: string): string {
  return SUPPLIER_NAMES[id] ?? id;
}

// ---------------------------------------------------------------- Lager

export function renderStorage(state: Readonly<GameState>): string {
  const cap = capacity(state);
  const used = usedSlots(state);
  const incoming = incomingSlots(state);
  const inbound = inboundSlots(state);
  const free = Math.max(0, cap - used - inbound - incoming);
  const pct = (v: number) => (cap > 0 ? Math.min(100, (v / cap) * 100) : 0);

  const stock = ARTICLES.filter((a) => state.unlocked.includes(a.id) || (state.inventory[a.id] ?? 0) > 0).map((a) => {
    const qty = state.inventory[a.id] ?? 0;
    const min = state.minStock[a.id] ?? 0;
    const need = demandFor(state, a.id);
    const low = min > 0 && qty < min;
    return `<div class="row stock-row ${low ? 'low' : ''}">
      <span class="row-main"><b>${a.name}</b>
        <small>${qty} Stk · Wert ${euroWhole.format(bidPrice(state, a.id) * qty)}${need ? ` · <span class="need">${need} für Aufträge</span>` : ''}</small></span>
      <span class="minstock" role="group" aria-label="Warnen unter Mindestmenge">
        <small>${low ? '<span class="pill warn">knapp</span>' : 'Warnen unter'}</small>
        <span class="minstock-ctrl">
          <button data-act="min" data-id="${a.id}" data-d="-5" aria-label="Mindestmenge senken">−</button>
          <output>${min || 'aus'}</output>
          <button data-act="min" data-id="${a.id}" data-d="5" aria-label="Mindestmenge erhöhen">+</button>
        </span>
      </span>
    </div>`;
  });

  const maxS = maxShelves(state.extension);
  const canShelf = state.shelves < maxS;
  const sCost = shelfCost(state.shelves);
  const extCost = nextExtensionCost(state.extension);
  const extName = EXTENSION_NAMES[state.extension + 1];
  const extReady = state.shelves >= maxS;
  const extGain = extCost !== null ? maxShelves(state.extension + 1) - maxS : 0;

  return `
    <div class="capacity">
      <div class="bar" role="img" aria-label="Belegt ${used}, unterwegs ${incoming}, frei ${free} von ${cap} Plätzen">
        <i class="used" style="width:${pct(used)}%"></i><i class="inbound" style="width:${pct(inbound)}%"></i><i class="incoming" style="width:${pct(incoming)}%"></i>
      </div>
      <div class="legend">
        <span><i class="dot used"></i>Belegt ${used}</span>
        <span><i class="dot inbound"></i>Wareneingang ${inbound}</span>
        <span><i class="dot incoming"></i>Unterwegs ${incoming}</span>
        <span><i class="dot free"></i>Frei ${free}</span>
        <span class="muted">von ${cap} Plätzen</span>
      </div>
    </div>

    ${renderInbound(state)}
    <h3 class="sub">Bestand & Warnungen</h3>
    <div class="list">${stock.join('')}</div>
    <p class="hint">„Warnen unter“: Fällt der Bestand darunter, kommt eine Meldung. Wert zum heutigen Händlerpreis.</p>

    <h3 class="sub">Ausbau · ${EXTENSION_NAMES[state.extension]}</h3>
    <div class="list">
      <div class="row">
        <span class="row-main"><b>Regal kaufen</b><small>+${SHELF_CAPACITY} Plätze · ${state.shelves} von ${maxS} Regalplätzen belegt</small></span>
        <button class="btn" data-act="shelf" ${!canShelf || state.money < sCost ? 'disabled' : ''}>${canShelf ? euroWhole.format(sCost) : 'voll'}</button>
      </div>
      ${extCost !== null ? `
      <div class="row">
        <span class="row-main"><b>${extName} bauen</b><small>${extReady ? `+${extGain} Regalplätze` : `Erst alle ${maxS} Regalplätze belegen`}</small></span>
        <button class="btn" data-act="extend" ${!extReady || state.money < extCost ? 'disabled' : ''}>${euroWhole.format(extCost)}</button>
      </div>` : '<p class="hint">Alle Anbauten gebaut. Der Umzug in eine Halle kommt mit Stufe 5.</p>'}
    </div>`;
}

function renderInbound(state: Readonly<GameState>): string {
  if (state.inbound.length === 0) return '';
  const task = state.storing;
  const rows = state.inbound.map((p) => {
    const active = task?.palletId === p.id;
    const progress = active && task ? 1 - task.workLeft / task.workTotal : 0;
    return `<div class="row">
      <span class="row-main"><b>${p.qty}× ${getArticle(p.articleId).name}</b>
        <small>${active && task ? `wird eingeräumt · noch ca. ${Math.ceil(workMinutesLeft(state, task))} Min. (6–18 Uhr)` : 'wartet'}</small>
        ${active ? `<span class="prog"><i class="d" style="width:${progress * 100}%"></i></span>` : ''}</span>
    </div>`;
  });
  return `<h3 class="sub">Wareneingang</h3>
    <div class="list">${rows.join('')}</div>
    <p class="hint">Gelieferte Ware muss erst eingeräumt werden. ${storingLabel(state) ? 'Mit 💪 Anpacken geht es schneller.' : ''}</p>`;
}
