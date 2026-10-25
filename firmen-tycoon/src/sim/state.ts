// Reiner Spielzustand. Muss JSON-serialisierbar bleiben (siehe CLAUDE.md).

export type GameSpeed = 0 | 1 | 2 | 4;

export const GAME_SPEEDS: readonly GameSpeed[] = [0, 1, 2, 4];

export const COMPANY_LEVELS = ['Garage', 'Halle', 'Logistikzentrum', 'Werk', 'Konzern'] as const;

export interface GameState {
  /** Geld in Euro. */
  money: number;
  /** Firmenlevel, 1-basiert (1 = Garage). */
  companyLevel: number;
  /** Vergangene Spielminuten seit Spielbeginn (Tag 1, 00:00). */
  minutes: number;
  speed: GameSpeed;
}

export const START_MONEY = 5000;
/** Spielbeginn: Tag 1, 08:00 Uhr. */
export const START_MINUTES = 8 * 60;

export function createInitialState(): GameState {
  return {
    money: START_MONEY,
    companyLevel: 1,
    minutes: START_MINUTES,
    speed: 1,
  };
}

export function companyLevelName(level: number): string {
  const index = Math.min(Math.max(level, 1), COMPANY_LEVELS.length) - 1;
  return COMPANY_LEVELS[index];
}
