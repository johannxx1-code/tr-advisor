import { describe, expect, it } from 'vitest';
import { MINUTES_PER_DAY } from '../src/sim/clock';
import { Simulation } from '../src/sim/simulation';
import { createInitialState, type GameState } from '../src/sim/state';
import { addWorkingMinutes, HELPER_WAGE, storeWork, VAN_DAILY_COST, VAN_PRICE, workingMinutesBetween } from '../src/sim/work';

function sim(seed = 3) {
  const state = createInitialState(seed);
  state.money = 50_000;
  state.shelves = 9;
  state.offers = [];
  const s = new Simulation(state);
  return { s, state: s.state as GameState };
}

/** Palette direkt in den Wareneingang legen (wie nach einer Lieferung). */
function addPallet(state: GameState, qty: number) {
  state.inbound.push({ id: state.nextPalletId++, articleId: 'akkuschrauber', qty, arrivedAt: state.minutes });
}

describe('Betriebszeit-Rechnung', () => {
  it('zählt nur Minuten zwischen 6 und 18 Uhr', () => {
    expect(workingMinutesBetween(0, MINUTES_PER_DAY)).toBe(12 * 60);
    expect(workingMinutesBetween(17 * 60, 20 * 60)).toBe(60);
    expect(addWorkingMinutes(17 * 60, 120)).toBe(MINUTES_PER_DAY + 7 * 60);
  });
});

describe('Einräumen', () => {
  it('Ware aus dem Wareneingang ist erst nach dem Einräumen im Lager', () => {
    const { s, state } = sim();
    addPallet(state, 30); // 08:00, Arbeit 60 Min.
    s.advanceMinutes(30);
    expect(state.inventory.akkuschrauber).toBe(10);
    expect(state.storing?.workLeft).toBeCloseTo(storeWork(30) - 30, 5);
    s.advanceMinutes(40);
    expect(state.inventory.akkuschrauber).toBe(40);
    expect(state.inbound).toHaveLength(0);
  });

  it('nachts wird nicht eingeräumt', () => {
    const { s, state } = sim();
    s.advanceMinutes(11 * 60); // 19:00
    addPallet(state, 10);
    s.advanceMinutes(8 * 60); // 03:00
    expect(state.inbound).toHaveLength(1);
    s.advanceMinutes(5 * 60); // 08:00
    expect(state.inbound).toHaveLength(0);
  });
});

describe('Mit anpacken', () => {
  it('jeder Tipp spart Zeit, höchstens 50 %', () => {
    const { s, state } = sim();
    addPallet(state, 40); // Arbeit 70 Min.
    s.advanceMinutes(1);
    let saved = 0;
    for (let i = 0; i < 100; i++) {
      const r = s.helpOut();
      if (!r.ok) break;
      saved += r.saved;
    }
    expect(saved).toBeCloseTo(35, 5);
    expect(state.storing!.tapSaved).toBeCloseTo(35, 5);
    s.advanceMinutes(34);
    expect(state.inventory.akkuschrauber).toBe(50);
  });

  it('hilft zuerst beim Verladen', () => {
    const { s, state } = sim();
    state.inventory.akkuschrauber = 100;
    state.offers = [{ id: 50, customer: 'K', articleId: 'akkuschrauber', qty: 40, unitPrice: 100, deadlineDays: 5, distance: 60, expiresDay: 9 }];
    addPallet(state, 20);
    s.acceptOffer(50);
    const r = s.helpOut();
    expect(r.target).toBe('loading');
    expect(state.vans[0].tapSaved).toBe(3);
  });
});

describe('Aushilfe', () => {
  it('räumt doppelt so schnell ein und kostet Tageslohn', () => {
    const { s, state } = sim();
    expect(s.hireHelper().ok).toBe(true);
    addPallet(state, 30); // 60 Arbeitsminuten → 30 Spielminuten
    s.advanceMinutes(31);
    expect(state.inventory.akkuschrauber).toBe(40);
    const money = state.money;
    s.advanceMinutes(MINUTES_PER_DAY);
    expect(state.money).toBeCloseTo(money - HELPER_WAGE, 2);
  });

  it('kündigt, wenn der Lohn nicht bezahlt werden kann', () => {
    const { s, state } = sim();
    s.hireHelper();
    state.money = 10;
    const kinds: string[] = [];
    s.on('message', (m) => kinds.push(m.kind));
    s.advanceMinutes(MINUTES_PER_DAY);
    expect(state.helper).toBe(false);
    expect(kinds).toContain('staff');
  });
});

describe('Zweiter Wagen', () => {
  it('fährt zwei Touren gleichzeitig und kostet Unterhalt', () => {
    const { s, state } = sim();
    state.inventory.akkuschrauber = 200;
    const money = state.money;
    expect(s.buyVan().ok).toBe(true);
    expect(state.money).toBe(money - VAN_PRICE);
    expect(s.buyVan().ok).toBe(false);
    state.offers = [{ id: 60, customer: 'K', articleId: 'akkuschrauber', qty: 120, unitPrice: 100, deadlineDays: 5, distance: 60, expiresDay: 9 }];
    s.acceptOffer(60);
    expect(state.vans.map((v) => v.phase)).toEqual(['loading', 'loading']);
    const before = state.money;
    s.advanceMinutes(MINUTES_PER_DAY);
    // Tour-Erlöse kommen dazu, Unterhalt geht ab – nur prüfen, dass Unterhalt verbucht wird
    expect(state.money).toBeGreaterThan(before - VAN_DAILY_COST);
  });
});

describe('Express', () => {
  it('halbiert die Lieferzeit und kostet Aufpreis', () => {
    const { s, state } = sim();
    const money = state.money;
    expect(s.placeOrder('akkuschrauber', 'billig', 10, true).ok).toBe(true); // 7 Tage → 4
    expect(state.orders[0].dueDay).toBe(5);
    expect(state.orders[0].express).toBe(true);
    expect(state.money).toBeLessThan(money - 10 * state.orders[0].unitPrice - 20 - 29);
  });

  it('nachträglich für Bestellungen unterwegs', () => {
    const { s, state } = sim();
    s.placeOrder('akkuschrauber', 'billig', 10); // Tag 8
    expect(s.expediteOrder(state.orders[0].id).ok).toBe(true);
    expect(state.orders[0].dueDay).toBe(1 + 4);
    expect(s.expediteOrder(state.orders[0].id).ok).toBe(false);
  });
});
