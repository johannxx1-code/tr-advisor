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

/** Im Hintergrund (Spiel zu oder Tab verdeckt) läuft die Zeit in Echtzeit: 1 echte Minute = 1 Spielminute. */
export const OFFLINE_MINUTES_PER_REAL_MINUTE = 1;
/** Technische Obergrenze fürs Nachrechnen. */
export const OFFLINE_MAX_MINUTES = 30 * MINUTES_PER_DAY;

/** Spielminuten, die für eine Abwesenheit von `realMs` Millisekunden nachgerechnet werden. */
export function offlineMinutes(realMs: number): number {
  if (!(realMs > 0)) return 0;
  return Math.min(OFFLINE_MAX_MINUTES, (realMs / 60000) * OFFLINE_MINUTES_PER_REAL_MINUTE);
}
