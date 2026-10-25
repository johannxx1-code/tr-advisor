// Stammdaten: Artikel und Lieferanten. Reale Produkttypen, keine Markennamen.
// Alle Zahlen sind Startwerte fürs Balancing (Stufe 8).

export type Category = 'werkzeug' | 'elektro' | 'haushalt' | 'garten' | 'winter';

export interface Article {
  id: string;
  name: string;
  category: Category;
  /** Grund-Marktpreis in Euro (vor Saison und Schwankung). */
  basePrice: number;
  /** Benötigte Lagerplätze pro Stück. */
  slots: number;
  /** Einmalige Gebühr zum Freischalten (0 = von Anfang an verfügbar). */
  unlockCost: number;
  /** Preisfaktor je Monat, Januar … Dezember. */
  season: readonly number[];
}

// Saisonkurven (Januar … Dezember)
const FLAT = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
const AUTUMN_WINTER = [1.15, 1.1, 1.0, 0.95, 0.9, 0.85, 0.85, 0.9, 1.0, 1.1, 1.2, 1.2];
const SPRING_SUMMER = [0.8, 0.85, 1.0, 1.15, 1.25, 1.25, 1.2, 1.05, 0.9, 0.8, 0.75, 0.75];
const WINTER_STRONG = [1.4, 1.3, 1.0, 0.8, 0.65, 0.6, 0.6, 0.65, 0.8, 1.0, 1.3, 1.45];
const SPRING = [0.85, 0.9, 1.1, 1.3, 1.3, 1.1, 1.0, 0.9, 0.85, 0.8, 0.8, 0.8];
const CHRISTMAS = [0.9, 0.9, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95, 1.0, 1.05, 1.2, 1.45];
const SUMMER_STRONG = [0.6, 0.65, 0.9, 1.2, 1.4, 1.45, 1.35, 1.1, 0.85, 0.7, 0.6, 0.6];

export const ARTICLES: readonly Article[] = [
  { id: 'akkuschrauber', name: 'Akkuschrauber 18V', category: 'werkzeug', basePrice: 89, slots: 1, unlockCost: 0, season: FLAT },
  { id: 'led', name: 'LED-Leuchtmittel E27 (10er)', category: 'elektro', basePrice: 19, slots: 1, unlockCost: 250, season: AUTUMN_WINTER },
  { id: 'kabel', name: 'Verlängerungskabel 5 m', category: 'elektro', basePrice: 14, slots: 1, unlockCost: 250, season: FLAT },
  { id: 'schlauch', name: 'Gartenschlauch 20 m', category: 'garten', basePrice: 29, slots: 2, unlockCost: 300, season: SPRING_SUMMER },
  { id: 'wasserkocher', name: 'Wasserkocher 1,7 l', category: 'haushalt', basePrice: 35, slots: 1, unlockCost: 400, season: FLAT },
  { id: 'bohrmaschine', name: 'Bohrmaschine 750 W', category: 'werkzeug', basePrice: 69, slots: 1, unlockCost: 600, season: FLAT },
  { id: 'heizluefter', name: 'Heizlüfter 2000 W', category: 'winter', basePrice: 45, slots: 2, unlockCost: 700, season: WINTER_STRONG },
  { id: 'schneeschaufel', name: 'Schneeschaufel', category: 'winter', basePrice: 25, slots: 2, unlockCost: 700, season: WINTER_STRONG },
  { id: 'heckenschere', name: 'Heckenschere Akku', category: 'garten', basePrice: 99, slots: 2, unlockCost: 1000, season: SPRING },
  { id: 'winkelschleifer', name: 'Winkelschleifer 125 mm', category: 'werkzeug', basePrice: 59, slots: 1, unlockCost: 1000, season: FLAT },
  { id: 'werkzeugkoffer', name: 'Werkzeugkoffer 120-tlg.', category: 'werkzeug', basePrice: 79, slots: 2, unlockCost: 1500, season: CHRISTMAS },
  { id: 'rasenmaeher', name: 'Rasenmäher elektrisch', category: 'garten', basePrice: 179, slots: 4, unlockCost: 2500, season: SUMMER_STRONG },
];

export interface Supplier {
  id: string;
  name: string;
  /** Einkaufspreis als Anteil vom aktuellen Marktpreis. */
  priceFactor: number;
  /** Reguläre Lieferzeit in Spieltagen. */
  leadDays: number;
  /** Wahrscheinlichkeit (0…1), dass pünktlich und vollständig geliefert wird. */
  reliability: number;
  /** Versandpauschale pro Bestellung in Euro. */
  shippingFee: number;
  /** Warengruppen im Sortiment; 'rotating' = wechselnde Restposten. */
  categories: readonly Category[] | 'rotating';
}

export const SUPPLIERS: readonly Supplier[] = [
  { id: 'restposten', name: 'Restposten-Börse', priceFactor: 0.45, leadDays: 5, reliability: 0.6, shippingFee: 15, categories: 'rotating' },
  { id: 'billig', name: 'Billig-Import Ost', priceFactor: 0.55, leadDays: 7, reliability: 0.7, shippingFee: 20, categories: ['werkzeug', 'elektro'] },
  { id: 'garten', name: 'Gartenkontor Süd', priceFactor: 0.62, leadDays: 4, reliability: 0.85, shippingFee: 25, categories: ['garten', 'winter'] },
  { id: 'nord', name: 'Großhandel Nord', priceFactor: 0.7, leadDays: 3, reliability: 0.9, shippingFee: 30, categories: ['werkzeug', 'elektro', 'haushalt', 'garten'] },
  { id: 'weber', name: 'Regionalhandel Weber', priceFactor: 0.78, leadDays: 2, reliability: 0.95, shippingFee: 20, categories: ['haushalt', 'elektro'] },
  { id: 'express', name: 'Fachhandel Express', priceFactor: 0.85, leadDays: 1, reliability: 0.98, shippingFee: 40, categories: ['werkzeug'] },
];

/** Anzahl Artikel im wöchentlich wechselnden Restposten-Sortiment. */
const ROTATING_COUNT = 4;

export function getArticle(id: string): Article {
  const a = ARTICLES.find((x) => x.id === id);
  if (!a) throw new Error(`Unbekannter Artikel: ${id}`);
  return a;
}

export function getSupplier(id: string): Supplier {
  const s = SUPPLIERS.find((x) => x.id === id);
  if (!s) throw new Error(`Unbekannter Lieferant: ${id}`);
  return s;
}

/** Restposten wechseln jede Spielwoche (7 Tage), deterministisch aus der Wochennummer. */
export function rotatingArticleIds(day: number): string[] {
  const week = Math.floor((day - 1) / 7);
  const ids = ARTICLES.map((a) => a.id);
  // Einfache deterministische Durchmischung (Fisher-Yates mit LCG)
  let seed = (week + 1) * 2654435761;
  for (let i = ids.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const j = seed % (i + 1);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, ROTATING_COUNT);
}

export function supplierSells(supplier: Supplier, article: Article, day: number): boolean {
  if (supplier.categories === 'rotating') return rotatingArticleIds(day).includes(article.id);
  return supplier.categories.includes(article.category);
}
