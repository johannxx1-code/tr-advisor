// Kalender: Monate und Jahreszeiten aus dem Spieltag. Reine Funktionen.

/** Ein Spielmonat dauert so viele Spieltage (ein Jahr ≈ 4 h bei 1×). */
export const DAYS_PER_MONTH = 10;
/** Tag 1 ist der 1. März (Monatsindex 2), damit das Spiel im Frühling beginnt. */
const START_MONTH = 2;

export const MONTH_NAMES = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
] as const;

export type Season = 'Frühling' | 'Sommer' | 'Herbst' | 'Winter';

const SEASON_ICONS: Record<Season, string> = { Frühling: '🌸', Sommer: '☀️', Herbst: '🍂', Winter: '❄️' };

function monthsSinceStart(day: number): number {
  return START_MONTH + Math.floor((day - 1) / DAYS_PER_MONTH);
}

/** Monatsindex 0 (Januar) … 11 (Dezember). */
export function monthOf(day: number): number {
  return monthsSinceStart(day) % 12;
}

export function yearOf(day: number): number {
  return Math.floor(monthsSinceStart(day) / 12) + 1;
}

export function seasonOf(month: number): Season {
  if (month >= 2 && month <= 4) return 'Frühling';
  if (month >= 5 && month <= 7) return 'Sommer';
  if (month >= 8 && month <= 10) return 'Herbst';
  return 'Winter';
}

export function seasonIcon(season: Season): string {
  return SEASON_ICONS[season];
}
