// Panels „Aufträge“ und „Meldungen“ sowie die Zusammenfassung nach dem Nachrechnen.

import { getArticle } from '../sim/catalog';
import { dayOf, formatClock, MINUTES_PER_DAY, toGameTime } from '../sim/clock';
import {
  BONUS_RATE, CANCEL_RATE, jobValue, MAX_ACTIVE_JOBS, remainingToLoad, unitsPerTour,
} from '../sim/jobs';
import type { GameMessage, GameState, Job, VanPhase } from '../sim/state';

export type OrdersTab = 'offers' | 'active' | 'done';

const euroFmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const euroWhole = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const euro = (v: number) => euroFmt.format(v);

const ICONS: Record<GameMessage['kind'], string> = {
  done: '✅', stock: '⚠️', blocked: '⏸️', late: '⏰', delivery: '🚚', delay: '🐢', offer: '📋', cancelled: '✖️',
};

function hoursText(minutes: number): string {
  const h = minutes / 60;
  return `${h.toLocaleString('de-DE', { maximumFractionDigits: 1 })} Std.`;
}

/** „Tag 5, 14:30“ */
export function stamp(minutes: number): string {
  const t = toGameTime(minutes);
  return `Tag ${t.day}, ${formatClock(t)}`;
}

// ---------------------------------------------------------------- Aufträge

export function renderOrders(state: Readonly<GameState>, tab: OrdersTab): string {
  const tabs: [OrdersTab, string][] = [
    ['offers', `Angebote${state.offers.length ? ` (${state.offers.length})` : ''}`],
    ['active', `Laufend${state.jobs.length ? ` (${state.jobs.length})` : ''}`],
    ['done', 'Erledigt'],
  ];
  const bar = `<div class="tabs" role="tablist">${tabs
    .map(([id, label]) => `<button role="tab" data-act="otab" data-tab="${id}" class="${tab === id ? 'on' : ''}">${label}</button>`)
    .join('')}</div>
    <p class="rep-line">⭐ Ruf <b>${state.reputation}</b> / 100 <span class="muted">· mehr Ruf = größere Aufträge, bessere Preise</span></p>`;
  if (tab === 'offers') return bar + renderOffers(state);
  if (tab === 'active') return bar + renderActive(state);
  return bar + renderDone(state);
}

function renderOffers(state: Readonly<GameState>): string {
  if (state.offers.length === 0) return '<p class="empty">Gerade keine Angebote. Morgen früh kommen neue.</p>';
  const day = dayOf(state.minutes);
  const full = state.jobs.length >= MAX_ACTIVE_JOBS;
  const cards = state.offers.map((o) => {
    const a = getArticle(o.articleId);
    const stock = state.inventory[o.articleId] ?? 0;
    const tours = Math.ceil(o.qty / unitsPerTour(o.articleId));
    const toursCovered = stock >= o.qty ? tours : Math.floor(stock / unitsPerTour(o.articleId));
    const expires = o.expiresDay - day;
    return `<div class="card">
      <div class="card-top"><b>${o.customer}</b><b class="price">${euroWhole.format(jobValue(o))}</b></div>
      <div class="meta">
        <span>${o.qty}× ${a.name}</span><span>${euro(o.unitPrice)}/Stk</span>
        <span>Frist ${o.deadlineDays} Tage</span><span>🚚 ${hoursText(o.distance)}</span>
        <span>Bonus +${euroWhole.format(jobValue(o) * BONUS_RATE)}</span>
      </div>
      <div class="meta">
        <span>${tours} ${tours === 1 ? 'Tour' : 'Touren'} · Bestand ${stock}${stock < o.qty ? ` (reicht für ${toursCovered} von ${tours})` : ' (reicht)'}</span>
        <span>${expires <= 0 ? 'verfällt heute' : expires === 1 ? 'verfällt morgen' : `verfällt in ${expires} Tagen`}</span>
      </div>
      <div class="card-acts">
        <button class="btn" data-act="accept" data-id="${o.id}" ${full ? 'disabled' : ''}>Annehmen</button>
        <button class="btn ghost" data-act="decline" data-id="${o.id}">Ablehnen</button>
      </div>
    </div>`;
  });
  return `${full ? `<p class="warn-text">Höchstens ${MAX_ACTIVE_JOBS} Aufträge gleichzeitig.</p>` : ''}<div class="list">${cards.join('')}</div>`;
}

const PHASES: [VanPhase, string][] = [['loading', 'Verladen'], ['outbound', 'Hinfahrt'], ['unloading', 'Abladen'], ['returning', 'Rückfahrt']];

function vanSteps(state: Readonly<GameState>, job: Job): string {
  const van = state.van;
  if (van.jobId !== job.id || van.phase === 'idle') return '';
  const idx = PHASES.findIndex(([p]) => p === van.phase);
  const steps = PHASES.map(([, label], i) => `<span class="${i < idx ? 'done' : i === idx ? 'on' : ''}">${label}</span>`).join('');
  return `<div class="steps">${steps}</div>
    <small class="muted">${van.phase === 'returning' ? 'leer' : `${van.load} Stk an Bord`} · ${PHASES[idx][1]} bis ${formatClock(toGameTime(van.phaseEnd))}</small>`;
}

function renderActive(state: Readonly<GameState>): string {
  if (state.jobs.length === 0) return '<p class="empty">Keine laufenden Aufträge. Im Reiter „Angebote“ annehmen.</p>';
  const cards = [...state.jobs].sort((a, b) => a.deadline - b.deadline).map((job) => {
    const a = getArticle(job.articleId);
    const per = unitsPerTour(job.articleId);
    const tours = Math.ceil(job.qty / per);
    const tourNo = Math.min(tours, Math.ceil((job.delivered + job.inTransit) / per));
    const left = remainingToLoad(job);
    const stock = state.inventory[job.articleId] ?? 0;
    const need = Math.min(left, per);
    const blocked = left > 0 && stock < need;
    const daysLeft = Math.ceil((job.deadline - state.minutes) / MINUTES_PER_DAY);
    const late = state.minutes > job.deadline;
    const pct = (v: number) => (v / job.qty) * 100;
    return `<div class="card ${blocked ? 'warn' : ''}">
      <div class="card-top"><b>${job.customer}</b><b class="price">${job.delivered + job.inTransit} / ${job.qty}</b></div>
      <div class="prog"><i class="d" style="width:${pct(job.delivered)}%"></i><i class="t" style="width:${pct(job.inTransit)}%"></i></div>
      <div class="meta">
        <span>${a.name}</span><span>■ geliefert ${job.delivered}</span><span>■ unterwegs ${job.inTransit}</span>
        <span class="${late ? 'neg' : ''}">Frist Tag ${dayOf(job.deadline - 1)} (${late ? 'überfällig' : daysLeft <= 1 ? 'heute' : `noch ${daysLeft} Tage`})</span>
        <span>bezahlt ${euroWhole.format(job.paid)}</span>
      </div>
      ${job.cancelled ? '<small class="muted">Abgebrochen – letzte Tour wird noch abgeliefert.</small>' : `<small class="muted">Tour ${Math.max(1, tourNo)} von ${tours}</small>`}
      ${vanSteps(state, job)}
      ${blocked ? `<div class="alert">
          <span>⚠️ Nächste Tour braucht ${need}, im Lager ${stock}.</span>
          <button class="btn" data-act="restock" data-id="${job.articleId}">Nachbestellen</button>
        </div>` : ''}
      ${!job.cancelled && left > 0 ? `<div class="card-acts"><button class="btn ghost" data-act="cancel" data-id="${job.id}">Abbrechen (−${Math.round(CANCEL_RATE * 100)} % vom Rest)</button></div>` : ''}
    </div>`;
  });
  const van = state.van;
  const vanLine = van.phase === 'idle'
    ? '<p class="hint">🚚 Firmenwagen steht auf dem Hof. Touren starten zwischen 6 und 18 Uhr.</p>'
    : '';
  return `${vanLine}<div class="list">${cards.join('')}</div>`;
}

function renderDone(state: Readonly<GameState>): string {
  if (state.completedJobs.length === 0) return '<p class="empty">Noch keine abgeschlossenen Aufträge.</p>';
  const rows = state.completedJobs.map((r) => {
    const label = r.outcome === 'onTime' ? '<span class="pill ok">pünktlich</span>' : r.outcome === 'late' ? '<span class="pill warn">verspätet</span>' : '<span class="pill bad">abgebrochen</span>';
    const total = r.revenue + r.bonus - r.penalty;
    return `<div class="row">
      <span class="row-main"><b>${r.customer}</b>
        <small>${r.delivered}× ${getArticle(r.articleId).name} · ${stamp(r.finishedAt)} · Ruf ${r.reputationDelta >= 0 ? '+' : ''}${r.reputationDelta}</small></span>
      ${label}<b class="price">${euroWhole.format(total)}</b>
    </div>`;
  });
  return `<div class="list">${rows.join('')}</div>`;
}

// ---------------------------------------------------------------- Meldungen

export function renderMessages(state: Readonly<GameState>, unreadIds: ReadonlySet<number>): string {
  if (state.messages.length === 0) return '<p class="empty">Noch keine Meldungen.</p>';
  return `<div class="list">${state.messages.map((m) => messageRow(m, unreadIds.has(m.id))).join('')}</div>`;
}

export function messageRow(m: GameMessage, isNew: boolean): string {
  const tag = m.target ? 'button' : 'div';
  const attrs = m.target ? `data-act="goto" data-id="${m.id}"` : '';
  return `<${tag} class="row msg ${isNew ? 'new' : ''}" ${attrs}>
    <span class="msg-icon" aria-hidden="true">${ICONS[m.kind]}</span>
    <span class="row-main"><b>${m.title}</b><small>${m.text}</small><small>${stamp(m.at)}</small></span>
  </${tag}>`;
}

// ---------------------------------------------------------------- Zusammenfassung

export interface CatchUpSummary {
  minutes: number;
  messages: GameMessage[];
  newOffers: number;
  moneyDelta: number;
  reputationDelta: number;
}

export function renderSummary(s: CatchUpSummary): string {
  const d = Math.floor(s.minutes / MINUTES_PER_DAY);
  const h = Math.floor((s.minutes % MINUTES_PER_DAY) / 60);
  const m = Math.round(s.minutes % 60);
  const span = [d ? `${d} ${d === 1 ? 'Tag' : 'Tage'}` : '', h ? `${h} Std.` : '', !d && m ? `${m} Min.` : ''].filter(Boolean).join(' ');
  const sign = (v: number) => (v >= 0 ? '+' : '−');
  return `<h2>👋 Während du weg warst</h2>
    <p class="muted">${span} Spielzeit sind vergangen (Echtzeit).</p>
    <div class="list">${s.messages.slice(0, 8).map((msg) => messageRow(msg, false)).join('')}</div>
    ${s.messages.length > 8 ? `<p class="hint">… und ${s.messages.length - 8} weitere unter 🔔.</p>` : ''}
    ${s.newOffers ? `<p class="hint">📋 ${s.newOffers}× neue Auftragsangebote.</p>` : ''}
    <dl class="summary">
      <div class="total"><dt>Kontostand</dt><dd>${sign(s.moneyDelta)}${euro(Math.abs(s.moneyDelta))}</dd></div>
      <div><dt>Ruf</dt><dd>${sign(s.reputationDelta)}${Math.abs(s.reputationDelta)}</dd></div>
    </dl>
    <button class="btn primary wide" data-act="close-summary">Weiter spielen</button>`;
}
