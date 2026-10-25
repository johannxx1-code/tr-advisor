// Panel „Personal“ (vorläufig): Aushilfe und Fuhrpark. Volles Personal-System folgt in Stufe 4.

import { getArticle } from '../sim/catalog';
import { formatClock, toGameTime } from '../sim/clock';
import type { GameState } from '../sim/state';
import { HELPER_RATE, HELPER_WAGE, MAX_VANS, VAN_DAILY_COST, VAN_PRICE } from '../sim/work';

const euroWhole = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

const PHASE_LABEL = { idle: 'auf dem Hof', loading: 'verlädt', outbound: 'fährt zum Kunden', unloading: 'lädt ab', returning: 'auf der Rückfahrt' } as const;

export function renderStaff(state: Readonly<GameState>): string {
  const helper = state.helper
    ? `<div class="row">
        <span class="row-main"><b>Aushilfe</b><small>Verladen & Einräumen ×${HELPER_RATE} · ${euroWhole.format(HELPER_WAGE)}/Tag (morgens)</small></span>
        <span class="pill ok">da</span>
        <button class="btn ghost" data-act="fire">Entlassen</button>
      </div>`
    : `<div class="row">
        <span class="row-main"><b>Aushilfe</b><small>Verladen & Einräumen ×${HELPER_RATE}, auch im Hintergrund · ${euroWhole.format(HELPER_WAGE)}/Tag</small></span>
        <button class="btn" data-act="hire" ${state.money < HELPER_WAGE ? 'disabled' : ''}>Einstellen</button>
      </div>`;

  const vans = state.vans.map((v) => {
    const job = v.jobId !== null ? state.jobs.find((j) => j.id === v.jobId) : undefined;
    const detail = v.phase === 'idle' ? 'bereit' : `${job ? `${job.customer} · ${v.load}× ${getArticle(job.articleId).name}` : ''} · bis ${formatClock(toGameTime(v.phaseEnd))}`;
    return `<div class="row">
      <span class="row-main"><b>Firmenwagen ${v.id}</b><small>${PHASE_LABEL[v.phase]} · ${detail}</small></span>
      <span class="pill ${v.phase === 'idle' ? 'warn' : 'ok'}">${v.phase === 'idle' ? 'frei' : 'aktiv'}</span>
    </div>`;
  });
  const buy = state.vans.length < MAX_VANS
    ? `<div class="row">
        <span class="row-main"><b>Firmenwagen ${state.vans.length + 1} kaufen</b><small>Zwei Touren gleichzeitig · Unterhalt ${euroWhole.format(VAN_DAILY_COST)}/Tag</small></span>
        <button class="btn" data-act="buyvan" ${state.money < VAN_PRICE ? 'disabled' : ''}>${euroWhole.format(VAN_PRICE)}</button>
      </div>`
    : '<p class="hint">Mehr Wagen gibt es mit größeren Firmenleveln (Stufe 5).</p>';

  return `
    <h3 class="sub">Team</h3>
    <div class="list">${helper}</div>
    <h3 class="sub">Fuhrpark</h3>
    <div class="list">${vans.join('')}${buy}</div>
    <p class="hint">Volles Personal mit Gehalt, Erfahrung und Motivation folgt in Stufe 4.</p>`;
}
