// Reiner Spielzustand. Muss JSON-serialisierbar bleiben (siehe CLAUDE.md).

import { ARTICLES } from './catalog';
import { randomSeed } from './random';

export type GameSpeed = 0 | 1 | 2 | 4;

export const GAME_SPEEDS: readonly GameSpeed[] = [0, 1, 2, 4];

export const COMPANY_LEVELS = ['Garage', 'Halle', 'Logistikzentrum', 'Werk', 'Konzern'] as const;

export interface MarketEntry {
  /** Tagesschwankung um den Saisonpreis (≈ 0,85 … 1,15). */
  noise: number;
  /** Verkaufsdruck: steigt mit jedem verkauften Stück, halbiert sich über Nacht. */
  pressure: number;
  /** Marktpreis des Vortags (für die Trendanzeige). */
  prevPrice: number;
}

export interface Order {
  id: number;
  articleId: string;
  supplierId: string;
  qty: number;
  /** Bezahlter Stückpreis (für Erstattung bei Teillieferung). */
  unitPrice: number;
  orderedDay: number;
  /** Spieltag, an dessen Beginn die Lieferung ankommt. */
  dueDay: number;
  /** Wurde die Zuverlässigkeit schon geprüft? (Verspätung nur einmal) */
  rolled: boolean;
  delayed: boolean;
  /** Express gebucht (kürzere Lieferzeit, zuverlässiger). */
  express: boolean;
}

/** Gelieferte Ware im Wareneingang – muss erst eingeräumt werden. */
export interface InboundPallet {
  id: number;
  articleId: string;
  qty: number;
  arrivedAt: number;
}

/**
 * Arbeit, die Zeit braucht und beschleunigt werden kann (Verladen, Einräumen).
 * Gemessen in „Arbeitsminuten“: mit Aushilfe doppelt so schnell, Tippen zieht direkt ab.
 */
export interface WorkProgress {
  workTotal: number;
  workLeft: number;
  /** Durch Tippen bereits gesparte Arbeitsminuten (max. 50 % von workTotal). */
  tapSaved: number;
  /** Bis zu dieser Spielminute ist die Arbeit verbucht. */
  lastWorkAt: number;
}

export interface StoreTask extends WorkProgress {
  palletId: number;
}

/** Auftragsangebot eines Kunden (noch nicht angenommen). */
export interface JobOffer {
  id: number;
  customer: string;
  articleId: string;
  qty: number;
  /** Vereinbarter Stückpreis. */
  unitPrice: number;
  /** Frist in Spieltagen ab Annahme. */
  deadlineDays: number;
  /** Einfache Fahrzeit zum Kunden in Spielminuten. */
  distance: number;
  /** Letzter Tag, an dem das Angebot angenommen werden kann. */
  expiresDay: number;
}

/** Angenommener Auftrag, wird in Touren beliefert. */
export interface Job {
  id: number;
  customer: string;
  articleId: string;
  qty: number;
  unitPrice: number;
  distance: number;
  acceptedAt: number;
  /** Frist als Spielminute (Ende des Fristtags). */
  deadline: number;
  delivered: number;
  inTransit: number;
  /** Bereits bezahlter Betrag (pro Tour). */
  paid: number;
  cancelled: boolean;
  /** Strafe bei Abbruch (wird beim Abschluss verbucht, falls noch eine Tour unterwegs war). */
  cancelPenalty: number;
  /** Meldung „Bestand reicht nicht“ schon verschickt (bis zur nächsten Tour). */
  blockedNotified: boolean;
  /** Meldung „überfällig“ schon verschickt. */
  lateNotified: boolean;
}

export interface JobResult {
  id: number;
  customer: string;
  articleId: string;
  qty: number;
  delivered: number;
  revenue: number;
  bonus: number;
  penalty: number;
  reputationDelta: number;
  finishedAt: number;
  outcome: 'onTime' | 'late' | 'cancelled';
}

export type VanPhase = 'idle' | 'loading' | 'outbound' | 'unloading' | 'returning';

export interface Van extends WorkProgress {
  id: number;
  phase: VanPhase;
  jobId: number | null;
  load: number;
  phaseStart: number;
  phaseEnd: number;
}

export type MessageKind = 'done' | 'stock' | 'blocked' | 'late' | 'delivery' | 'delay' | 'offer' | 'cancelled' | 'staff';

export interface GameMessage {
  id: number;
  at: number;
  kind: MessageKind;
  title: string;
  text: string;
  read: boolean;
  /** Wohin ein Tippen auf die Meldung führt. */
  target?: { panel: 'orders' | 'storage' | 'trade' | 'staff'; articleId?: string };
}

export interface GameState {
  /** Geld in Euro. */
  money: number;
  /** Firmenlevel, 1-basiert (1 = Garage). */
  companyLevel: number;
  /** Vergangene Spielminuten seit Spielbeginn (Tag 1, 00:00). */
  minutes: number;
  speed: GameSpeed;
  /** Zustand des Zufallsgenerators. */
  rng: number;
  /** Freigeschaltete Artikel-IDs. */
  unlocked: string[];
  /** Lagerbestand in Stück je Artikel. */
  inventory: Record<string, number>;
  market: Record<string, MarketEntry>;
  orders: Order[];
  nextOrderId: number;
  /** Anzahl gekaufter Regale. */
  shelves: number;
  /** Gebäudeausbau: 0 = Garage, 1 = Anbau 1, 2 = Anbau 2. */
  extension: number;
  /** Ruf 0 … 100. */
  reputation: number;
  offers: JobOffer[];
  jobs: Job[];
  /** Zuletzt abgeschlossene Aufträge (neueste zuerst). */
  completedJobs: JobResult[];
  nextJobId: number;
  vans: Van[];
  /** Aushilfe eingestellt (Verladen & Einräumen doppelt so schnell). */
  helper: boolean;
  inbound: InboundPallet[];
  /** Palette, die gerade eingeräumt wird. */
  storing: StoreTask | null;
  nextPalletId: number;
  messages: GameMessage[];
  nextMessageId: number;
  /** Eigene Mindestmenge je Artikel (0 = keine Warnung). */
  minStock: Record<string, number>;
  /** Für diese Artikel wurde „Bestand knapp“ schon gemeldet (bis wieder aufgefüllt). */
  stockAlerted: Record<string, boolean>;
}

export const START_MONEY = 5000;
/** Spielbeginn: Tag 1, 08:00 Uhr. */
export const START_MINUTES = 8 * 60;
export const START_SHELVES = 2;
export const START_REPUTATION = 50;
/** Startbestand, damit man sofort etwas verkaufen kann. */
const START_STOCK: Record<string, number> = { akkuschrauber: 10 };

export function createInitialState(seed: number = randomSeed()): GameState {
  const market: Record<string, MarketEntry> = {};
  for (const a of ARTICLES) market[a.id] = { noise: 1, pressure: 0, prevPrice: 0 };
  return {
    money: START_MONEY,
    companyLevel: 1,
    minutes: START_MINUTES,
    speed: 1,
    rng: seed,
    unlocked: ARTICLES.filter((a) => a.unlockCost === 0).map((a) => a.id),
    inventory: { ...START_STOCK },
    market,
    orders: [],
    nextOrderId: 1,
    shelves: START_SHELVES,
    extension: 0,
    reputation: START_REPUTATION,
    offers: [],
    jobs: [],
    completedJobs: [],
    nextJobId: 1,
    vans: [createVan(1)],
    helper: false,
    inbound: [],
    storing: null,
    nextPalletId: 1,
    messages: [],
    nextMessageId: 1,
    minStock: {},
    stockAlerted: {},
  };
}

export function createVan(id: number): Van {
  return { id, phase: 'idle', jobId: null, load: 0, phaseStart: 0, phaseEnd: 0, workTotal: 0, workLeft: 0, tapSaved: 0, lastWorkAt: 0 };
}

export function companyLevelName(level: number): string {
  const index = Math.min(Math.max(level, 1), COMPANY_LEVELS.length) - 1;
  return COMPANY_LEVELS[index];
}
