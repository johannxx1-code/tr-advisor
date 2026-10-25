// Speichern/Laden im Browser (localStorage) mit versioniertem Spielstand.

import { createInitialState, GAME_SPEEDS, type GameState } from '../sim/state';

/** Bei jeder inkompatiblen Änderung an GameState erhöhen und migrate() ergänzen. */
export const SAVE_VERSION = 3;
const STORAGE_KEY = 'firmen-tycoon.save';

interface SaveFile {
  version: number;
  savedAt: number; // Echtzeit (ms), Basis für späteren Offline-Fortschritt
  state: GameState;
}

export function saveGame(state: GameState): boolean {
  const file: SaveFile = { version: SAVE_VERSION, savedAt: Date.now(), state };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(file));
    return true;
  } catch (err) {
    console.warn('Speichern fehlgeschlagen', err);
    return false;
  }
}

export interface LoadedGame {
  state: GameState;
  savedAt: number;
}

export function loadGame(): LoadedGame | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const file = JSON.parse(raw) as Partial<SaveFile>;
    if (typeof file.version !== 'number' || !file.state) return null;
    if (file.version > SAVE_VERSION) {
      console.warn(`Spielstand-Version ${file.version} ist neuer als das Spiel (${SAVE_VERSION}).`);
      return null;
    }
    return { state: migrate(file.version, file.state), savedAt: file.savedAt ?? Date.now() };
  } catch (err) {
    console.warn('Spielstand beschädigt, wird ignoriert', err);
    return null;
  }
}

export function deleteSave(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignorieren */
  }
}

/** Bringt ältere Spielstände auf den aktuellen Stand und füllt fehlende Felder auf. */
export function migrate(version: number, state: unknown): GameState {
  const s = (state ?? {}) as Partial<GameState>;
  const d = createInitialState();
  const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

  // v1 → v2: Handel (Sortiment, Lager, Markt, Bestellungen) kommt hinzu – Startwerte übernehmen.
  const hasTrade = version >= 2;
  const hasJobs = version >= 3;
  const market = { ...d.market };
  if (hasTrade && s.market && typeof s.market === 'object') {
    for (const id of Object.keys(market)) if (s.market[id]) market[id] = { ...market[id], ...s.market[id] };
  }
  return {
    money: num(s.money, d.money),
    companyLevel: num(s.companyLevel, d.companyLevel),
    minutes: num(s.minutes, d.minutes),
    speed: GAME_SPEEDS.includes(s.speed as never) ? (s.speed as GameState['speed']) : d.speed,
    rng: hasTrade ? num(s.rng, d.rng) : d.rng,
    unlocked: hasTrade && Array.isArray(s.unlocked) ? s.unlocked.filter((id) => typeof id === 'string') : d.unlocked,
    inventory: hasTrade && s.inventory && typeof s.inventory === 'object' ? { ...s.inventory } : d.inventory,
    market,
    orders: hasTrade && Array.isArray(s.orders) ? s.orders : d.orders,
    nextOrderId: hasTrade ? num(s.nextOrderId, d.nextOrderId) : d.nextOrderId,
    shelves: hasTrade ? num(s.shelves, d.shelves) : d.shelves,
    extension: hasTrade ? num(s.extension, d.extension) : d.extension,
    // v2 → v3: Aufträge, Ruf, Firmenwagen, Meldungen
    reputation: hasJobs ? num(s.reputation, d.reputation) : d.reputation,
    offers: hasJobs && Array.isArray(s.offers) ? s.offers : d.offers,
    jobs: hasJobs && Array.isArray(s.jobs) ? s.jobs : d.jobs,
    completedJobs: hasJobs && Array.isArray(s.completedJobs) ? s.completedJobs : d.completedJobs,
    nextJobId: hasJobs ? num(s.nextJobId, d.nextJobId) : d.nextJobId,
    van: hasJobs && s.van && typeof s.van === 'object' ? { ...d.van, ...s.van } : d.van,
    messages: hasJobs && Array.isArray(s.messages) ? s.messages : d.messages,
    nextMessageId: hasJobs ? num(s.nextMessageId, d.nextMessageId) : d.nextMessageId,
    minStock: hasJobs && s.minStock && typeof s.minStock === 'object' ? { ...s.minStock } : d.minStock,
    stockAlerted: hasJobs && s.stockAlerted && typeof s.stockAlerted === 'object' ? { ...s.stockAlerted } : d.stockAlerted,
  };
}
