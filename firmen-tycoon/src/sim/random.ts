// Deterministischer Zufall. Der Zustand liegt im Spielstand, damit Laden/Tests reproduzierbar sind.

/** Liefert eine Zahl in [0, 1) und schreibt den neuen Zufallszustand zurück (mulberry32). */
export function nextRandom(holder: { rng: number }): number {
  holder.rng = (holder.rng + 0x6d2b79f5) | 0;
  let t = holder.rng;
  t = Math.imul(t ^ (t >>> 15), 1 | t);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) | 0;
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
