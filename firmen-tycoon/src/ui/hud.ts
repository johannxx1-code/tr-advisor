// HTML/CSS-Overlay: Statusleiste oben, Menüleiste unten, Panels. Keine Spiellogik.

import { MONTH_NAMES, monthOf, seasonIcon, seasonOf, yearOf } from '../sim/calendar';
import { formatClock, toGameTime } from '../sim/clock';
import { companyLevelName, GAME_SPEEDS, type GameSpeed, type GameState } from '../sim/state';
import { maxOrderQty, supplierOffers, type ActionResult } from '../sim/trade';
import './hud.css';
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
  { id: 'orders', icon: '📋', label: 'Aufträge', stage: 3, text: 'Kundenaufträge mit Frist, Bonus und Vertragsstrafe erscheinen hier.' },
  { id: 'staff', icon: '👷', label: 'Personal', stage: 4, text: 'Mitarbeiter einstellen, Gehälter, Erfahrung und Motivation.' },
  { id: 'storage', icon: '📦', label: 'Lager', render: (state) => renderStorage(state) },
  { id: 'finance', icon: '💶', label: 'Finanzen', stage: 4, text: 'Fixkosten, Kredite und Monatsbilanz.' },
  { id: 'upgrades', icon: '⭐', label: 'Upgrades', stage: 5, text: 'Upgrade-Baum und Firmenlevel.' },
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
  private last = { money: '', level: '', season: '', day: '', clock: '', speed: -1 };
  private readonly ui = createPanelUiState();
  private state: Readonly<GameState> | null = null;
  private renderedRevision = -1;
  private panelDirty = false;

  constructor(root: HTMLElement, private readonly actions: HudActions) {
    root.innerHTML = `
      <header class="topbar">
        <div class="chip chip-money" title="Kontostand"><span class="chip-icon">💰</span><span data-ref="money"></span></div>
        <div class="chip chip-level" title="Firmenlevel"><span class="chip-icon">🏠</span><span data-ref="level"></span></div>
        <div class="chip chip-season" data-ref="season"></div>
        <div class="topbar-spacer"></div>
        <div class="chip chip-time" title="Spielzeit">
          <span data-ref="day"></span><span class="time-sep">·</span><span data-ref="clock"></span>
        </div>
        <div class="speed" role="group" aria-label="Spielgeschwindigkeit"></div>
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
    this.set('level', this.levelEl, `Lv ${state.companyLevel} · ${companyLevelName(state.companyLevel)}`);
    if (this.set('season', this.seasonEl, `${seasonIcon(season)} ${MONTH_NAMES[month]}`)) {
      this.seasonEl.title = `${season}, Jahr ${yearOf(time.day)}`;
    }
    this.set('day', this.dayEl, `Tag ${time.day}`);
    this.set('clock', this.clockEl, formatClock(time));
    if (this.last.speed !== state.speed) {
      this.last.speed = state.speed;
      for (const [speed, btn] of this.speedButtons) btn.classList.toggle('active', speed === state.speed);
    }
    if (this.openPanelId && (this.panelDirty || revision !== this.renderedRevision)) {
      this.renderedRevision = revision;
      this.panelDirty = false;
      this.renderPanelBody();
    }
  }

  toast(message: string, isError = false): void {
    this.toastEl.textContent = message;
    this.toastEl.classList.toggle('error', isError);
    this.toastEl.hidden = false;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toastEl.hidden = true), isError ? 3000 : 2200);
  }

  private set(key: 'money' | 'level' | 'season' | 'day' | 'clock', el: HTMLElement, value: string): boolean {
    if (this.last[key] === value) return false;
    this.last[key] = value;
    el.textContent = value;
    return true;
  }

  private togglePanel(id: string | null): void {
    const next = id === this.openPanelId ? null : id;
    this.openPanelId = next;
    for (const [pid, btn] of this.navButtons) btn.classList.toggle('active', pid === next);
    const def = PANELS.find((p) => p.id === next);
    if (!def) {
      this.panelEl.hidden = true;
      return;
    }
    this.panelEl.querySelector('[data-ref="panelTitle"]')!.textContent = `${def.icon} ${def.label}`;
    this.panelEl.hidden = false;
    this.panelBody.scrollTop = 0;
    this.renderPanelBody();
  }

  private renderPanelBody(): void {
    const def = PANELS.find((p) => p.id === this.openPanelId);
    if (!def) return;
    if (def.render && this.state) {
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
