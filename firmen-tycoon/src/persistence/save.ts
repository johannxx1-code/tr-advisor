// Speichern/Laden im Browser (localStorage) mit versioniertem Spielstand.

import { createInitialState, GAME_SPEEDS, type GameState } from '../sim/state';

/** Bei jeder inkompatiblen Änderung an GameState erhöhen und migrate() ergänzen. */
export const SAVE_VERSION = 1;
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
function migrate(version: number, state: unknown): GameState {
  const s = state as Partial<GameState>;
  // Platz für künftige Migrationen, z. B.:
  // if (version < 2) { s.reputation = 50; }
  void version;
  const defaults = createInitialState();
  return {
    money: typeof s.money === 'number' ? s.money : defaults.money,
    companyLevel: typeof s.companyLevel === 'number' ? s.companyLevel : defaults.companyLevel,
    minutes: typeof s.minutes === 'number' ? s.minutes : defaults.minutes,
    speed: GAME_SPEEDS.includes(s.speed as never) ? (s.speed as GameState['speed']) : defaults.speed,
  };
}
