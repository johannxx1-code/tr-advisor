// HTML/CSS-Overlay: Statusleiste oben, Menüleiste unten, Panels. Keine Spiellogik.

import { formatClock, toGameTime } from '../sim/clock';
import { companyLevelName, GAME_SPEEDS, type GameSpeed, type GameState } from '../sim/state';
import './hud.css';

export interface HudActions {
  setSpeed(speed: GameSpeed): void;
  save(): void;
  newGame(): void;
}

interface PanelDef {
  id: string;
  icon: string;
  label: string;
  stage: number;
  text: string;
}

const PANELS: PanelDef[] = [
  { id: 'purchase', icon: '🛒', label: 'Einkauf', stage: 2, text: 'Hier kaufst du später Ware bei Lieferanten ein – mit Preis, Lieferzeit und Zuverlässigkeit.' },
  { id: 'orders', icon: '📋', label: 'Aufträge', stage: 3, text: 'Kundenaufträge mit Frist, Bonus und Vertragsstrafe erscheinen hier.' },
  { id: 'staff', icon: '👷', label: 'Personal', stage: 4, text: 'Mitarbeiter einstellen, Gehälter, Erfahrung und Motivation.' },
  { id: 'storage', icon: '📦', label: 'Lager', stage: 5, text: 'Lagerbestand, Lagerplatz und Ausbau.' },
  { id: 'finance', icon: '💶', label: 'Finanzen', stage: 4, text: 'Fixkosten, Kredite und Monatsbilanz.' },
  { id: 'upgrades', icon: '⭐', label: 'Upgrades', stage: 5, text: 'Upgrade-Baum und Firmenlevel.' },
];

const SPEED_LABELS: Record<GameSpeed, string> = { 0: '❚❚', 1: '1×', 2: '2×', 4: '4×' };

const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export class Hud {
  private readonly moneyEl: HTMLElement;
  private readonly levelEl: HTMLElement;
  private readonly dayEl: HTMLElement;
  private readonly clockEl: HTMLElement;
  private readonly speedButtons = new Map<GameSpeed, HTMLButtonElement>();
  private readonly panelEl: HTMLElement;
  private readonly menuEl: HTMLElement;
  private readonly toastEl: HTMLElement;
  private readonly navButtons = new Map<string, HTMLButtonElement>();
  private openPanelId: string | null = null;
  private toastTimer = 0;
  private last = { money: '', level: '', day: '', clock: '', speed: -1 };

  constructor(root: HTMLElement, private readonly actions: HudActions) {
    root.innerHTML = `
      <header class="topbar">
        <div class="chip chip-money" title="Kontostand"><span class="chip-icon">💰</span><span data-ref="money"></span></div>
        <div class="chip chip-level" title="Firmenlevel"><span class="chip-icon">🏠</span><span data-ref="level"></span></div>
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
    this.dayEl = ref('day');
    this.clockEl = ref('clock');
    this.panelEl = ref('panel');
    this.menuEl = ref('menu');
    this.toastEl = ref('toast');

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

  /** Wird jedes Frame aufgerufen; schreibt nur bei Änderungen ins DOM. */
  update(state: Readonly<GameState>): void {
    const time = toGameTime(state.minutes);
    this.set('money', this.moneyEl, money.format(state.money));
    this.set('level', this.levelEl, `Lv ${state.companyLevel} · ${companyLevelName(state.companyLevel)}`);
    this.set('day', this.dayEl, `Tag ${time.day}`);
    this.set('clock', this.clockEl, formatClock(time));
    if (this.last.speed !== state.speed) {
      this.last.speed = state.speed;
      for (const [speed, btn] of this.speedButtons) btn.classList.toggle('active', speed === state.speed);
    }
  }

  toast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.hidden = false;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => (this.toastEl.hidden = true), 1800);
  }

  private set(key: 'money' | 'level' | 'day' | 'clock', el: HTMLElement, value: string): void {
    if (this.last[key] === value) return;
    this.last[key] = value;
    el.textContent = value;
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
    this.panelEl.querySelector('[data-ref="panelBody"]')!.innerHTML = `
      <p class="placeholder">${def.text}</p>
      <p class="placeholder-note">Kommt in Stufe ${def.stage}.</p>`;
    this.panelEl.hidden = false;
  }

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
