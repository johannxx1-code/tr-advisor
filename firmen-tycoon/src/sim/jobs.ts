// Kundenaufträge: Angebote, Annahme, Touren des Firmenwagens, Abschluss mit Bonus/Strafe und Ruf.
// Alles läuft minutengenau über update(), damit es auch beim Nachrechnen (Offline) stimmt.

import { getArticle } from './catalog';
import { dayOf, MINUTES_PER_DAY } from './clock';
import { marketPrice } from './market';
import { addMessage } from './messages';
import { nextRandom, round2 } from './random';
import type { GameState, Job, JobOffer, JobResult } from './state';
import type { ActionResult } from './trade';

/** Lagerplätze pro Tour im Firmenwagen. */
export const VAN_SLOTS = 40;
export const LOAD_BASE_MIN = 60;
export const LOAD_PER_UNIT_MIN = 3;
export const UNLOAD_MIN = 30;
/** Touren starten nur in der Betriebszeit (Stunde, inklusive … exklusive). */
export const OPEN_HOUR = 6;
export const CLOSE_HOUR = 18;
export const MAX_ACTIVE_JOBS = 3;
export const BONUS_RATE = 0.1;
export const LATE_RATE_PER_DAY = 0.05;
export const LATE_RATE_MAX = 0.3;
export const CANCEL_RATE = 0.3;
export const REP_ON_TIME = 4;
export const REP_LATE_PER_DAY = 3;
export const REP_LATE_MAX = 15;
export const REP_CANCEL = 8;
const MAX_COMPLETED = 15;

const CUSTOMERS = [
  'Hausmeisterservice Krüger', 'Gartenbau Petersen', 'Schule am Park', 'Handwerksbetrieb Yilmaz',
  'Kita Sonnenschein', 'Ferienpark Seeblick', 'Elektro Brandt', 'Wohnbau Genossenschaft Nord',
  'Sportverein Eintracht', 'Pension Waldblick', 'Malerbetrieb Schulze', 'Stadtwerke Kleinstadt',
  'Autohaus Becker', 'Gemeinde Lindenau', 'Tischlerei Hoffmann', 'Hotel am Markt',
];

const euro = (v: number) => `${v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const fail = (error: string): ActionResult => ({ ok: false, error });

export function hourOf(minutes: number): number {
  return Math.floor((minutes % MINUTES_PER_DAY) / 60);
}

/** Stück pro voller Tour für einen Artikel. */
export function unitsPerTour(articleId: string): number {
  return Math.max(1, Math.floor(VAN_SLOTS / getArticle(articleId).slots));
}

export function remainingToLoad(job: Job): number {
  return job.qty - job.delivered - job.inTransit;
}

export function jobValue(job: { qty: number; unitPrice: number }): number {
  return round2(job.qty * job.unitPrice);
}

/** Stück, die laufende Aufträge noch aus dem Lager brauchen. */
export function demandFor(state: Readonly<GameState>, articleId: string): number {
  return state.jobs.filter((j) => j.articleId === articleId).reduce((n, j) => n + remainingToLoad(j), 0);
}

// ---------------------------------------------------------------- Angebote

/** Wie viele Angebote gleichzeitig offen sein sollen (2 … 4, steigt mit Ruf). */
function targetOfferCount(reputation: number): number {
  return 2 + Math.floor(reputation / 40);
}

function createOffer(state: GameState): JobOffer | null {
  if (state.unlocked.length === 0) return null;
  const day = dayOf(state.minutes);
  const rep = state.reputation;
  const articleId = state.unlocked[Math.floor(nextRandom(state) * state.unlocked.length)];
  const article = getArticle(articleId);
  // Menge: 20 … 200 Lagerplätze, größer bei gutem Ruf
  const baseSlots = 20 + rep * 1.6;
  const slots = baseSlots * (0.6 + nextRandom(state) * 0.8);
  const qty = Math.max(5, Math.min(200, Math.round(slots / article.slots / 5) * 5));
  // Preis: 5 … 20 % über Markt, Ruf verschiebt um bis zu ±10 %
  const premium = 1.05 + nextRandom(state) * 0.15 + (rep - 50) / 500;
  const unitPrice = round2(marketPrice(state, articleId) * premium);
  const distance = 60 + Math.floor(nextRandom(state) * 13) * 15; // 1 … 4 Std.
  const tours = Math.ceil(qty / unitsPerTour(articleId));
  const tourHours = (LOAD_BASE_MIN + LOAD_PER_UNIT_MIN * unitsPerTour(articleId) + UNLOAD_MIN + 2 * distance) / 60;
  // Frist: Zeit für alle Touren (12 Std. Betrieb pro Tag) plus 2 … 4 Tage Puffer
  const deadlineDays = Math.ceil((tours * tourHours) / 12) + 2 + Math.floor(nextRandom(state) * 3);
  return {
    id: state.nextJobId++,
    customer: CUSTOMERS[Math.floor(nextRandom(state) * CUSTOMERS.length)],
    articleId,
    qty,
    unitPrice,
    deadlineDays,
    distance,
    expiresDay: day + 1 + Math.floor(nextRandom(state) * 2),
  };
}

/** Abgelaufene Angebote entfernen und bis zur Zielanzahl auffüllen. */
export function refreshOffers(state: GameState): void {
  const day = dayOf(state.minutes);
  state.offers = state.offers.filter((o) => o.expiresDay >= day);
  const target = targetOfferCount(state.reputation);
  let added = 0;
  while (state.offers.length < target) {
    const offer = createOffer(state);
    if (!offer) break;
    state.offers.push(offer);
    added++;
  }
  if (added > 0) {
    addMessage(state, {
      kind: 'offer',
      title: added === 1 ? 'Neues Auftragsangebot' : `${added} neue Auftragsangebote`,
      text: state.offers.slice(-added).map((o) => `${o.qty}× ${getArticle(o.articleId).name} für ${o.customer}`).join(' · '),
      target: { panel: 'orders' },
    });
  }
}

// ---------------------------------------------------------------- Aktionen

export function acceptOffer(state: GameState, offerId: number): ActionResult {
  const offer = state.offers.find((o) => o.id === offerId);
  if (!offer) return fail('Angebot ist nicht mehr verfügbar.');
  if (state.jobs.length >= MAX_ACTIVE_JOBS) return fail(`Höchstens ${MAX_ACTIVE_JOBS} Aufträge gleichzeitig.`);
  const deadlineDay = dayOf(state.minutes) + offer.deadlineDays;
  state.offers = state.offers.filter((o) => o.id !== offerId);
  state.jobs.push({
    id: offer.id,
    customer: offer.customer,
    articleId: offer.articleId,
    qty: offer.qty,
    unitPrice: offer.unitPrice,
    distance: offer.distance,
    acceptedAt: state.minutes,
    deadline: deadlineDay * MINUTES_PER_DAY, // Ende des Fristtags
    delivered: 0,
    inTransit: 0,
    paid: 0,
    cancelled: false,
    cancelPenalty: 0,
    blockedNotified: false,
    lateNotified: false,
  });
  return { ok: true, message: `Auftrag angenommen: ${offer.qty}× ${getArticle(offer.articleId).name} bis Tag ${deadlineDay}` };
}

export function declineOffer(state: GameState, offerId: number): ActionResult {
  if (!state.offers.some((o) => o.id === offerId)) return fail('Angebot ist nicht mehr verfügbar.');
  state.offers = state.offers.filter((o) => o.id !== offerId);
  return { ok: true, message: 'Angebot abgelehnt' };
}

export function cancelJob(state: GameState, jobId: number): ActionResult {
  const job = state.jobs.find((j) => j.id === jobId);
  if (!job || job.cancelled) return fail('Auftrag nicht gefunden.');
  const open = remainingToLoad(job);
  const penalty = round2(open * job.unitPrice * CANCEL_RATE);
  state.money = round2(state.money - penalty);
  changeReputation(state, -REP_CANCEL);
  job.cancelled = true;
  job.qty = job.delivered + job.inTransit;
  // Läuft gerade eine Tour, wird sie noch abgeliefert und bezahlt; danach endet der Auftrag.
  job.cancelPenalty = penalty;
  if (job.inTransit === 0) finishJob(state, job);
  return { ok: true, message: `Auftrag abgebrochen – Strafe ${euro(penalty)}, Ruf −${REP_CANCEL}` };
}

export function setMinStock(state: GameState, articleId: string, value: number): void {
  const v = Math.max(0, Math.min(999, Math.round(value)));
  if (v === 0) delete state.minStock[articleId];
  else state.minStock[articleId] = v;
  delete state.stockAlerted[articleId];
}

function changeReputation(state: GameState, delta: number): void {
  state.reputation = Math.max(0, Math.min(100, state.reputation + delta));
}

// ---------------------------------------------------------------- Ablauf

export interface TourEvent {
  type: 'loading' | 'outbound' | 'unloaded' | 'returned';
  jobId: number | null;
}

/** Fortschritt bis zur aktuellen Spielminute. Gibt Tour-Ereignisse zurück (für Animation/Hinweise). */
export function updateJobs(state: GameState): TourEvent[] {
  const events: TourEvent[] = [];
  const now = state.minutes;
  const van = state.van;
  // Mehrere Phasenwechsel in einem Schritt möglich (z. B. beim Nachrechnen)
  for (let guard = 0; guard < 8; guard++) {
    if (van.phase === 'idle') {
      if (!startTour(state)) break;
      events.push({ type: 'loading', jobId: van.jobId });
      continue;
    }
    if (now < van.phaseEnd) break;
    const job = state.jobs.find((j) => j.id === van.jobId);
    const t = van.phaseEnd;
    switch (van.phase) {
      case 'loading':
        setPhase(state, 'outbound', t, job?.distance ?? 60);
        events.push({ type: 'outbound', jobId: van.jobId });
        break;
      case 'outbound':
        setPhase(state, 'unloading', t, UNLOAD_MIN);
        break;
      case 'unloading':
        if (job) deliverLoad(state, job, van.load);
        events.push({ type: 'unloaded', jobId: van.jobId });
        setPhase(state, 'returning', t, job?.distance ?? 60);
        break;
      case 'returning':
        van.phase = 'idle';
        van.jobId = null;
        van.load = 0;
        van.phaseStart = t;
        van.phaseEnd = t;
        events.push({ type: 'returned', jobId: null });
        break;
    }
  }
  checkStock(state);
  return events;
}

function setPhase(state: GameState, phase: Exclude<GameState['van']['phase'], 'idle'>, start: number, duration: number): void {
  state.van.phase = phase;
  state.van.phaseStart = start;
  state.van.phaseEnd = start + duration;
}

/** Nächste Tour starten, wenn Betriebszeit ist und ein Auftrag genug Bestand für eine Tour hat. */
function startTour(state: GameState): boolean {
  const hour = hourOf(state.minutes);
  if (hour < OPEN_HOUR || hour >= CLOSE_HOUR) return false;
  const open = state.jobs.filter((j) => !j.cancelled && remainingToLoad(j) > 0).sort((a, b) => a.deadline - b.deadline);
  for (const job of open) {
    const need = Math.min(remainingToLoad(job), unitsPerTour(job.articleId));
    const stock = state.inventory[job.articleId] ?? 0;
    if (stock < need) {
      if (!job.blockedNotified) {
        job.blockedNotified = true;
        addMessage(state, {
          kind: 'blocked',
          title: `Touren pausiert: ${job.customer}`,
          text: `Nächste Tour braucht ${need}× ${getArticle(job.articleId).name}, im Lager sind ${stock}. Nachbestellen, dann geht es automatisch weiter.`,
          target: { panel: 'trade', articleId: job.articleId },
        });
      }
      continue;
    }
    job.blockedNotified = false;
    state.inventory[job.articleId] = stock - need;
    if (state.inventory[job.articleId] === 0) delete state.inventory[job.articleId];
    job.inTransit += need;
    state.van.jobId = job.id;
    state.van.load = need;
    setPhase(state, 'loading', state.minutes, LOAD_BASE_MIN + LOAD_PER_UNIT_MIN * need);
    return true;
  }
  return false;
}

function deliverLoad(state: GameState, job: Job, load: number): void {
  const pay = round2(load * job.unitPrice);
  job.inTransit -= load;
  job.delivered += load;
  job.paid = round2(job.paid + pay);
  state.money = round2(state.money + pay);
  if (job.delivered >= job.qty) finishJob(state, job);
}

function finishJob(state: GameState, job: Job): void {
  const name = getArticle(job.articleId).name;
  let bonus = 0;
  let penalty = job.cancelPenalty;
  let repDelta = job.cancelled ? -REP_CANCEL : 0;
  let outcome: JobResult['outcome'] = 'cancelled';
  if (!job.cancelled) {
    const daysLate = Math.max(0, Math.ceil((state.minutes - job.deadline) / MINUTES_PER_DAY));
    if (daysLate === 0) {
      outcome = 'onTime';
      bonus = round2(jobValue(job) * BONUS_RATE);
      repDelta = REP_ON_TIME;
    } else {
      outcome = 'late';
      penalty = round2(jobValue(job) * Math.min(LATE_RATE_MAX, LATE_RATE_PER_DAY * daysLate));
      repDelta = -Math.min(REP_LATE_MAX, REP_LATE_PER_DAY * daysLate);
    }
    state.money = round2(state.money + bonus - penalty);
    changeReputation(state, repDelta);
  }
  state.jobs = state.jobs.filter((j) => j.id !== job.id);
  state.completedJobs.unshift({
    id: job.id, customer: job.customer, articleId: job.articleId, qty: job.qty, delivered: job.delivered,
    revenue: job.paid, bonus, penalty, reputationDelta: repDelta, finishedAt: state.minutes, outcome,
  });
  if (state.completedJobs.length > MAX_COMPLETED) state.completedJobs.length = MAX_COMPLETED;

  const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  if (outcome === 'cancelled') {
    addMessage(state, {
      kind: 'cancelled',
      title: `Auftrag ${job.customer} beendet (abgebrochen)`,
      text: `${job.delivered}× ${name} geliefert · ${euro(job.paid)} · Strafe ${euro(penalty)}`,
      target: { panel: 'orders' },
    });
  } else {
    addMessage(state, {
      kind: 'done',
      title: `Auftrag ${job.customer} fertig${outcome === 'late' ? ' (verspätet)' : ''}`,
      text: `${job.qty}× ${name} geliefert · ${euro(job.paid)}${bonus ? ` + ${euro(bonus)} Bonus` : ''}${penalty ? ` − ${euro(penalty)} Strafe` : ''} · Ruf ${sign(repDelta)}`,
      target: { panel: 'orders' },
    });
  }
}

/** Einmal täglich: überfällige Aufträge melden. */
export function checkDeadlines(state: GameState): void {
  for (const job of state.jobs) {
    if (!job.cancelled && !job.lateNotified && state.minutes > job.deadline) {
      job.lateNotified = true;
      addMessage(state, {
        kind: 'late',
        title: `Auftrag ${job.customer} ist überfällig`,
        text: `Noch ${job.qty - job.delivered} von ${job.qty} offen. Pro Tag Verspätung −5 % und Ruf −3.`,
        target: { panel: 'orders' },
      });
    }
  }
}

/** Eigene Mindestmengen prüfen; jede Warnung nur einmal, bis wieder genug da ist. */
function checkStock(state: GameState): void {
  for (const [articleId, min] of Object.entries(state.minStock)) {
    const stock = state.inventory[articleId] ?? 0;
    if (stock < min && !state.stockAlerted[articleId]) {
      state.stockAlerted[articleId] = true;
      addMessage(state, {
        kind: 'stock',
        title: `Bestand knapp: ${getArticle(articleId).name}`,
        text: `Noch ${stock} Stück, Mindestmenge ${min}.`,
        target: { panel: 'trade', articleId },
      });
    } else if (stock >= min && state.stockAlerted[articleId]) {
      delete state.stockAlerted[articleId];
    }
  }
}
