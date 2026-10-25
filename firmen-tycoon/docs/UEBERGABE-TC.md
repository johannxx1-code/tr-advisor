# Übergabe: Firmen-Tycoon auf den TC-Rechner

Stand: 25.10.2026. Bisher entwickelt in einer Cloud-Sitzung, weiter geht es auf dem TC (ThinkCentre).
Spielkonzept, Architekturregeln und alle bisherigen Entscheidungen stehen in `firmen-tycoon/CLAUDE.md` – zuerst lesen.

## Wo der Code liegt

- Repo `johannxx1-code/tr-advisor`, Branch `claude/firmen-tycoon-stage-1-liwxh6`, Ordner `firmen-tycoon/`
- PR #1 (nach `main`) ist offen, konfliktfrei, ohne CI. Enthält Stufe 1–3 + Beschleuniger.
- Spielbare Version (Einzeldatei) bisher als privates Claude-Artifact veröffentlicht.

## Stand des Spiels

- Stufe 1 Grundgerüst, Stufe 2 Handel, Stufe 3 Aufträge & Ruf, Beschleuniger (Einräumen, Anpacken, Aushilfe, 2. Wagen, Express) – fertig.
- `npm test`: 32 Tests (vitest), `npm run typecheck`, `npm run build` grün.
- Spielstand-Version 4 (localStorage), Migrationen v1→v4 vorhanden.

## Ziel auf dem TC (vom Nutzer gewählt)

- Auf dem TC weiterentwickeln, später auch mit **Godot**.
- **Web-Push (PWA)** für echte Benachrichtigungen.
- Spielen **auch unterwegs** (über bestehendes FritzBox-WireGuard-VPN).

## Empfohlene Architektur (noch zur Freigabe, Plan + Vorschau zeigen)

- **Spiel-Server in Node** auf dem TC, nutzt die vorhandene Simulation (`src/sim/`, läuft ohne Browser):
  rechnet 24/7, hält den Spielstand, verschickt Web-Push.
- Grafik/Bedienung wird **Client**: zuerst die jetzige Three.js-Version, später ein Godot-Client über dieselbe Server-Schnittstelle.
  So muss die Spiellogik nicht nach GDScript portiert werden.

## Bestandsaufnahme TC (vom Nutzer gemeldet)

- Node v18.19.1 / npm 9.2.0 (System) – **zu alt** für Vite 8/vitest (brauchen ≥ 20). Plan: Node 22 LTS per **nvm** nur für Benutzer `tc`, System-Node bleibt.
- Git 2.43.0, Godot nicht installiert.
- Fernzugriff: FritzBox-WireGuard (kein eigener VPN-Server auf dem TC). Kein HTTPS mit Domain/Zertifikat; nur selbstsigniertes RDP-Zertifikat.
- Belegte Ports: 22, 8123 (HA), 1883, 2283 (Immich), 4000, 8443–8447, 631, 2049, 8384/22000, diverse Docker-Ports.
- Speicher: 162 GB frei. Projektordner `~/Projekte` existiert.

## Nächste Schritte (einzeln, jeweils Rückmeldung abwarten)

1. ~~Bestandsaufnahme~~ erledigt.
2. Node 22 per nvm für Benutzer `tc` installieren (System-Node 18 nicht anfassen); prüfen, ob Dienste System-Node nutzen.
3. Repo nach `~/Projekte` klonen, Branch auschecken, `npm install`, `npm test`, Dev-Server starten (`npm run dev`, Port 5173 ist frei) und im WLAN/VPN testen.
   Option mit dem Nutzer klären: Spiel in ein eigenes Repo `firmen-tycoon` auslagern (das Repo `tr-advisor` enthält eine fremde App).
4. Architektur festlegen (Plan + visuelle Vorschau, Freigabe abwarten), dann Spiel-Server als systemd-Dienst.
5. HTTPS für Push/PWA ohne Port-Freigabe, Varianten vorschlagen (z. B. eigene (Sub-)Domain mit Let's-Encrypt-DNS-Challenge auf die LAN-Adresse, oder eigene CA auf den Geräten).
6. PWA + Web-Push.
7. Godot installieren und Godot-Client beginnen.

## Regeln des Nutzers (unbedingt einhalten)

- Vor jeder Einrichtung/Änderung an System, Diensten, HA oder Fernzugriff: `/home/tc/Obsidian/Home-KI/System/Systemstand.md` lesen. Danach Eintrag aktualisieren und eine Zeile an `Log.md` anhängen. Im Vault nichts löschen.
- Vor jeder Umsetzung: Ziel per Rückfragen klären, Plan + visuelle Vorschau (gern 2–3 Varianten), erst nach ausdrücklicher Freigabe umsetzen.
- Anleitungen: kurze Zusammenfassung, dann nur einen Schritt, Rückmeldung abwarten.
- Antworten auf Deutsch, knapp, ehrlich; Unsicherheiten kennzeichnen.
