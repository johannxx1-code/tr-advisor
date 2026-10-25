# Firmen-Tycoon – Projektkontext

Browser-Spiel, Wirtschaftssimulation. 3D Low-Poly, Draufsicht (leicht schräg), Desktop + Handy.
Stack: **Vite + TypeScript + Three.js**, keine weiteren Frameworks. Sprache im Spiel: Deutsch.

## Spielkonzept

- Genre: Wirtschaftssimulation, der Spieler steuert eine Firma.
- Start als kleiner Gemischtwarenhändler in einer Garage, Ausbau bis zum Konzern mit eigener Produktion.
- Sandbox: Man kann nicht verlieren. KI-Konkurrenz ist sanft (Marktdruck, kein Game Over).
- Artikel: reale Produkttypen **ohne Markennamen** (z. B. „Akkuschrauber 18V“, „Gartenschlauch 20 m“, „LED-Leuchtmittel E27“).

### Systeme (spätere Stufen)

- **Einkauf** bei Lieferanten: Preis, Lieferzeit, Zuverlässigkeit, saisonale Marktpreise.
- **Verkauf** an Laufkundschaft / Markt.
- **Kundenaufträge** mit Frist, Bonus und Vertragsstrafe.
- **Ruf** (beeinflusst Aufträge, Preise, Kunden).
- **Lagerplatz** & Lagerausbau.
- **Personal**: Gehalt, Erfahrung, Motivation.
- **Finanzen**: Fixkosten, Kredite, Monatsbilanz.
- **Produktion** mit Stücklisten.
- **Firmenlevel**: Garage → Halle → Logistikzentrum → Werk → Konzern.
- **Upgrade-Baum**.
- **Zufallsereignisse**.
- **KI-Konkurrenz** (sanft).
- **Offline-/Idle-Fortschritt**.

## Roadmap

1. Grundgerüst (Szene, Kamera, Spielzeit, HUD, Speichern/Laden, responsiv) ✅
2. Handel (Einkauf/Verkauf, Lieferanten, Marktpreise)
3. Aufträge & Ruf
4. Personal & Finanzen
5. Lagerausbau & Level/Upgrades
6. Produktion
7. Ereignisse / Konkurrenz / Idle-Fortschritt
8. Mobile-PWA / Sound / Balancing

## Architekturregeln (verbindlich)

- **Simulation strikt getrennt von Darstellung und UI.**
  - `src/sim/` enthält nur reine Logik und Zustand (`GameState`) plus `tick`/`advanceMinutes`.
  - `src/sim/` darf **niemals** `three`, `window`, `document`, `localStorage` oder andere Browser-APIs importieren/verwenden.
  - Die Simulation muss ohne Rendering laufen können (Offline-Fortschritt, Tests in Node).
- `src/render/` (Three.js) und `src/ui/` (HTML/CSS) **lesen** den Zustand und rufen Aktionen der Simulation auf; sie halten keine Spiellogik.
- `src/persistence/` serialisiert `GameState` (JSON) in `localStorage`. Jeder Spielstand hat eine `version`; bei Änderungen am Zustand `SAVE_VERSION` erhöhen und eine Migration in `migrate()` ergänzen.
- `src/main.ts` ist die einzige Stelle, die alles verdrahtet (Game-Loop, Events, Autosave).
- Zustand ist JSON-serialisierbar (keine Klassen-Instanzen, Maps, Funktionen im `GameState`).
- Zeit: Die Simulation rechnet in **Spielminuten**. Echtzeit → Spielzeit nur über `MINUTES_PER_REAL_SECOND` × Geschwindigkeit.
- Geld als Zahl in Euro (später ggf. Cent-Integer, falls Rundungsfehler auftreten).

## Ordnerstruktur

```
src/
  main.ts              Verdrahtung, Game-Loop, Autosave
  sim/                 reine Simulation (kein DOM, kein Three.js)
  persistence/         Speichern/Laden (localStorage), Versionierung
  render/              Three.js-Szene, Low-Poly-Bauteile, Kamera
  ui/                  HUD, Panels, CSS
```

## Befehle

- `npm install` – Abhängigkeiten
- `npm run dev` – Dev-Server (auch im WLAN erreichbar, siehe Konsolenausgabe „Network“)
- `npm run typecheck` – TypeScript-Prüfung
- `npm run build` – Produktions-Build nach `dist/`

## Konventionen

- UI-Texte Deutsch, Code/Bezeichner Englisch.
- Low-Poly: `flatShading`, einfache Grundformen, ruhige Farbpalette (`src/render/palette.ts`).
- Mobile first: Touch-Ziele ≥ 44 px, Safe-Area-Insets beachten.
