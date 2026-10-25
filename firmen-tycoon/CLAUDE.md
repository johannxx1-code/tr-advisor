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
2. Handel (Einkauf/Verkauf, Lieferanten, Marktpreise, einfacher Lagerausbau) ✅
3. Aufträge & Ruf (Touren im Hintergrund, Meldungen, Nachrechnen) ✅
4. Personal & Finanzen
5. Großer Lagerausbau (Umzug Halle …) & Level/Upgrades
6. Produktion
7. Ereignisse / Konkurrenz / Idle-Fortschritt
8. Mobile-PWA / Sound / Balancing

## Stand Stufe 2 (Entscheidungen)

- Start mit 1 Artikel (Akkuschrauber 18V, 10 Stk Startbestand); weitere 11 Artikel gegen Einmalgebühr freischalten.
- Verkauf **manuell an Händler** zum Tages-Marktpreis; jedes verkaufte Stück senkt den Ankaufpreis um 1 %, der Druck halbiert sich über Nacht.
- 6 Lieferanten mit Preisfaktor, Lieferzeit, Zuverlässigkeit (Verspätung oder Teillieferung mit Erstattung), Versandpauschale; Bezahlung bei Bestellung.
- Kalender: 1 Monat = 10 Spieltage, Spielbeginn 1. März. Saisonkurven je Artikel in `sim/catalog.ts`.
- Lager: Regal = 20 Plätze; erst alle Regalplätze im Gebäude füllen, dann Anbau 1 (+6) bzw. Anbau 2 (+8). In 3D sichtbar, Ware füllt die Regale der Reihe nach.
- UI: Panel „Handel“ mit Reitern Einkauf / Verkauf / Unterwegs; Panel „Lager“ mit Bestand und Ausbau.
- Alle Zahlen sind Startwerte; Balancing in Stufe 8.

## Stand Stufe 3 (Entscheidungen)

- Auftragsangebote (2–4, mehr bei gutem Ruf), Größe passend zur Lagerkapazität; bis zu 3 laufende Aufträge.
- Firmenwagen liefert in Touren: 40 Plätze, Verladen 1 Std. + 3 Min./Stk, Fahrt 1–4 Std. je Weg, Abladen 30 Min.; Touren starten nur 6–18 Uhr; Auftrag mit kürzester Frist zuerst.
- Bezahlung pro Tour; pünktlich +10 % Bonus und Ruf +4; verspätet −5 %/Tag (max. −30 %) und Ruf −3/Tag; Abbruch −30 % vom Restwert und Ruf −8.
- Meldungen (Postfach 🔔, gespeichert im Spielstand): Auftrag fertig, Touren pausiert (Bestand fehlt), überfällig, eigene Mindestmenge unterschritten, Lieferungen/Verspätungen. Angebote nur als Zähler am Knopf „Aufträge“.
- Zeit: im Spiel schnell (1× = 12 Spielminuten pro Sekunde). Im Hintergrund (Spiel zu oder Tab verdeckt) **Echtzeit** (1 min = 1 Spielminute), max. 30 Spieltage; bei Pause kein Nachrechnen. Danach Zusammenfassung „Während du weg warst“.

## Später / offene Richtungsentscheidungen

- **Eigenes Hosting auf dem Rechner des Nutzers** (statt Artifact-Link), damit echte Benachrichtigungen (Push/PWA) möglich werden. Vor jeder Einrichtung dort die Systemstand-Regeln des Nutzers beachten.
- **Option Godot** für eine ausgearbeitetere Grafik: würde Rendering und UI ersetzen; die TypeScript-Simulation ließe sich nicht direkt übernehmen (Godot nutzt GDScript/C#). Entscheidung möglichst früh treffen, da der Portierungsaufwand mit jeder Stufe wächst.

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
- `npm test` – Tests der Simulation (vitest, laufen ohne Browser); prüft auch, dass `src/sim/` keine Browser-/Three.js-APIs nutzt
- `npm run build` – Produktions-Build nach `dist/`

## Konventionen

- UI-Texte Deutsch, Code/Bezeichner Englisch.
- Low-Poly: `flatShading`, einfache Grundformen, ruhige Farbpalette (`src/render/palette.ts`).
- Mobile first: Touch-Ziele ≥ 44 px, Safe-Area-Insets beachten.
