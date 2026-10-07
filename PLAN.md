# sout – Plan

Lebendes Dokument, Stand 6. Oktober 2026. Fasst das Brainstorming und alle bisherigen Entscheidungen zusammen.

## Ziel

Eine Desktop-App (keine Website) fürs Studium an der TU Wien:

1. **Kalender** mit allen LVAs, Übungsgruppen und Prüfungen aus TISS
2. **Notizen**, gut organisiert und automatisch nach den aktuellen Fächern sortiert
3. **Abgaben & Tests** aus TUWEL: was ist offen, bis wann, wo, wie

Dazu:

- startet automatisch beim Anmelden (abschaltbar)
- Schließen beendet nicht: sout bleibt als Symbol oben in der Leiste, ein Klick öffnet ein kleines Fenster darunter (wie die JetBrains Toolbox)

## Entscheidungen

| Thema | Entscheidung |
|---|---|
| Technik | Electron + Vite + TypeScript + React. Java wäre die Wunschsprache gewesen, Hauptsache ist aber, dass es funktioniert. Tauri scheidet aus: Es bekommt unter Linux keine Klicks aufs Tray-Symbol. |
| Mini-Fenster | Toolbox-Stil: Symbol oben rechts, Klick öffnet ein kleines Fenster darunter, Klick daneben oder Esc schließt es |
| Tray unter GNOME | Erweiterung „AppIndicator and KStatusNotifierItem Support“ (`gnome-shell-extension-appindicator`) |
| Wayland | App läuft über XWayland, damit das Mini-Fenster oben rechts platziert werden kann. Der Schalter `--ozone-platform=x11` muss beim Start übergeben werden (npm-Skripte, `sout`-Befehl und Autostart tun das; sonst startet sout sich einmal selbst damit neu). Zur Laufzeit gesetzt erreicht er nur die Kindprozesse – dann bleiben die Fenster leer. |
| Sprache | Electron startet mit `--lang=de-AT` – Datumsfelder und Menüs sind deutsch, auch wenn das System auf Englisch steht |
| Notizen | Markdown-Dateien; LaTeX-Formeln wichtig; PDFs (Folien) wichtig; Screenshots niedrige Priorität; keine Handschrift |
| Reihenfolge | egal, daher Phase 0 bis 4 wie unten |

## Datenquellen

### TISS

- Persönlicher Kalender als iCal, ohne Passwort: TISS → Kalender → ganz unten Token/URL erzeugen.
  Format: `https://tiss.tuwien.ac.at/events/rest/calendar/personal?token=…&locale=de`
- Termine haben LVA-Nummer und Typ im Titel (`123.456 VU Titel`) → Fächer automatisch erkennen
- Öffentliche API für LVA-Details: `https://tiss.tuwien.ac.at/api/course/<LVA-Nr>-<Semester>` (XML, ohne Login)
- Vorbild für Raum-Infos (Adresse, Stockwerk, TUW-Maps-Link, LectureTube): [better-tiss-calendar](https://github.com/flofriday/better-tiss-calendar)

### TUWEL (Moodle)

- Der Zugang für die Moodle-App ist aktiv (am 6.10.2026 geprüft: `enablemobilewebservice=1`, Login per TU-Wien-SSO im Browser)
- Login wie bei der offiziellen Moodle-App: TU-Login-Fenster → Token. Das Passwort sieht und speichert sout nie.
- Damit erreichbar: offene Aufgaben (wie die TUWEL-Zeitleiste), Abgabestatus, Fälligkeit und letzte Abgabemöglichkeit, Beschreibung, erlaubte Dateitypen, Test-Zeitfenster, Bewertungen, Kursunterlagen
- Plan B: TUWEL-Kalenderexport (iCal), aber ohne Abgabestatus
- Tokens laufen irgendwann ab → „neu anmelden“ anbieten
- Sparsam abfragen (z. B. alle 30 Minuten), wegen Akku und TU-Servern

## Architektur

- **Hauptprozess** (`src/main`): Fenster, Tray, Autostart, Einstellungen, Tokens, später der Sync
- **Preload** (`src/preload`): schmale, typisierte Brücke `window.sout`. Der Vertrag steht in `src/shared/types.ts`.
- **Oberfläche** (`src/renderer`): React. Hauptfenster und Mini-Fenster nutzen dieselbe Seite (`#mini`).
- **Daten**
  - `~/.config/sout/settings.json` – Einstellungen
  - `~/.config/sout/secrets.json` – Tokens, verschlüsselt mit Electrons `safeStorage` (Schlüssel im GNOME-Schlüsselbund)
  - `~/.config/autostart/sout.desktop` – nur wenn Autostart an ist
  - später: SQLite als Zwischenspeicher für Termine und Abgaben, Notizen als Markdown-Dateien in einem Ordner (z. B. `~/Studium`)
- **Fach** = LVA-Nummer + Semester (z. B. `123.456-2026W`). Das verbindet TISS-Termine, TUWEL-Kurs und Notizordner.

## Phasen

### Phase 0 – Grundgerüst ✅

- [x] Electron + Vite + TypeScript + React aufgesetzt
- [x] Hauptfenster mit Navigation: Heute, Kalender, Abgaben, Notizen, Einstellungen
- [x] Tray-Symbol mit Menü: Mini-Ansicht, Öffnen, Einstellungen, Autostart, Beenden
- [x] Mini-Fenster oben rechts, schließt bei Klick daneben oder Esc
- [x] Schließen → läuft im Hintergrund weiter (nur wenn ein Tray-Symbol angezeigt werden kann), einmaliger Hinweis
- [x] Strg+Q beendet
- [x] Autostart-Schalter, dazu „beim Autostart nur im Hintergrund starten“
- [x] Nur eine Instanz; `sout --mini` öffnet/schließt die Mini-Ansicht (für ein GNOME-Tastenkürzel)
- [x] Token-Speicher (verschlüsselt), TISS-URL eintragen und Verbindung testen
- [x] `npm run install-desktop`: Eintrag in der App-Übersicht und Befehl `~/.local/bin/sout`
- [x] Start über XWayland mit `--ozone-platform=x11` (ohne den Schalter startet sout sich einmal selbst neu)
- [ ] Mit installierter Extension prüfen: Öffnet der Linksklick aufs Symbol die Mini-Ansicht? Bekommt das Mini-Fenster den Fokus und schließt es bei Klick daneben?

### Phase 1 – Kalender (TISS) ✅ (bis auf eigene Termine)

- [x] TISS-Feed laden (beim Start, stündlich, nach dem Aufwachen) und lokal zwischenspeichern (`calendar.json`) → offline nutzbar, „Stand: …“
- [x] Fächer automatisch erkennen (LVA-Nr), Typ (VO, UE, VU …); Termine als Vorlesung, Gruppe, Prüfung oder vorlesungsfrei
- [x] TISS führt Vorlesungen mit Ausweich-/Übertragungsraum doppelt – sie werden zu einem Termin zusammengefasst
- [x] Ansichten Tag, Woche, Monat, Liste (FullCalendar 6)
- [x] Eine Farbe pro Fach, Filter nach Fach (dauerhaft) und Typ
- [x] Kurznamen: standardmäßig Abkürzungen (ADM, EP1, GDS), in den Einstellungen änderbar, ebenso Farbe und Ausblenden
- [x] Termin-Details: Raum mit TUW-Maps-Link und Adresse (Raumliste aus better-tiss-calendar), Link zur LVA in TISS
- [x] „Heute“ und Mini-Fenster zeigen die nächsten Termine, mit „in 25 min“ / „läuft“
- [ ] Eigene Termine (Lerngruppe, Lernblöcke)
- später: Link zum TUWEL-Kurs (kommt mit Phase 2), „Mitschrift öffnen“ (Phase 3), LectureTube-Link, Änderungen erkennen (Raumwechsel, Absage) und melden, Überschneidungen markieren

### Phase 2 – Abgaben & Tests (TUWEL) ✅ (mit echtem Login noch zu prüfen)

- [x] TU-Login in eigenem Fenster wie die Moodle-App: `admin/tool/mobile/launch.php` → TU-Wien-Login → `moodlemobile://token=…` (Signatur geprüft), Token verschlüsselt gespeichert
- [x] Daten über die Moodle-Schnittstelle: Zeitleiste (`core_calendar_get_action_events_by_timesort`), Abgaben (`mod_assign_get_assignments`, `mod_assign_get_submission_status`), Tests (`mod_quiz_get_quizzes_by_courses`); Sync beim Start, alle 30 Minuten, nach dem Aufwachen
- [x] Seite „Abgaben“ in zwei Teilen: „Jetzt offen“ (das Dringendste zuerst, mit Tagesüberschriften) und „Noch nicht offen“ (mit „öffnet …“, sortiert nach Öffnungszeit); dazu „Erledigt“
- [x] TUWEL meldet Öffnen und Schließen eines Tests als zwei Einträge – sout macht daraus eine Aufgabe
- [x] Pro Eintrag: was (Titel, Beschreibung), bis wann (Countdown, letzte Abgabemöglichkeit), wie (Datei-Upload, Online-Text, Dateitypen, Zeitlimit), wo (Direktlink zur Aktivität), Status (offen / Entwurf)
- [x] Abgegebenes verschwindet automatisch (TUWEL-Zeitleiste); in sout abhaken; eigene To-dos mit Datum und Fach
- [x] Deadlines im Kalender (ganztägige Zeile), auf „Heute“ und im Mini-Fenster
- [x] Erinnerungen als Benachrichtigung, einstellbar: 3 Tage / 1 Tag / 3 Stunden / 1 Stunde vorher; dazu „jetzt offen“, sobald etwas aufmacht (abschaltbar)
- [ ] Mit echtem TUWEL-Login testen und die Daten prüfen (`--dump-tuwel`)
- später: Kreuzerlübungen genauer (was ist angekreuzt), Terminbuchungen für Abgabegespräche, Noten und Feedback, Forum-Ankündigungen, Meldung bei neuen Aufgaben, Raum bei Präsenztests aus TISS

### Phase 3 – Notizen

- [ ] Pro Fach ein Ordner, nach Semester geordnet (`~/Studium/2026W/<Fach> (<LVA-Nr>)/`); alte Semester ins Archiv
- [ ] Markdown-Editor mit Live-Ansicht, LaTeX-Formeln (KaTeX), Code, Tabellen, Checklisten
- [ ] PDFs: Folien pro Fach ablegen und neben der Notiz öffnen
- [ ] Vorlagen: Vorlesungsmitschrift (Datum und Raum aus dem Kalender), Übungsblatt, Zusammenfassung zur Prüfungsvorbereitung
- [ ] Verknüpfungen: Termin ↔ Mitschrift, Abgabe ↔ Notizen
- [ ] Volltextsuche, Tags
- [ ] Schnellnotiz aus dem Mini-Fenster → Inbox, später einem Fach zuordnen
- später: Bilder per Strg+V, Links zwischen Notizen, TUWEL-Unterlagen automatisch laden, PDF-Export, Karteikarten

```
~/Studium/2026W/Analysis (123.456)/
├── _fach.md        ← LVA-Infos & Links
├── Vorlesung/2026-10-07.md
├── Übung/
├── Prüfung/
└── Folien/         ← PDFs
```

### Phase 4 – Feinschliff

- [ ] Mini-Fenster als echte Tagesübersicht: nächster Termin mit Raum und Countdown, Tagesplan, nächste Abgaben, Schnellnotiz
- [ ] Symbol zeigt Dringendes an (z. B. Punkt, wenn in weniger als 24 Stunden etwas fällig ist)
- [ ] Meldungen bei Änderungen (Raum, Absage, neue Aufgabe, neue Note)
- [ ] Installation als RPM oder AppImage

## Ideen für später

Lernplaner (vom Prüfungstermin rückwärts Lernblöcke einplanen) · Lernzeit pro Fach · ECTS- und Notenübersicht · Mensa-Plan

## Offene Punkte

- Anmeldefristen (LVA, Gruppe, Prüfung) stehen nicht im TISS-Feed (geprüft 7.10.2026: nur COURSE, GROUP, EXAM_SLOT, HOLIDAY).
- Liefert die TUWEL-Schnittstelle Kreuzerlübungen und Terminbuchungen?
- Linksklick aufs Tray-Symbol unter GNOME: Mini-Ansicht oder Menü? (Fallback: „Mini-Ansicht“ ist der erste Menüeintrag.)
