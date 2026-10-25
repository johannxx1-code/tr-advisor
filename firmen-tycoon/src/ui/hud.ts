// HTML/CSS-Overlay: Statusleiste oben, Menüleiste unten, Panels. Keine Spiellogik.

import { MONTH_NAMES, monthOf, seasonIcon, seasonOf, yearOf } from '../sim/calendar';
import { formatClock, toGameTime } from '../sim/clock';
import { companyLevelName, GAME_SPEEDS, type GameSpeed, type GameState } from '../sim/state';
import { unreadCount } from '../sim/messages';
import { maxOrderQty, supplierOffers, type ActionResult } from '../sim/trade';
import './hud.css';
import { renderMessages, renderOrders, renderSummary, type CatchUpSummary, type OrdersTab } from './jobsPanel';
import { createPanelUiState, renderStorage, renderTrade, type PanelUiState, type TradeTab } from './panels';

export interface HudActions {
  setSpeed(speed: GameSpeed): void;
  save(): void;
  newGame(): void;
  unlock(articleId: string): ActionResult;
  order(articleId: string, supplierId: string, qty: number): ActionResult;
  sell(articleId: string, qty: number): ActionResult;
  buyShelf(): ActionResult;
  buildExtension(): ActionResult;
  acceptOffer(offerId: number): ActionResult;
  declineOffer(offerId: number): ActionResult;
  cancelJob(jobId: number): ActionResult;
  setMinStock(articleId: string, value: number): void;
  markMessagesRead(): void;
}

interface PanelDef {
  id: string;
  icon: string;
  label: string;
  /** Platzhalter: Stufe, in der das Panel kommt. */
  stage?: number;
  text?: string;
  render?: (state: Readonly<GameState>, ui: PanelUiState) => string;
}

const PANELS: PanelDef[] = [
  { id: 'trade', icon: '🔁', label: 'Handel', render: renderTrade },
  { id: 'orders', icon: '📋', label: 'Aufträge', render: (state, ui) => renderOrders(state, ui.ordersTab) },
  { id: 'staff', icon: '👷', label: 'Personal', stage: 4, text: 'Mitarbeiter einstellen, Gehälter, Erfahrung und Motivation.' },
  { id: 'storage', icon: '📦', label: 'Lager', render: (state) => renderStorage(state) },
  { id: 'finance', icon: '💶', label: 'Finanzen', stage: 4, text: 'Fixkosten, Kredite und Monatsbilanz.' },
  { id: 'upgrades', icon: '⭐', label: 'Upgrades', stage: 5, text: 'Upgrade-Baum und Firmenlevel.' },
];

/** Panels ohne eigenen Knopf in der Menüleiste. */
const HIDDEN_PANELS: PanelDef[] = [
  { id: 'messages', icon: '🔔', label: 'Meldungen' },
];

const SPEED_LABELS: Record<GameSpeed, string> = { 0: '❚❚', 1: '1×', 2: '2×', 4: '4×' };

const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export class Hud {
  private readonly moneyEl: HTMLElement;
  private readonly levelEl: HTMLElement;
  private readonly seasonEl: HTMLElement;
  private readonly dayEl: HTMLElement;
  private readonly clockEl: HTMLElement;
  private readonly speedButtons = new Map<GameSpeed, HTMLButtonElement>();
  private readonly panelEl: HTMLElement;
  private readonly menuEl: HTMLElement;
  private readonly toastEl: HTMLElement;
  private readonly panelBody: HTMLElement;
  private readonly navButtons = new Map<string, HTMLButtonElement>();
  private openPanelId: string | null = null;
  private toastTimer = 0;
  private last = { money: '', level: '', season: '', rep: '', day: '', clock: '', speed: -1, unread: -1, offers: -1 };
  private readonly ui = createPanelUiState();
  private readonly repEl: HTMLElement;
  private readonly bellBadge: HTMLElement;
  private readonly summaryEl: HTMLElement;
  /** Beim Öffnen des Postfachs ungelesene Meldungen merken, um sie hervorzuheben. */
  private unreadSnapshot = new Set<number>();
  private state: Readonly<GameState> | null = null;
  private renderedRevision = -1;
  private panelDirty = false;

  constructor(root: HTMLElement, private readonly actions: HudActions) {
    root.innerHTML = `
      <header class="topbar">
        <div class="chip chip-money" title="Kontostand"><span class="chip-icon">💰</span><span data-ref="money"></span></div>
        <div class="chip chip-level" title="Firmenlevel"><span class="chip-icon">🏠</span><span data-ref="level"></span></div>
        <div class="chip chip-season" data-ref="season"></div>
        <div class="chip chip-rep" title="Ruf (0–100)">⭐ <span data-ref="rep"></span></div>
        <div class="topbar-spacer"></div>
        <div class="chip chip-time" title="Spielzeit">
          <span data-ref="day"></span><span class="time-sep">·</span><span data-ref="clock"></span>
        </div>
        <div class="speed" role="group" aria-label="Spielgeschwindigkeit"></div>
        <button class="icon-btn bell" data-ref="bell" aria-label="Meldungen">🔔<span class="badge" data-ref="badge" hidden></span></button>
        <button class="icon-btn" data-ref="menuBtn" aria-label="Menü">☰</button>
      </header>
      <div class="menu" data-ref="menu" hidden>
        <button data-action="save">💾 Speichern</button>
        <button data-action="new">🆕 Neues Spiel</button>
        <div class="menu-confirm" data-ref="confirm" hidden>
          <p>Aktuellen Spielstand überschreiben?</p>
          <button data-action="confirm-new" class="danger">Ja, neu starten</button>
          <button data-action="cancel">Abbrechen</button>
        </div>
      </div>
      <nav class="bottombar"></nav>
      <section class="panel" data-ref="panel" hidden>
        <div class="panel-head">
          <h2 data-ref="panelTitle"></h2>
          <button class="icon-btn" data-ref="panelClose" aria-label="Schließen">✕</button>
        </div>
        <div class="panel-body" data-ref="panelBody"></div>
      </section>
      <div class="toast" data-ref="toast" hidden></div>
      <div class="overlay" data-ref="summary" hidden><div class="dialog" role="dialog" aria-modal="true" aria-label="Während du weg warst"></div></div>
    `;
    const ref = <T extends HTMLElement = HTMLElement>(name: string) => root.querySelector<T>(`[data-ref="${name}"]`)!;
    this.moneyEl = ref('money');
    this.levelEl = ref('level');
    this.seasonEl = ref('season');
    this.dayEl = ref('day');
    this.clockEl = ref('clock');
    this.panelEl = ref('panel');
    this.menuEl = ref('menu');
    this.toastEl = ref('toast');
    this.panelBody = ref('panelBody');
    this.panelBody.addEventListener('click', this.onPanelClick);
    this.repEl = ref('rep');
    this.bellBadge = ref('badge');
    this.summaryEl = ref('summary');
    this.summaryEl.addEventListener('click', this.onPanelClick);
    ref('bell').addEventListener('click', () => this.togglePanel('messages'));

    const speedGroup = root.querySelector<HTMLElement>('.speed')!;
    for (const speed of GAME_SPEEDS) {
      const btn = document.createElement('button');
      btn.textContent = SPEED_LABELS[speed];
      btn.setAttribute('aria-label', speed === 0 ? 'Pause' : `Geschwindigkeit ${speed}x`);
      btn.addEventListener('click', () => actions.setSpeed(speed));
      speedGroup.append(btn);
      this.speedButtons.set(speed, btn);
    }

    const nav = root.querySelector<HTMLElement>('.bottombar')!;
    for (const p of PANELS) {
      const btn = document.createElement('button');
      btn.innerHTML = `<span class="nav-icon">${p.icon}</span><span class="nav-label">${p.label}</span>`;
      btn.addEventListener('click', () => this.togglePanel(p.id));
      nav.append(btn);
      this.navButtons.set(p.id, btn);
    }

    ref('panelClose').addEventListener('click', () => this.togglePanel(null));
    // Rückfrage im Menü selbst: confirm() ist in eingebetteten Ansichten (z. B. Artifact) blockiert.
    const confirmEl = ref('confirm');
    ref('menuBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      confirmEl.hidden = true;
      this.menuEl.hidden = !this.menuEl.hidden;
    });
    this.menuEl.addEventListener('click', (e) => {
      const action = (e.target as HTMLElement).closest('button')?.dataset.action;
      if (!action) return;
      if (action === 'new') {
        confirmEl.hidden = false;
        return;
      }
      this.menuEl.hidden = true;
      confirmEl.hidden = true;
      if (action === 'save') actions.save();
      if (action === 'confirm-new') actions.newGame();
    });
    document.addEventListener('pointerdown', (e) => {
      if (!this.menuEl.hidden && !(e.target as HTMLElement).closest('.menu, [data-ref="menuBtn"]')) this.menuEl.hidden = true;
    });

    window.addEventListener('keydown', this.onKey);
  }

  /**
   * Wird jedes Frame aufgerufen; schreibt nur bei Änderungen ins DOM.
   * `revision` zählt Zustandsänderungen der Simulation – dann wird ein offenes Panel neu gezeichnet.
   */
  update(state: Readonly<GameState>, revision: number): void {
    this.state = state;
    const time = toGameTime(state.minutes);
    const month = monthOf(time.day);
    const season = seasonOf(month);
    this.set('money', this.moneyEl, money.format(state.money));
    if (this.set('level', this.levelEl, companyLevelName(state.companyLevel))) {
      this.levelEl.parentElement!.title = `Firmenlevel ${state.companyLevel} von 5`;
    }
    if (this.set('season', this.seasonEl, `${seasonIcon(season)} ${MONTH_NAMES[month]}`)) {
      this.seasonEl.title = `${season}, Jahr ${yearOf(time.day)}`;
    }
    this.set('day', this.dayEl, `Tag ${time.day}`);
    this.set('clock', this.clockEl, formatClock(time));
    if (this.last.speed !== state.speed) {
      this.last.speed = state.speed;
      for (const [speed, btn] of this.speedButtons) btn.classList.toggle('active', speed === state.speed);
    }
    this.set('rep', this.repEl, String(state.reputation));
    if (this.last.offers !== state.offers.length) {
      this.last.offers = state.offers.length;
      const btn = this.navButtons.get('orders')!;
      btn.querySelector('.badge')?.remove();
      if (state.offers.length) btn.insertAdjacentHTML('beforeend', `<span class="badge" aria-label="${state.offers.length} Angebote">${state.offers.length}</span>`);
    }
    const unread = unreadCount(state);
    if (this.last.unread !== unread) {
      this.last.unread = unread;
      this.bellBadge.hidden = unread === 0;
      this.bellBadge.textContent = unread > 99 ? '99+' : String(unread);
    }
    if (this.openPanelId && (this.panelDirty || revision !== this.renderedRevision)) {
      this.renderedRevision = revision;
      this.panelDirty = false;
      this.renderPanelBody();
    }
  }

  /** Zusammenfassung nach dem Nachrechnen; bei wenig Zeit ohne Ereignisse nur ein kurzer Hinweis. */
  showSummary(summary: CatchUpSummary): void {
    if (summary.messages.length === 0 && summary.minutes < 60) {
      this.toast(`${Math.round(summary.minutes)} Min. im Hintergrund weitergelaufen`);
      return;
    }
    this.summaryEl.querySelector('.dialog')!.innerHTML = renderSummary(summary);
    this.summaryEl.hidden = false;
  }

  toast(message: string, isError = false): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.toggle('error', isError);
    this.toastEl.hidden = false;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toastEl.hidden = true), isError ? 3000 : 2200);
  }

  private set(key: 'money' | 'level' | 'season' | 'rep' | 'day' | 'clock', el: HTMLElement, value: string): boolean {
    if (this.last[key] === value) return false;
    this.last[key] = value;
    el.textContent = value;
    return true;
  }

  private togglePanel(id: string | null): void {
    const next = id === this.openPanelId ? null : id;
    this.openPanelId = next;
    for (const [pid, btn] of this.navButtons) btn.classList.toggle('active', pid === next);
    const def = findPanel(next);
    if (!def) {
      this.panelEl.hidden = true;
      return;
    }
    if (def.id === 'messages' && this.state) {
      this.unreadSnapshot = new Set(this.state.messages.filter((m) => !m.read).map((m) => m.id));
      this.actions.markMessagesRead();
    }
    this.panelEl.querySelector('[data-ref="panelTitle"]')!.textContent = `${def.icon} ${def.label}`;
    this.panelEl.hidden = false;
    this.panelBody.scrollTop = 0;
    this.renderPanelBody();
  }

  private renderPanelBody(): void {
    const def = findPanel(this.openPanelId);
    if (!def) return;
    if (def.id === 'messages' && this.state) {
      this.panelBody.innerHTML = renderMessages(this.state, this.unreadSnapshot);
    } else if (def.render && this.state) {
      // Scrollposition beim Neuzeichnen behalten
      const scroll = this.panelBody.scrollTop;
      this.panelBody.innerHTML = def.render(this.state, this.ui);
      this.panelBody.scrollTop = scroll;
    } else {
      this.panelBody.innerHTML = `
        <p class="placeholder">${def.text ?? ''}</p>
        <p class="placeholder-note">Kommt in Stufe ${def.stage}.</p>`;
    }
  }

  /** Öffnet ein Panel (ohne Umschalten, falls schon offen). */
  openPanel(id: string): void {
    if (this.openPanelId === id) {
      this.panelDirty = true;
      return;
    }
    this.togglePanel(id);
  }

  /** Öffnet „Handel → Einkauf“ direkt beim Artikel (z. B. zum Nachbestellen). */
  private openBuy(articleId: string): void {
    this.ui.tradeTab = 'buy';
    this.ui.buyArticle = articleId;
    this.ui.buySupplier = null;
    this.openPanel('trade');
    this.panelDirty = true;
  }

  private report(result: ActionResult): void {
    this.toast(result.ok ? result.message : result.error, !result.ok);
    this.panelDirty = true;
  }

  private onPanelClick = (e: Event): void => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!el || (el as HTMLButtonElement).disabled || !this.state) return;
    const state = this.state;
    const ui = this.ui;
    const id = el.dataset.id ?? '';
    switch (el.dataset.act) {
      case 'tab':
        ui.tradeTab = el.dataset.tab as TradeTab;
        this.panelBody.scrollTop = 0;
        break;
      case 'pick':
        ui.buyArticle = id;
        ui.buySupplier = null;
        this.panelBody.scrollTop = 0;
        break;
      case 'back':
        ui.buyArticle = null;
        break;
      case 'supplier':
        ui.buySupplier = id;
        break;
      case 'buyqty': {
        const offers = ui.buyArticle ? supplierOffers(state, ui.buyArticle) : [];
        const offer = offers.find((o) => o.supplier.id === ui.buySupplier) ?? offers[0];
        const max = offer && ui.buyArticle ? maxOrderQty(state, ui.buyArticle, offer) : 0;
        ui.buyQty = stepQty(Math.min(ui.buyQty, max), el.dataset.d, max);
        break;
      }
      case 'order': {
        const offers = ui.buyArticle ? supplierOffers(state, ui.buyArticle) : [];
        const offer = offers.find((o) => o.supplier.id === ui.buySupplier) ?? offers[0];
        if (!ui.buyArticle || !offer) return;
        const qty = Math.min(ui.buyQty, maxOrderQty(state, ui.buyArticle, offer));
        this.report(this.actions.order(ui.buyArticle, offer.supplier.id, qty));
        break;
      }
      case 'unlock':
        this.report(this.actions.unlock(id));
        break;
      case 'sellpick':
        ui.sellArticle = ui.sellArticle === id ? null : id;
        ui.sellQty = state.inventory[id] ?? 1;
        break;
      case 'sellqty': {
        const stock = ui.sellArticle ? state.inventory[ui.sellArticle] ?? 0 : 0;
        ui.sellQty = Math.max(1, stepQty(Math.min(ui.sellQty, stock), el.dataset.d, stock));
        break;
      }
      case 'sell': {
        const stock = state.inventory[id] ?? 0;
        const result = this.actions.sell(id, Math.min(ui.sellQty, stock));
        if (result.ok && !(this.state.inventory[id] > 0)) ui.sellArticle = null;
        this.report(result);
        break;
      }
      case 'shelf':
        this.report(this.actions.buyShelf());
        break;
      case 'otab':
        ui.ordersTab = el.dataset.tab as OrdersTab;
        this.panelBody.scrollTop = 0;
        break;
      case 'accept': {
        const result = this.actions.acceptOffer(Number(id));
        if (result.ok) ui.ordersTab = 'active';
        this.report(result);
        break;
      }
      case 'decline':
        this.report(this.actions.declineOffer(Number(id)));
        break;
      case 'cancel':
        if (el.dataset.confirm !== 'yes') {
          // Zweiter Klick bestätigt (confirm() ist in eingebetteten Ansichten blockiert)
          el.dataset.confirm = 'yes';
          el.textContent = 'Wirklich abbrechen?';
          el.classList.add('danger');
          return;
        }
        this.report(this.actions.cancelJob(Number(id)));
        break;
      case 'restock':
        this.openBuy(id);
        return;
      case 'min': {
        const current = state.minStock[id] ?? 0;
        this.actions.setMinStock(id, current + Number(el.dataset.d ?? 0));
        break;
      }
      case 'goto': {
        const msg = state.messages.find((m) => m.id === Number(id));
        this.summaryEl.hidden = true;
        if (!msg?.target) return;
        if (msg.target.panel === 'trade' && msg.target.articleId && state.unlocked.includes(msg.target.articleId)) this.openBuy(msg.target.articleId);
        else this.openPanel(msg.target.panel);
        return;
      }
      case 'close-summary':
        this.summaryEl.hidden = true;
        return;
      case 'extend':
        this.report(this.actions.buildExtension());
        break;
      default:
        return;
    }
    this.panelDirty = true;
  };

  private onKey = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.code === 'Space') {
      e.preventDefault();
      this.actions.setSpeed(this.last.speed === 0 ? 1 : 0);
    } else if (e.key === '1') this.actions.setSpeed(1);
    else if (e.key === '2') this.actions.setSpeed(2);
    else if (e.key === '3' || e.key === '4') this.actions.setSpeed(4);
    else if (e.key === 'Escape') {
      this.summaryEl.hidden = true;
      this.togglePanel(null);
      this.menuEl.hidden = true;
    }
  };
}

/** Menge um `d` ändern („max“ = Maximum), begrenzt auf 0 … max. */
function stepQty(current: number, d: string | undefined, max: number): number {
  if (d === 'max') return max;
  return Math.max(0, Math.min(max, current + Number(d ?? 0)));
}

function findPanel(id: string | null): PanelDef | undefined {
  return PANELS.find((p) => p.id === id) ?? HIDDEN_PANELS.find((p) => p.id === id);
}
