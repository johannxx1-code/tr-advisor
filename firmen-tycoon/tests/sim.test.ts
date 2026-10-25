import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { monthOf, seasonOf, yearOf } from '../src/sim/calendar';
import { MINUTES_PER_DAY } from '../src/sim/clock';
import { bidPrice, marketPrice, saleRevenue } from '../src/sim/market';
import { Simulation } from '../src/sim/simulation';
import { createInitialState } from '../src/sim/state';
import { capacity, freeSlots, maxShelves, usedSlots } from '../src/sim/storage';
import { supplierOffers } from '../src/sim/trade';
import { migrate } from '../src/persistence/save';

const SEED = 12345;
const newSim = () => new Simulation(createInitialState(SEED));
const advanceDays = (sim: Simulation, days: number) => sim.advanceMinutes(days * MINUTES_PER_DAY);

describe('Architektur', () => {
  it('src/sim nutzt weder Three.js noch Browser-APIs', () => {
    const dir = join(__dirname, '../src/sim');
    for (const file of readdirSync(dir)) {
      const code = readFileSync(join(dir, file), 'utf8');
      expect(code, file).not.toMatch(/from ['"]three['"]|\bdocument\.|\bwindow\.|localStorage/);
    }
  });
});

describe('Kalender', () => {
  it('beginnt im März (Frühling), 10 Tage pro Monat', () => {
    expect(monthOf(1)).toBe(2);
    expect(seasonOf(monthOf(1))).toBe('Frühling');
    expect(monthOf(11)).toBe(3);
    expect(monthOf(101)).toBe(0); // Januar im 2. Jahr
    expect(yearOf(101)).toBe(2);
  });
});

describe('Start', () => {
  it('1 Artikel freigeschaltet, 2 Regale, Startbestand', () => {
    const s = createInitialState(SEED);
    expect(s.unlocked).toEqual(['akkuschrauber']);
    expect(capacity(s)).toBe(40);
    expect(usedSlots(s)).toBe(10);
  });
});

describe('Markt', () => {
  it('Ankaufpreis sinkt mit Verkaufsdruck und erholt sich über Nacht', () => {
    const sim = newSim();
    const before = bidPrice(sim.state, 'akkuschrauber');
    expect(sim.sell('akkuschrauber', 10).ok).toBe(true);
    const after = bidPrice(sim.state, 'akkuschrauber');
    expect(after).toBeLessThan(before);
    advanceDays(sim, 3);
    const ratio = bidPrice(sim.state, 'akkuschrauber') / marketPrice(sim.state, 'akkuschrauber');
    expect(ratio).toBeGreaterThan(after / before);
  });

  it('Verkauf bringt den berechneten Erlös', () => {
    const sim = newSim();
    const expected = saleRevenue(sim.state, 'akkuschrauber', 5);
    const money = sim.state.money;
    sim.sell('akkuschrauber', 5);
    expect(sim.state.money).toBeCloseTo(money + expected, 2);
    expect(sim.state.inventory.akkuschrauber).toBe(5);
  });

  it('kann nicht mehr verkaufen als auf Lager', () => {
    expect(newSim().sell('akkuschrauber', 11).ok).toBe(false);
  });
});

describe('Einkauf und Lieferung', () => {
  it('Bestellung kostet Geld, reserviert Platz und kommt an', () => {
    const sim = newSim();
    const offer = supplierOffers(sim.state, 'akkuschrauber').find((o) => o.supplier.id === 'nord')!;
    const money = sim.state.money;
    const res = sim.placeOrder('akkuschrauber', 'nord', 20);
    expect(res.ok).toBe(true);
    expect(sim.state.money).toBeCloseTo(money - offer.unitPrice * 20 - offer.supplier.shippingFee, 2);
    expect(freeSlots(sim.state)).toBe(40 - 10 - 20);

    advanceDays(sim, 10); // genug für Lieferzeit + mögliche Verspätung
    expect(sim.state.orders).toHaveLength(0);
    const stock = sim.state.inventory.akkuschrauber;
    expect(stock).toBeGreaterThan(10);
    expect(stock).toBeLessThanOrEqual(30);
  });

  it('Teillieferung wird erstattet (Geld + Ware bleiben konsistent)', () => {
    // Viele Bestellungen beim unzuverlässigsten Lieferanten: jede Lieferung erstattet genau die Fehlmenge.
    for (let seed = 1; seed <= 30; seed++) {
      const sim = new Simulation(createInitialState(seed));
      const reports: { delivered: number; refund: number; qty: number; unit: number }[] = [];
      sim.on('delivery', (r) => {
        if (r.delayedUntil === undefined) reports.push({ delivered: r.delivered, refund: r.refund, qty: r.order.qty, unit: r.order.unitPrice });
      });
      sim.placeOrder('akkuschrauber', 'billig', 10);
      advanceDays(sim, 12);
      for (const r of reports) expect(r.refund).toBeCloseTo((r.qty - r.delivered) * r.unit, 2);
    }
  });

  it('lehnt Bestellung ab bei zu wenig Platz, Geld oder gesperrtem Artikel', () => {
    const sim = newSim();
    expect(sim.placeOrder('akkuschrauber', 'nord', 31).ok).toBe(false); // 30 freie Plätze
    expect(sim.placeOrder('rasenmaeher', 'nord', 1).ok).toBe(false); // gesperrt
    expect(sim.placeOrder('akkuschrauber', 'garten', 1).ok).toBe(false); // führt keine Werkzeuge
  });

  it('Freischalten kostet Gebühr und erlaubt Bestellung', () => {
    const sim = newSim();
    expect(sim.unlockArticle('led').ok).toBe(true);
    expect(sim.state.money).toBe(5000 - 250);
    expect(sim.placeOrder('led', 'nord', 5).ok).toBe(true);
  });
});

describe('Lagerausbau', () => {
  it('erst Regale bis zur Grenze, dann Anbau', () => {
    const sim = newSim();
    (sim.state as { money: number }).money = 100000;
    expect(sim.buildExtension().ok).toBe(false); // Garage noch nicht voll
    while (sim.state.shelves < maxShelves(0)) expect(sim.buyShelf().ok).toBe(true);
    expect(sim.buyShelf().ok).toBe(false);
    expect(sim.buildExtension().ok).toBe(true);
    expect(sim.buyShelf().ok).toBe(true);
    expect(capacity(sim.state)).toBe(200);
  });
});

describe('Spielstand-Migration', () => {
  it('v1-Spielstand behält Geld und Zeit und bekommt Handelsdaten', () => {
    const s = migrate(1, { money: 1234, companyLevel: 1, minutes: 5000, speed: 2 });
    expect(s.money).toBe(1234);
    expect(s.minutes).toBe(5000);
    expect(s.speed).toBe(2);
    expect(s.unlocked).toEqual(['akkuschrauber']);
    expect(s.shelves).toBe(2);
    expect(s.reputation).toBe(50);
    expect(s.jobs).toEqual([]);
  });

  it('aktueller Spielstand (v3) bleibt beim Laden unverändert', () => {
    const sim = newSim();
    sim.unlockArticle('led');
    const copy = migrate(3, JSON.parse(JSON.stringify(sim.state)));
    expect(copy).toEqual(sim.state);
  });
});
