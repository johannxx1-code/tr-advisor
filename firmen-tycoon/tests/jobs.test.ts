import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY } from '../src/sim/clock';
import { CLOSE_HOUR, hourOf, OPEN_HOUR, VAN_SLOTS } from '../src/sim/jobs';
import { Simulation } from '../src/sim/simulation';
import { createInitialState, type GameState, type JobOffer } from '../src/sim/state';

/** Simulation mit einem festen Angebot (Akkuschrauber), viel Geld, Lager und Bestand. */
function setup(opts: { qty?: number; stock?: number; deadlineDays?: number; distance?: number } = {}) {
  const state = createInitialState(7);
  state.money = 50_000;
  state.shelves = 9;
  state.inventory = { akkuschrauber: opts.stock ?? 200 };
  const offer: JobOffer = {
    id: 999, customer: 'Testkunde', articleId: 'akkuschrauber', qty: opts.qty ?? 100, unitPrice: 100,
    deadlineDays: opts.deadlineDays ?? 5, distance: opts.distance ?? 60, expiresDay: 99,
  };
  state.offers = [offer];
  const sim = new Simulation(state);
  return { sim, state: sim.state as GameState, offer };
}
const hours = (sim: Simulation, h: number) => sim.advanceMinutes(h * 60);

describe('Aufträge und Touren', () => {
  it('Angebote entstehen nur für freigeschaltete Artikel', () => {
    const sim = new Simulation(createInitialState(1));
    expect(sim.state.offers.length).toBeGreaterThanOrEqual(2);
    for (const o of sim.state.offers) expect(sim.state.unlocked).toContain(o.articleId);
  });

  it('liefert in Touren à 40 Stück, bezahlt pro Tour und gibt Bonus bei Pünktlichkeit', () => {
    const { sim, state } = setup({ qty: 100 });
    const money = state.money;
    expect(sim.acceptOffer(999).ok).toBe(true);
    expect(state.vans[0].phase).toBe('loading'); // 08:00 = Betriebszeit
    expect(state.vans[0].load).toBe(VAN_SLOTS);
    expect(state.inventory.akkuschrauber).toBe(160);

    const messages: string[] = [];
    sim.on('message', (m) => messages.push(m.kind));
    hours(sim, 72);
    expect(state.jobs).toHaveLength(0);
    const result = state.completedJobs[0];
    expect(result.outcome).toBe('onTime');
    expect(result.delivered).toBe(100);
    expect(state.money).toBeCloseTo(money + 100 * 100 + 1000, 2); // Erlös + 10 % Bonus
    expect(state.reputation).toBe(54);
    expect(messages).toContain('done');
    expect(state.vans[0].phase).toBe('idle');
  });

  it('Touren starten nur in der Betriebszeit', () => {
    const { sim, state } = setup({ qty: 200, stock: 300, distance: 240 });
    sim.acceptOffer(999);
    for (let i = 0; i < 3 * 24 * 12; i++) {
      const before = state.vans[0].phase;
      sim.advanceMinutes(5);
      if (before === 'idle' && state.vans[0].phase === 'loading') {
        const h = hourOf(state.vans[0].phaseStart);
        expect(h).toBeGreaterThanOrEqual(OPEN_HOUR);
        expect(h).toBeLessThan(CLOSE_HOUR);
      }
    }
  });

  it('pausiert und meldet einmal, wenn der Bestand für die nächste Tour fehlt', () => {
    const { sim, state } = setup({ qty: 100, stock: 50 });
    const blocked: string[] = [];
    sim.on('message', (m) => { if (m.kind === 'blocked') blocked.push(m.title); });
    sim.acceptOffer(999); // Tour 1: 40 Stk, danach 10 im Lager < 40
    hours(sim, 48);
    expect(state.jobs[0].delivered).toBe(40);
    expect(blocked).toHaveLength(1);
    // Nachschub → läuft automatisch weiter
    state.inventory.akkuschrauber = 100;
    hours(sim, 48);
    expect(state.jobs).toHaveLength(0);
  });

  it('Verspätung kostet Strafe und Ruf', () => {
    const { sim, state } = setup({ qty: 40, stock: 0, deadlineDays: 1 });
    sim.acceptOffer(999);
    hours(sim, 24 * 3); // Frist verpasst, nichts auf Lager
    expect(state.messages.some((m) => m.kind === 'late')).toBe(true);
    state.inventory.akkuschrauber = 40;
    hours(sim, 24);
    const r = state.completedJobs[0];
    expect(r.outcome).toBe('late');
    expect(r.penalty).toBeGreaterThan(0);
    expect(state.reputation).toBeLessThan(50);
  });

  it('Abbruch: Strafe auf Restwert, laufende Tour wird noch bezahlt', () => {
    const { sim, state } = setup({ qty: 100 });
    sim.acceptOffer(999); // 40 Stk werden verladen
    const money = state.money;
    expect(sim.cancelJob(999).ok).toBe(true);
    expect(state.money).toBeCloseTo(money - 60 * 100 * 0.3, 2);
    hours(sim, 24);
    expect(state.jobs).toHaveLength(0);
    expect(state.completedJobs[0].outcome).toBe('cancelled');
    expect(state.completedJobs[0].delivered).toBe(40);
    expect(state.reputation).toBe(42);
  });

  it('eigene Mindestmenge meldet einmal, bis wieder aufgefüllt', () => {
    const { sim, state } = setup({ stock: 30 });
    const stock: string[] = [];
    sim.on('message', (m) => { if (m.kind === 'stock') stock.push(m.title); });
    sim.setMinStock('akkuschrauber', 25);
    sim.sell('akkuschrauber', 10); // 20 < 25 → Meldung
    sim.sell('akkuschrauber', 5);  // weiterhin knapp → keine zweite Meldung
    expect(stock).toHaveLength(1);
    state.inventory.akkuschrauber = 40;
    sim.advanceMinutes(5);
    sim.sell('akkuschrauber', 20);
    expect(stock).toHaveLength(2);
  });

  it('Nachrechnen über mehrere Tage ergibt dasselbe wie kleine Schritte', () => {
    const a = setup({ qty: 150, stock: 200, distance: 120 });
    const b = setup({ qty: 150, stock: 200, distance: 120 });
    a.sim.acceptOffer(999);
    b.sim.acceptOffer(999);
    a.sim.advanceMinutes(4 * MINUTES_PER_DAY);
    for (let i = 0; i < 4 * MINUTES_PER_DAY; i += 1) b.sim.advanceMinutes(1);
    expect(a.state.money).toBeCloseTo(b.state.money, 2);
    expect(a.state.completedJobs).toEqual(b.state.completedJobs);
  });
});
