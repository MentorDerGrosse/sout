# sout – Plan

Lebendes Dokument, Stand 8. Oktober 2026 (Phasen 0–5 umgesetzt). Fasst das Brainstorming und alle bisherigen Entscheidungen zusammen.

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
| Notizen | Markdown-Dateien in einem frei wählbaren Ordner (Vorschlag `~/Studium`), angelegt erst nach Klick auf „Ordner anlegen“; LaTeX-Formeln (KaTeX) und PDFs (Folien) wichtig; Screenshots niedrige Priorität; keine Handschrift |
| Reihenfolge | egal, daher Phase 0 bis 4 wie unten; dann Windows & Mac (Phase 5); alles für „später“ und alle Ideen ganz am Ende |

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
- **TUWEL-Tokens laufen schnell ab** (TUWEL läuft auf Moodle 5.1, die Dauer hängt an `tokenduration`; beobachtet: von wenigen Minuten bis ~1,5 h, genaue Dauer wird gemessen). Daher holt sout bei **jeder** Synchronisierung still einen Token über die gespeicherte Login-Sitzung (`persist:tuwel`) – erst über die TUWEL-Sitzung, dann über den TU-Wien-Login im SAML-„passive“-Modus (ohne Formular). Das hält nebenbei die TUWEL-Sitzung wach. Erst wenn auch die TU-Wien-Anmeldung abgelaufen ist, kommt eine Benachrichtigung „bitte neu anmelden“.
- Die Login-Cookies von TUWEL und TU-Wien-Login sind Sitzungs-Cookies, die Electron nicht auf die Platte schreibt – nach einem Neustart wäre die Anmeldung weg. sout macht sie nach jedem erfolgreichen Login dauerhaft (wie ein Browser, der seine Sitzung wiederherstellt); ob die Anmeldung noch gilt, entscheidet weiterhin der Server.
- Nach dem Login landet TUWEL manchmal auf der Startseite statt bei der App-Freigabe; das Login-Fenster holt sich den Token dann selbst.
- Sparsam abfragen (z. B. alle 30 Minuten), wegen Akku und TU-Servern

## Architektur

- **Hauptprozess** (`src/main`): Fenster, Tray, Autostart, Einstellungen, Tokens, Sync mit TISS und TUWEL, Notizdateien
- **Preload** (`src/preload`): schmale, typisierte Brücke `window.sout`. Der Vertrag steht in `src/shared/types.ts`.
- **Oberfläche** (`src/renderer`): React. Hauptfenster und Mini-Fenster nutzen dieselbe Seite (`#mini`).
- **Daten**
  - `~/.config/sout/settings.json` – Einstellungen
  - `~/.config/sout/secrets.json` – Tokens, verschlüsselt mit Electrons `safeStorage` (Schlüssel im GNOME-Schlüsselbund)
  - `~/.config/autostart/sout.desktop` – nur wenn Autostart an ist
  - Termine und Abgaben als JSON zwischengespeichert (`calendar.json`, `tuwel.json`); SQLite war bisher nicht nötig
  - Notizen: Markdown-Dateien im gewählten Notizordner, dazu `~/.config/sout/notes.json` (für welche Fächer schon ein Ordner angelegt wurde)
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
- [x] Mit installierter Extension geprüft: Linksklick aufs Symbol öffnet die Mini-Ansicht, Klick daneben schließt sie

### Phase 1 – Kalender (TISS) ✅

- [x] TISS-Feed laden (beim Start, stündlich, nach dem Aufwachen) und lokal zwischenspeichern (`calendar.json`) → offline nutzbar, „Stand: …“
- [x] Fächer automatisch erkennen (LVA-Nr), Typ (VO, UE, VU …); Termine als Vorlesung, Gruppe, Prüfung oder vorlesungsfrei
- [x] TISS führt Vorlesungen mit Ausweich-/Übertragungsraum doppelt – sie werden zu einem Termin zusammengefasst
- [x] Ansichten Tag, Woche, Monat, Liste (FullCalendar 6)
- [x] Eine Farbe pro Fach, Filter nach Fach (dauerhaft) und Typ
- [x] Kurznamen: lange Titel werden standardmäßig zu Initialen („Einführung in die Beispielkunde 1“ → „EB1“), kurze bleiben; in den Einstellungen änderbar, ebenso Farbe und Ausblenden
- [x] Termin-Details: Raum mit TUW-Maps-Link und Adresse (Raumliste aus better-tiss-calendar), Link zur LVA in TISS
- [x] „Heute“ und Mini-Fenster zeigen die nächsten Termine, mit „in 25 min“ / „läuft“
- [x] Eigene Termine (Lerngruppe, Lernblöcke …): einmalig oder jede Woche bis zu einem Tag, mit Fach und Ort; anlegen über „+ Termin“ oder durch Aufziehen im Kalender; einzelne Termine per Ziehen verschieben und verlängern; bei Serien einen einzelnen Tag oder die ganze Serie löschen (`events.json`)
- [x] Kalender auch ohne TISS nutzbar (für eigene Termine), mit Hinweis zum Verbinden
- [x] TISS-Termine haben jetzt stabile Kennungen: der vordere Teil der TISS-UID ändert sich bei jedem Abruf, sout nimmt nur den hinteren

### Phase 2 – Abgaben & Tests (TUWEL) ✅ (Anmeldung wird noch beobachtet)

- [x] TU-Login in eigenem Fenster wie die Moodle-App: `admin/tool/mobile/launch.php` → TU-Wien-Login → `moodlemobile://token=…` (Signatur geprüft), Token verschlüsselt gespeichert
- [x] Daten über die Moodle-Schnittstelle: Zeitleiste (`core_calendar_get_action_events_by_timesort`), Abgaben (`mod_assign_get_assignments`, `mod_assign_get_submission_status`), Tests (`mod_quiz_get_quizzes_by_courses`); Sync beim Start, alle 30 Minuten, nach dem Aufwachen
- [x] Seite „Abgaben“ in zwei Teilen: „Jetzt offen“ (das Dringendste zuerst, mit Tagesüberschriften) und „Noch nicht offen“ (mit „öffnet …“, sortiert nach Öffnungszeit); dazu „Erledigt“
- [x] TUWEL meldet Öffnen und Schließen eines Tests als zwei Einträge – sout macht daraus eine Aufgabe
- [x] Pro Eintrag: was (Titel, Beschreibung), bis wann (Countdown, letzte Abgabemöglichkeit), wie (Datei-Upload, Online-Text, Dateitypen, Zeitlimit), wo (Direktlink zur Aktivität), Status (offen / Entwurf)
- [x] Abgegebenes verschwindet automatisch (TUWEL-Zeitleiste); in sout abhaken; eigene To-dos mit Datum und Fach
- [x] Deadlines im Kalender (ganztägige Zeile), auf „Heute“ und im Mini-Fenster
- [x] Erinnerungen als Benachrichtigung, einstellbar: 3 Tage / 1 Tag / 3 Stunden / 1 Stunde vorher; dazu „jetzt offen“, sobald etwas aufmacht (abschaltbar)
- [x] Mit echtem TUWEL-Login getestet: Login und erste Synchronisierung klappen
- [x] Stille Token-Erneuerung bei jeder Synchronisierung, Login übersteht Neustarts, Benachrichtigung wenn neu anmelden nötig
- [ ] Beobachten, wie lange die stille Erneuerung ohne neuen Login hält (Protokoll: `tokenLog` in `~/.config/sout/tuwel.json`)
- [ ] Prüfen, ob TUWEL bei Tests den Öffnungszeitpunkt liefert (`--dump-tuwel`)
- [ ] Klären, warum nach dem manuellen Login erst die Erneuerung im Hintergrund den Token bekommt (Protokoll: `loginTrace` in `tuwel.json`; beim letzten Login kam keine Fehlermeldung, seither war kein neuer Login nötig – die stille Erneuerung klappt seit 7.10. 22:20 bei jeder Synchronisierung)

### Phase 3 – Notizen ✅

- [x] Notizordner frei wählbar (Vorschlag `~/Studium`), eingerichtet erst nach Klick; änderbar in den Einstellungen
- [x] Pro Fach ein Ordner, nach Semester geordnet (`2026W/<Fach> (<LVA-Nr>)/`), automatisch für jedes Fach aus dem TISS-Kalender – jeder nur einmal, ein gelöschter kommt nicht wieder; frühere Semester stehen in der Liste unter „Weitere Ordner“
- [x] Markdown-Editor (CodeMirror 6) mit Live-Ansicht daneben, oder nur Schreiben / nur Lesen; LaTeX-Formeln (KaTeX), Code mit Hervorhebung, Tabellen, Checklisten (in der Ansicht abhakbar); Formatieren per Leiste und Tastenkürzel
- [x] Speichert von selbst; beim Schließen des Fensters wird der letzte Stand noch gesichert
- [x] Änderungen von außen (anderer Editor, Sync) erscheinen in sout; wurde gleichzeitig in sout geschrieben, fragt sout nach („Meine Fassung speichern“ / „Andere Fassung laden“) statt zu überschreiben
- [x] PDFs: Folien pro Fach ablegen (Dialog oder ins Fenster ziehen) und neben der Notiz öffnen (Chromiums eingebaute PDF-Ansicht)
- [x] Vorlagen: Vorlesungsmitschrift (Datum, Zeit und Raum aus dem Kalender), Übung, Zusammenfassung zur Prüfungsvorbereitung (mit dem nächsten Prüfungstermin), leer
- [x] Verknüpfungen: Termin → „Mitschrift anlegen/öffnen“, Abgabe → „Notizen anlegen/öffnen“; eine laufende Vorlesung steht oben in der Notizliste
- [x] Volltextsuche (auch über Dateinamen), Tags mit `#tag`
- [x] Schnellnotiz aus dem Mini-Fenster → Inbox, später per „In Fach verschieben“ einordnen
- [x] Im Alltag ausprobiert: Notizen und PDFs klappen
- [x] Liste, Notiz, Vorschau und PDF lassen sich in der Breite verschieben (Trennlinien ziehen; Doppelklick setzt zurück)

```
~/Studium/
├── Inbox/                     ← Schnellnotizen
└── 2026W/Analysis (123.456)/
    ├── _fach.md               ← LVA-Infos & Links
    ├── Vorlesung/2026-10-07.md
    ├── Übung/
    ├── Prüfung/
    └── Folien/                ← PDFs
```

### Phase 4 – Feinschliff ✅

- [x] Mini-Fenster als Tagesübersicht: Tagesplan (Termine und Abgaben von heute der Reihe nach, „jetzt“-Linie, Vergangenes blass; ist der Tag vorbei, der nächste), nächste Abgaben, Schnellnotiz
- [x] Symbol zeigt Dringendes an: roter Punkt (macOS: Anzahl), wenn in den nächsten 24 Stunden etwas fällig ist
- [x] Meldungen bei Änderungen, als Benachrichtigung und auf „Heute“ unter „Neuigkeiten“ (bis zum Wegklicken, höchstens zwei Wochen): Raumwechsel, verschobene und entfallene Termine der nächsten zwei Wochen, neue Termine, neue Prüfungstermine (TISS); neue Abgaben und Tests, neue Bewertungen (TUWEL, Bewertungen alle zwei Stunden); jede Art in den Einstellungen abschaltbar
- [x] Pakete mit electron-builder: AppImage (gebaut und getestet) und RPM (`npm run dist:linux`, braucht `rpm-build`); Autostart zeigt beim AppImage auf die Datei selbst
- [x] Seitenleiste links einklappbar (nur Symbole) und in der Breite verstellbar
- [x] „Heute“: Abgabedaten bleiben in der Kachel, auch bei langen Titeln (ebenso im Mini-Fenster)
- [x] `npm run smoke`: Testlauf mit erfundenen Daten, für alle Systeme

### Phase 5 – Windows & Mac (zum Schluss)

Gestartet würde sout dort schon, und Kalender, Abgaben und Einstellungen funktionieren; die Desktop-Einbindung ist aber auf Linux/GNOME gebaut:

- [x] Autostart über die Systemfunktion (`app.setLoginItemSettings`) statt der Linux-`.desktop`-Datei
- [x] macOS: App-Menü mit „Bearbeiten“, damit Cmd+C/V/X/A in Eingabefeldern funktionieren; Cmd+Q/W; Dock-Symbol nur, solange das Hauptfenster offen ist
- [x] Tray-Symbol je System: macOS als „Template“-Bild (Menüleiste färbt es selbst), Windows mit blauem Hintergrund (auf heller und dunkler Taskleiste sichtbar); macOS öffnet das Menü per Rechtsklick
- [x] Mini-Fenster dort öffnen, wo das Symbol sitzt (Windows/macOS sagen beim Klick, wo es ist; Windows sonst unten rechts)
- [x] Windows: App-Kennung (`app.setAppUserModelId`), damit Benachrichtigungen erscheinen
- [x] Texte je System (Taskleiste/Menüleiste/Leiste, Schlüsselbund, Strg/Cmd); GNOME-Hinweise und `install-desktop` nur unter Linux
- [x] Installer: Windows (NSIS), macOS (.dmg/.zip für Apple Silicon und Intel), nicht signiert; Anleitung in der README
- [x] GitHub-Ablauf „Bauen & testen“ (von Hand starten): baut auf echten Linux-, Windows- und Mac-Rechnern, lässt dort den Testlauf laufen, Installer und Screenshots zum Herunterladen
- [ ] Ablauf „Bauen & testen“ einmal auf GitHub laufen lassen und die Windows-/Mac-Screenshots ansehen
- [ ] Auf echten Windows- und Mac-Rechnern ausprobieren (Tray, Autostart, Benachrichtigungen)

### Später & Ideen (ganz am Ende, nach Phase 5)

Hier sammelt sich alles, was „später“ kommen soll, damit nichts verloren geht. Neue Ideen kommen auch hierher. Meldungen bei Raumwechsel, Absage, neuer Aufgabe oder Note stehen schon in Phase 4.

Kalender

- [ ] Link zum TUWEL-Kurs
- [ ] LectureTube-Link
- [ ] Überschneidungen markieren

Abgaben & Tests

- [ ] Kreuzerlübungen genauer (was ist angekreuzt)
- [ ] Terminbuchungen für Abgabegespräche
- [ ] Noten und Feedback ansehen
- [ ] Forum-Ankündigungen
- [ ] Raum bei Präsenztests aus TISS

Notizen

- [ ] Bilder per Strg+V
- [ ] Links zwischen Notizen
- [ ] TUWEL-Unterlagen automatisch laden
- [ ] PDF-Export
- [ ] Karteikarten
- [ ] Rechtschreibprüfung (zurzeit aus, sonst wären Formeln rot unterstrichen)

Sonstiges

- [ ] Lernplaner (vom Prüfungstermin rückwärts Lernblöcke einplanen)
- [ ] Lernzeit pro Fach
- [ ] ECTS- und Notenübersicht
- [ ] Mensa-Plan

## Offene Punkte

- Anmeldefristen (LVA, Gruppe, Prüfung) stehen nicht im TISS-Feed (geprüft 7.10.2026: nur COURSE, GROUP, EXAM_SLOT, HOLIDAY).
- Liefert die TUWEL-Schnittstelle Kreuzerlübungen und Terminbuchungen?
- TISS meldet abgesagte Termine (vermutlich) nur, indem sie aus dem Feed verschwinden – sout sagt deshalb „steht nicht mehr im TISS-Kalender“; verschwinden mehr als drei Termine eines Fachs auf einmal, kommt eine Zusammenfassung („abgemeldet oder abgesagt?“).
- macOS kann Anmeldeobjekten keine Startparameter mitgeben; ob sout beim Anmelden gestartet wurde, erkennt es dort nur, solange macOS das noch meldet (`wasOpenedAtLogin`).
