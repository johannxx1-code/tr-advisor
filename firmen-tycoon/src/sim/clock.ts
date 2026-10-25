// Umrechnung Spielminuten ↔ Tag/Uhrzeit. Reine Funktionen.

export const MINUTES_PER_DAY = 24 * 60;

/** Bei 1x vergehen so viele Spielminuten pro Echtzeit-Sekunde (1 Tag ≈ 2 Minuten). */
export const MINUTES_PER_REAL_SECOND = 12;

export interface GameTime {
  /** 1-basiert. */
  day: number;
  hour: number;
  minute: number;
}

export function toGameTime(totalMinutes: number): GameTime {
  const whole = Math.floor(totalMinutes);
  const minuteOfDay = whole % MINUTES_PER_DAY;
  return {
    day: Math.floor(whole / MINUTES_PER_DAY) + 1,
    hour: Math.floor(minuteOfDay / 60),
    minute: minuteOfDay % 60,
  };
}

export function dayOf(totalMinutes: number): number {
  return Math.floor(totalMinutes / MINUTES_PER_DAY) + 1;
}

export function formatClock(time: GameTime): string {
  return `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}
